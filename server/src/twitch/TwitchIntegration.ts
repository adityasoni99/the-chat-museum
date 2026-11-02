import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Server, Socket } from 'socket.io'
import type { ChatConnectionState, LiveChatMessage, TwitchStatus, TwitchTokenResponse, ValidatedToken } from './types.js'

type TokenSet = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; login: string; displayName: string }
type EventSubEnvelope = { metadata?: { message_type?: string; message_id?: string; message_timestamp?: string }; payload?: Record<string, unknown> }
type EventSubSocketRole = 'primary' | 'migration'

const TWITCH_AUTH = 'https://id.twitch.tv/oauth2'
const TWITCH_API = 'https://api.twitch.tv/helix'
const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws'
const REQUIRED_SCOPE = 'user:read:chat'
const MAX_HISTORY = 100

export class TwitchIntegration {
  private tokens: TokenSet | null = null
  private curatorSessionId: string | null = null
  private readonly history: LiveChatMessage[] = []
  private readonly seenIds = new Set<string>()
  private validationTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private manualStop = true
  private primarySocket: WebSocket | null = null
  private migrationSocket: WebSocket | null = null
  private currentState: TwitchStatus

  constructor(
    private readonly io: Server,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {
    this.currentState = {
      configured: Boolean(clientId && clientSecret), authenticated: false,
      channelName: null, channelLogin: null, chatStatus: 'disconnected', error: null, messageCount: 0,
    }
  }

  get status(): TwitchStatus { return { ...this.currentState } }
  get recentMessages(): LiveChatMessage[] { return [...this.history] }
  get isConfigured(): boolean { return this.currentState.configured }
  getReceivedMessage(id: string): LiveChatMessage | null { return this.history.find((message) => message.id === id) ?? null }

  attachSocket(socket: Socket) {
    socket.emit('twitch:status', this.status)
    socket.emit('twitch:history', this.recentMessages)
  }

  async completeOAuth(code: string): Promise<string> {
    if (!this.isConfigured) throw new Error('Twitch is not configured yet. Add the Twitch app credentials to server/.env.')
    const token = await this.exchangeCode(code)
    const validated = await this.validateAccessToken(token.access_token)
    if (validated.client_id !== this.clientId) throw new Error('Twitch returned a token for a different application.')
    if (!validated.scopes.includes(REQUIRED_SCOPE)) throw new Error('Twitch authorization did not grant user:read:chat. Please reconnect and approve chat access.')

    const profile = await this.fetchUser(token.access_token, validated.user_id)
    await this.stopChat()
    this.tokens = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      userId: validated.user_id,
      login: validated.login,
      displayName: profile.display_name || validated.login,
    }
    this.curatorSessionId = randomBytes(32).toString('base64url')
    this.setState({ authenticated: true, channelName: this.tokens.displayName, channelLogin: this.tokens.login, error: null, chatStatus: 'disconnected' })
    this.scheduleValidation()
    return this.curatorSessionId
  }

  isCuratorSession(sessionId: string | null): boolean {
    return Boolean(this.tokens && this.currentState.authenticated && sessionId && this.curatorSessionId && TwitchIntegration.statesMatch(this.curatorSessionId, sessionId))
  }

  async startChat() {
    if (!this.tokens) throw new Error('Connect your Twitch account before starting live chat.')
    if (!this.isConfigured) throw new Error('Twitch is not configured yet. Add the Twitch app credentials to server/.env.')
    await this.validateOrRefresh()
    this.manualStop = false
    this.reconnectAttempts = 0
    this.clearRetry()
    this.closeSockets()
    this.setState({ chatStatus: 'connecting', error: null })
    this.openSocket(EVENTSUB_URL, 'primary')
  }

  stopChat() {
    this.manualStop = true
    this.clearRetry()
    this.closeSockets()
    this.setState({ chatStatus: 'disconnected' })
  }

  async disconnect() {
    this.stopChat()
    this.clearValidation()
    const activeToken = this.tokens?.accessToken
    this.tokens = null
    this.curatorSessionId = null
    this.history.splice(0)
    this.seenIds.clear()
    this.io.emit('twitch:history', [])
    if (activeToken && this.isConfigured) {
      try {
        await fetch(`${TWITCH_AUTH}/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: this.clientId, token: activeToken }),
        })
      } catch { /* Local disconnect still succeeds if Twitch is unreachable. */ }
    }
    this.setState({ authenticated: false, channelName: null, channelLogin: null, chatStatus: 'disconnected', error: null, messageCount: 0 })
  }

  private async exchangeCode(code: string): Promise<TwitchTokenResponse> {
    const response = await fetch(`${TWITCH_AUTH}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, code, grant_type: 'authorization_code', redirect_uri: this.redirectUri }),
    })
    if (!response.ok) throw new Error('Twitch could not complete sign-in. Check the registered callback URL and try again.')
    return response.json() as Promise<TwitchTokenResponse>
  }

  private async validateAccessToken(accessToken: string): Promise<ValidatedToken> {
    const response = await fetch(`${TWITCH_AUTH}/validate`, { headers: { Authorization: `OAuth ${accessToken}` } })
    if (!response.ok) throw new Error('Twitch authorization is invalid or expired. Please connect again.')
    return response.json() as Promise<ValidatedToken>
  }

  private async fetchUser(accessToken: string, userId: string): Promise<{ display_name: string }> {
    const response = await fetch(`${TWITCH_API}/users?id=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': this.clientId },
    })
    if (!response.ok) throw new Error('Twitch sign-in succeeded, but channel details could not be loaded.')
    const body = await response.json() as { data?: { display_name?: string }[] }
    return { display_name: body.data?.[0]?.display_name ?? '' }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens) throw new Error('Connect your Twitch account again to continue.')
    const response = await fetch(`${TWITCH_AUTH}/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'refresh_token', refresh_token: this.tokens.refreshToken }),
    })
    if (!response.ok) throw new Error('Twitch authorization expired. Disconnect and reconnect your account.')
    const refreshed = await response.json() as TwitchTokenResponse
    this.tokens.accessToken = refreshed.access_token
    this.tokens.refreshToken = refreshed.refresh_token
    this.tokens.expiresAt = Date.now() + refreshed.expires_in * 1000
  }

  private async validateOrRefresh(): Promise<void> {
    if (!this.tokens) throw new Error('Connect your Twitch account again to continue.')
    try {
      const validation = await this.validateAccessToken(this.tokens.accessToken)
      if (validation.client_id !== this.clientId || validation.user_id !== this.tokens.userId || !validation.scopes.includes(REQUIRED_SCOPE)) {
        throw new Error('Twitch authorization no longer has the permissions needed for chat. Please reconnect.')
      }
    } catch (error) {
      if (this.tokens && Date.now() < this.tokens.expiresAt && error instanceof Error && !error.message.includes('invalid or expired')) throw error
      await this.refreshAccessToken()
      const validation = await this.validateAccessToken(this.tokens.accessToken)
      if (validation.client_id !== this.clientId || validation.user_id !== this.tokens.userId || !validation.scopes.includes(REQUIRED_SCOPE)) {
        throw new Error('Twitch authorization no longer has the permissions needed for chat. Please reconnect.')
      }
    }
  }

  private scheduleValidation() {
    this.clearValidation()
    this.validationTimer = setInterval(() => {
      void this.validateOrRefresh().catch(() => {
        this.stopChat()
        this.tokens = null
        this.curatorSessionId = null
        this.setState({ authenticated: false, channelName: null, channelLogin: null, error: 'Twitch authorization expired or was revoked. Please connect again.' })
      })
    }, 60 * 60 * 1000)
    this.validationTimer.unref?.()
  }

  private clearValidation() {
    if (this.validationTimer) clearInterval(this.validationTimer)
    this.validationTimer = null
  }

  private openSocket(url: string, role: EventSubSocketRole, oldSocket?: WebSocket) {
    if (this.manualStop) return
    let socket: WebSocket
    try { socket = new WebSocket(url) } catch {
      this.scheduleReconnect()
      return
    }
    if (role === 'primary') this.primarySocket = socket
    else this.migrationSocket = socket

    socket.addEventListener('message', (rawEvent) => {
      let envelope: EventSubEnvelope
      try { envelope = JSON.parse(String(rawEvent.data)) as EventSubEnvelope } catch { return }
      const type = envelope.metadata?.message_type
      const payload = envelope.payload ?? {}

      if (type === 'session_welcome') {
        if (role === 'migration') {
          this.primarySocket = socket
          this.migrationSocket = null
          oldSocket?.close(1000, 'EventSub session migrated')
          this.reconnectAttempts = 0
          this.setState({ chatStatus: 'live', error: null })
        } else {
          void this.subscribeToChat(String((payload.session as { id?: string } | undefined)?.id ?? ''), socket)
        }
      } else if (type === 'session_reconnect') {
        const reconnectUrl = (payload.session as { reconnect_url?: string } | undefined)?.reconnect_url
        if (reconnectUrl) this.openSocket(reconnectUrl, 'migration', socket)
      } else if (type === 'notification') {
        const subscription = payload.subscription as { type?: string } | undefined
        if (subscription?.type === 'channel.chat.message') this.receiveChatMessage(payload.event as Record<string, unknown>, envelope.metadata?.message_timestamp)
      } else if (type === 'revocation') {
        const subscription = payload.subscription as { status?: string } | undefined
        this.fail(`Twitch stopped the chat subscription (${subscription?.status ?? 'authorization revoked'}). Reconnect to continue.`)
      }
    })

    socket.addEventListener('close', () => {
      if (role === 'migration') {
        if (this.migrationSocket === socket) this.migrationSocket = null
        if (this.primarySocket?.readyState !== WebSocket.OPEN && !this.manualStop) this.scheduleReconnect()
      } else if (this.primarySocket === socket && !this.manualStop) {
        this.primarySocket = null
        this.setState({ chatStatus: 'reconnecting', error: 'Twitch chat disconnected. Reconnecting…' })
        this.scheduleReconnect()
      }
    })
    socket.addEventListener('error', () => {
      if (role === 'primary' && !this.manualStop) this.setState({ chatStatus: 'reconnecting', error: 'Having trouble reaching Twitch. Reconnecting…' })
    })
  }

  private async subscribeToChat(sessionId: string, socket: WebSocket) {
    if (!sessionId || !this.tokens || this.manualStop) return
    const requestSubscription = async () => fetch(`${TWITCH_API}/eventsub/subscriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.tokens!.accessToken}`, 'Client-Id': this.clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'channel.chat.message', version: '1',
        condition: { broadcaster_user_id: this.tokens!.userId, user_id: this.tokens!.userId },
        transport: { method: 'websocket', session_id: sessionId },
      }),
    })

    try {
      let response = await requestSubscription()
      if (response.status === 401) {
        await this.refreshAccessToken()
        response = await requestSubscription()
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string }
        throw new Error(body.message || `Twitch rejected the chat subscription (${response.status}).`)
      }
      if (socket === this.primarySocket && !this.manualStop) {
        this.reconnectAttempts = 0
        this.setState({ chatStatus: 'live', error: null })
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Could not subscribe to Twitch chat.')
    }
  }

  private receiveChatMessage(event: Record<string, unknown>, twitchTimestamp?: string) {
    if (typeof event.message_id !== 'string' || !event.message || typeof event.message !== 'object') return
    const messageId = event.message_id
    if (this.seenIds.has(messageId)) return
    const messageBody = event.message as { text?: string }
    const message: LiveChatMessage = {
      id: messageId,
      userId: typeof event.chatter_user_id === 'string' ? event.chatter_user_id : null,
      channelLogin: String(event.broadcaster_user_login ?? ''),
      channelId: typeof event.broadcaster_user_id === 'string' ? event.broadcaster_user_id : null,
      channelName: String(event.broadcaster_user_name ?? event.broadcaster_user_login ?? ''),
      userLogin: String(event.chatter_user_login ?? ''),
      userName: String(event.chatter_user_name ?? event.chatter_user_login ?? 'Viewer'),
      text: String(messageBody.text ?? ''),
      twitchTimestamp: twitchTimestamp ?? null,
      receivedAt: new Date().toISOString(),
      source: 'twitch',
    }
    this.seenIds.add(messageId)
    if (this.seenIds.size > MAX_HISTORY * 2) this.seenIds.delete(this.seenIds.values().next().value as string)
    this.history.push(message)
    if (this.history.length > MAX_HISTORY) this.history.shift()
    this.io.emit('twitch:message', message)
    this.setState({ messageCount: this.currentState.messageCount + 1 })
  }

  private scheduleReconnect() {
    if (this.manualStop || this.retryTimer) return
    this.reconnectAttempts += 1
    const delay = Math.min(30_000, 1000 * (2 ** Math.min(this.reconnectAttempts - 1, 5)))
    this.setState({ chatStatus: 'reconnecting' })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.manualStop) this.openSocket(EVENTSUB_URL, 'primary')
    }, delay)
    this.retryTimer.unref?.()
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private closeSockets() {
    const sockets = [this.primarySocket, this.migrationSocket]
    this.primarySocket = null
    this.migrationSocket = null
    for (const socket of sockets) {
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Chat disconnected by curator')
    }
  }

  private fail(message: string) {
    this.manualStop = true
    this.clearRetry()
    this.closeSockets()
    this.setState({ chatStatus: 'error', error: message })
  }

  private setState(update: Partial<TwitchStatus>) {
    this.currentState = { ...this.currentState, ...update }
    this.io.emit('twitch:status', this.status)
  }

  static statesMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected)
    const actualBuffer = Buffer.from(actual)
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
  }
}
