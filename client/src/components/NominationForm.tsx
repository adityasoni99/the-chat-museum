import { useState, type FormEvent } from 'react'
import type { ArtifactCategory, LiveTwitchMessage, MuseumArtifact } from '../types/artifacts'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const categories: ArtifactCategory[] = ['Community Legend', 'Streamer Achievement', 'Community Culture']

type Props = { message: LiveTwitchMessage; onClose: () => void; onCreated: (artifact: MuseumArtifact) => void }

export function NominationForm({ message, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [story, setStory] = useState('')
  const [category, setCategory] = useState<ArtifactCategory>('Community Legend')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiUrl}/api/artifacts`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceMessageId: message.id, title, story, category }),
      })
      const body = await response.json() as { artifact?: MuseumArtifact; error?: string }
      if (!response.ok || !body.artifact) throw new Error(body.error ?? 'The nomination could not be saved.')
      onCreated(body.artifact)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The nomination could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const timestamp = message.twitchTimestamp ?? message.receivedAt

  return (
    <div className="nomination-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="nomination-dialog" role="dialog" aria-modal="true" aria-labelledby="nomination-title">
        <button className="nomination-close" type="button" onClick={onClose} aria-label="Close nomination form">×</button>
        <p className="eyebrow">A REAL CHAT MESSAGE · PENDING REVIEW</p>
        <h2 id="nomination-title">Keep this <em>moment.</em></h2>
        <p className="nomination-intro">The original message is captured from Twitch and cannot be changed here. Add the context that makes it worth remembering.</p>
        <div className="nomination-source">
          <div><span>ORIGINAL MESSAGE · TWITCH</span><strong>{message.userName}</strong><p>{message.text}</p></div>
          <dl><div><dt>CHANNEL</dt><dd>{message.channelName} <small>(@{message.channelLogin})</small></dd></div><div><dt>CHAT TIME</dt><dd>{new Date(timestamp).toLocaleString()}</dd></div><div><dt>MESSAGE ID</dt><dd>{message.id}</dd></div></dl>
        </div>
        <form onSubmit={(event) => void submit(event)} className="nomination-form">
          <label>EXHIBIT TITLE<input required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give the moment a name" /></label>
          <label>STORY / CONTEXT<textarea required minLength={10} maxLength={2400} rows={4} value={story} onChange={(event) => setStory(event.target.value)} placeholder="What was happening around this message? Why should the community keep it?" /></label>
          <label>CATEGORY<select value={category} onChange={(event) => setCategory(event.target.value as ArtifactCategory)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          {error && <p className="twitch-error" role="alert">{error}</p>}
          <div className="nomination-form-actions"><button type="button" className="twitch-disconnect" disabled={busy} onClick={onClose}>CANCEL</button><button type="submit" className="twitch-primary" disabled={busy}>{busy ? 'SAVING...' : 'SAVE AS PENDING'}</button></div>
          <p className="nomination-footnote">Nominated artifacts are not exhibits until a curator publishes them.</p>
        </form>
      </section>
    </div>
  )
}
