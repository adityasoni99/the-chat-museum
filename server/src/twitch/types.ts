export type ChatConnectionState = 'disconnected' | 'connecting' | 'live' | 'reconnecting' | 'error'

export type TwitchStatus = {
  configured: boolean
  authenticated: boolean
  channelName: string | null
  channelLogin: string | null
  chatStatus: ChatConnectionState
  error: string | null
  messageCount: number
}

export type LiveChatMessage = {
  id: string
  userId: string | null
  channelLogin: string
  channelId: string | null
  channelName: string
  userLogin: string
  userName: string
  text: string
  twitchTimestamp: string | null
  receivedAt: string
  source: 'twitch'
}

export type TwitchTokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string[]
  token_type: string
}

export type ValidatedToken = {
  client_id: string
  login: string
  scopes: string[]
  user_id: string
  expires_in: number
}
