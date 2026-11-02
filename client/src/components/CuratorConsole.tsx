import { useCallback, useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { NominationForm } from './NominationForm'
import type { ArtifactStatus, LiveTwitchMessage, MuseumArtifact } from '../types/artifacts'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
type ChatState = 'disconnected' | 'connecting' | 'live' | 'reconnecting' | 'error'
type TwitchStatus = {
  configured: boolean
  authenticated: boolean
  channelName: string | null
  channelLogin: string | null
  chatStatus: ChatState
  error: string | null
  messageCount: number
}
const initialStatus: TwitchStatus = {
  configured: false, authenticated: false, channelName: null, channelLogin: null,
  chatStatus: 'disconnected', error: null, messageCount: 0,
}

type Props = { socket: Socket | null }

export function CuratorConsole({ socket }: Props) {
  const [status, setStatus] = useState<TwitchStatus>(initialStatus)
  const [messages, setMessages] = useState<LiveTwitchMessage[]>([])
  const [actionError, setActionError] = useState('')
  const [workflowNotice, setWorkflowNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [authNotice] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('twitch') === 'setup') return 'Add your Twitch app credentials to server/.env, then restart the server.'
    if (params.get('twitch') === 'error') {
      const reason = params.get('reason')
      return reason === 'denied' ? 'Twitch authorization was declined.' : reason === 'state' ? 'The sign-in check expired or did not match. Please try again.' : 'Twitch sign-in did not complete. Check the app callback URL and reconnect.'
    }
    if (params.get('twitch') === 'connected') return 'Twitch curator access is connected. Start chat to continue.'
    return ''
  })
  const [selectedMessage, setSelectedMessage] = useState<LiveTwitchMessage | null>(null)
  const [queueStatus, setQueueStatus] = useState<ArtifactStatus>('pending')
  const [artifacts, setArtifacts] = useState<MuseumArtifact[]>([])
  const [artifactError, setArtifactError] = useState('')
  const [loadingArtifacts, setLoadingArtifacts] = useState(false)

  const loadArtifacts = useCallback(async (targetStatus: ArtifactStatus = queueStatus) => {
    setLoadingArtifacts(true)
    setArtifactError('')
    try {
      const response = await fetch(`${apiUrl}/api/artifacts?status=${targetStatus}`, { credentials: 'include' })
      const body = await response.json() as { artifacts?: MuseumArtifact[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Could not load museum artifacts.')
      setArtifacts(body.artifacts ?? [])
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : 'Could not load museum artifacts.')
    } finally {
      setLoadingArtifacts(false)
    }
  }, [queueStatus])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    if (params.has('twitch')) window.history.replaceState({}, '', window.location.pathname + window.location.hash)
    const loadStatus = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/twitch/status`, { credentials: 'include' })
        if (!response.ok) throw new Error('Could not read Twitch connection status.')
        const nextStatus = await response.json() as TwitchStatus
        if (!active) return
        if (!nextStatus.authenticated) setArtifacts([])
        setStatus(nextStatus)
      } catch {
        if (active) setActionError('The museum server could not be reached. Start it with npm run dev.')
      }
    }
    void loadStatus()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!socket) return
    const onStatus = (next: TwitchStatus) => {
      setStatus(next)
      if (!next.authenticated) {
        setMessages([])
        setSelectedMessage(null)
        setArtifacts([])
      } else {
        void loadArtifacts(queueStatus)
      }
    }
    const onHistory = (history: LiveTwitchMessage[]) => setMessages(history.slice(-100))
    const onMessage = (message: LiveTwitchMessage) => setMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current
      return [...current, message].slice(-100)
    })
    const onArtifactsUpdated = () => { if (status.authenticated) void loadArtifacts() }
    socket.on('twitch:status', onStatus)
    socket.on('twitch:history', onHistory)
    socket.on('twitch:message', onMessage)
    socket.on('artifacts:updated', onArtifactsUpdated)
    socket.emit('twitch:sync')
    return () => {
      socket.off('twitch:status', onStatus)
      socket.off('twitch:history', onHistory)
      socket.off('twitch:message', onMessage)
      socket.off('artifacts:updated', onArtifactsUpdated)
    }
  }, [socket, status.authenticated, queueStatus, loadArtifacts])

  const performAction = async (path: string) => {
    setBusy(true)
    setActionError('')
    setWorkflowNotice('')
    try {
      const response = await fetch(`${apiUrl}/api/twitch/${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const body = await response.json() as TwitchStatus & { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'The Twitch request could not be completed.')
      if ('chatStatus' in body) setStatus(body)
      if (path === 'disconnect') {
        setMessages([])
        setArtifacts([])
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The Twitch request could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const publishArtifact = async (artifactId: string) => {
    setBusy(true)
    setArtifactError('')
    setWorkflowNotice('')
    try {
      const response = await fetch(`${apiUrl}/api/artifacts/${encodeURIComponent(artifactId)}/publish`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
      const body = await response.json() as { artifact?: MuseumArtifact; error?: string }
      if (!response.ok || !body.artifact) throw new Error(body.error ?? 'Could not publish this exhibit.')
      setWorkflowNotice(`Exhibit ${body.artifact.exhibitNumber} published to the museum collection.`)
      setQueueStatus('published')
      void loadArtifacts('published')
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : 'Could not publish this exhibit.')
    } finally {
      setBusy(false)
    }
  }

  const onNominated = (artifact: MuseumArtifact) => {
    setSelectedMessage(null)
    setQueueStatus('pending')
    setWorkflowNotice(`"${artifact.title}" saved as a pending nomination.`)
    void loadArtifacts('pending')
  }

  const isActive = status.chatStatus === 'live'
  const isStarting = status.chatStatus === 'connecting' || status.chatStatus === 'reconnecting'
  const stateLabel = status.chatStatus === 'live' ? 'LIVE' : status.chatStatus === 'connecting' ? 'CONNECTING' : status.chatStatus === 'reconnecting' ? 'RECONNECTING' : status.chatStatus === 'error' ? 'ATTENTION' : 'OFFLINE'

  return (
    <section className="curator-console" aria-labelledby="curator-title">
      <div className="curator-intro">
        <p className="eyebrow">THE CURATOR'S ROOM / LIVE CHANNEL</p>
        <h1 id="curator-title">Listen to your<br /><em>community.</em></h1>
        <p className="curator-lede">Select a real message from your Twitch chat, add its story, then review it before it joins the museum collection.</p>
      </div>

      <section className="twitch-connect-card" aria-label="Twitch channel connection">
        <div className="twitch-card-topline"><span className="twitch-glyph">t</span><span>TWITCH CHANNEL CONNECTION</span><span className={`twitch-state state-${status.chatStatus}`}><i />{stateLabel}</span></div>
        <div className="twitch-account-row">
          <div><p className="twitch-label">CONNECTED CHANNEL</p><strong>{status.authenticated ? `@${status.channelLogin}` : 'No channel connected'}</strong>{status.authenticated && <span className="channel-display-name">{status.channelName}</span>}</div>
          {status.authenticated && <div className="message-counter"><strong>{status.messageCount}</strong><span>MESSAGES RECEIVED</span></div>}
        </div>
        {status.error && <p className="twitch-error" role="status">{status.error}</p>}
        {authNotice && <p className="twitch-error" role="status">{authNotice}</p>}
        {actionError && <p className="twitch-error" role="alert">{actionError}</p>}
        {!status.configured && <div className="twitch-setup-note"><strong>Connect your Twitch developer app</strong><p>Copy <code>.env.example</code> to <code>server/.env</code> and add the Client ID and Client Secret from the Twitch Developer Console. Keep the secret on the server.</p><span>CALLBACK URL / http://localhost:3001/api/twitch/callback</span></div>}
        <div className="twitch-actions">
          {!status.authenticated ? <a className={`twitch-primary ${!status.configured ? 'is-disabled' : ''}`} href={status.configured ? `${apiUrl}/api/twitch/auth` : undefined} aria-disabled={!status.configured} onClick={(event) => { if (!status.configured) event.preventDefault() }}>CONNECT WITH TWITCH <span>↗</span></a> : <>
            <button className={`twitch-primary ${isActive ? 'is-stop' : ''}`} disabled={busy || isStarting} onClick={() => void performAction(isActive ? 'chat/stop' : 'chat/start')}>
              {busy ? 'PLEASE WAIT...' : isActive ? 'STOP LIVE CHAT' : isStarting ? `${stateLabel}...` : 'START LIVE CHAT'}
            </button>
            <button className="twitch-disconnect" disabled={busy} onClick={() => void performAction('disconnect')}>DISCONNECT TWITCH</button>
          </>}
        </div>
        <p className="twitch-permission-note">Permission requested: <code>user:read:chat</code> / read-only channel chat</p>
      </section>

      <section className="live-chat-panel" aria-labelledby="live-chat-title">
        <header className="live-chat-heading"><div><p className="eyebrow">THE ROOM, AS IT HAPPENS</p><h2 id="live-chat-title">Live chat <em>transcript</em></h2></div><span className="source-label"><i /> REAL TWITCH EVENTS ONLY</span></header>
        <div className="live-chat-feed" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 ? <div className="chat-empty"><span className="empty-orbit">✳</span><p>{isActive ? 'Connected and listening. The first real chat message will appear here.' : 'Your live transcript is waiting.'}</p><span>{isActive ? `LISTENING TO ${status.channelName ?? 'CHANNEL CHAT'}` : 'START LIVE CHAT TO RECEIVE ACTUAL CHANNEL MESSAGES'}</span></div> : messages.map((message) => (
            <article className="chat-message" key={message.id}>
              <time>{new Date(message.twitchTimestamp ?? message.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              <strong>{message.userName}</strong><p>{message.text}</p><span className="chat-message-source">TWITCH</span>
              <button className="nominate-message" disabled={!status.authenticated} title={!status.authenticated ? 'Connect the curator Twitch account first' : 'Nominate this Twitch message'} onClick={() => { setActionError(''); setSelectedMessage(message) }}>NOMINATE</button>
            </article>
          ))}
        </div>
        <footer className="live-chat-footer"><span>{status.authenticated ? `CHANNEL / ${status.channelName}` : 'NO CHANNEL CONNECTED'}</span><span>{messages.length} {messages.length === 1 ? 'MESSAGE' : 'MESSAGES'} IN THIS SESSION</span></footer>
      </section>

      <section className="curator-artifact-board" aria-labelledby="artifact-board-title">
        <div className="artifact-board-heading"><div><p className="eyebrow">THE CURATOR'S SHELF</p><h2 id="artifact-board-title">Nominations <em>&amp; exhibits.</em></h2></div><div className="artifact-board-tabs" role="tablist" aria-label="Curator artifact status">
          <button role="tab" aria-selected={queueStatus === 'pending'} className={queueStatus === 'pending' ? 'is-selected' : ''} onClick={() => { setQueueStatus('pending'); if (status.authenticated) void loadArtifacts('pending') }}>PENDING</button>
          <button role="tab" aria-selected={queueStatus === 'published'} className={queueStatus === 'published' ? 'is-selected' : ''} onClick={() => { setQueueStatus('published'); if (status.authenticated) void loadArtifacts('published') }}>PUBLISHED</button>
        </div></div>
        {workflowNotice && <p className="workflow-notice" role="status">{workflowNotice}</p>}
        {artifactError && <p className="twitch-error" role="alert">{artifactError}</p>}
        {!status.authenticated ? <div className="artifact-board-empty"><p>Connect the curator Twitch account to manage pending and published artifacts.</p></div> : loadingArtifacts ? <div className="artifact-board-empty"><p>Loading the archive...</p></div> : artifacts.length === 0 ? <div className="artifact-board-empty"><p>{queueStatus === 'pending' ? 'No pending nominations yet. Select a real chat message above to begin.' : 'No published exhibits yet. Approved artifacts will appear here and in the museum collection.'}</p></div> : <div className="nomination-list">{artifacts.map((artifact) => (
          <article className="nomination-record" key={artifact.id}>
            <div className="nomination-record-art"><span>{artifact.status === 'pending' ? 'PENDING' : `EXHIBIT ${artifact.exhibitNumber}`}</span><i aria-hidden="true">✳</i></div>
            <div className="nomination-record-copy"><p className="published-category">{artifact.category} / {artifact.status === 'pending' ? 'AWAITING CURATOR' : 'PUBLISHED EXHIBIT'}</p><h3>{artifact.title}</h3><p>{artifact.story}</p><blockquote>{artifact.sourceMessage.text}</blockquote><div className="published-source"><span>{artifact.sourceMessage.userName} / @{artifact.sourceMessage.userLogin}</span><span>{artifact.sourceMessage.channelName} / {new Date(artifact.sourceMessage.twitchTimestamp ?? artifact.sourceMessage.receivedAt).toLocaleString()}</span></div></div>
            {artifact.status === 'pending' && <button className="twitch-primary publish-button" disabled={busy} onClick={() => void publishArtifact(artifact.id)}>APPROVE &amp; PUBLISH</button>}
          </article>
        ))}</div>}
      </section>
      {selectedMessage && <NominationForm message={selectedMessage} onClose={() => setSelectedMessage(null)} onCreated={onNominated} />}
    </section>
  )
}
