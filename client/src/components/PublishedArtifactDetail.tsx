import { useEffect } from 'react'
import type { MuseumArtifact } from '../types/artifacts'

type Props = { artifact: MuseumArtifact; onClose: () => void }

export function PublishedArtifactDetail({ artifact, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const messageTime = artifact.sourceMessage.twitchTimestamp ?? artifact.sourceMessage.receivedAt

  return (
    <div className="detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <article className="detail-panel published-detail" role="dialog" aria-modal="true" aria-labelledby="published-detail-title">
        <button className="detail-close" onClick={onClose} aria-label="Close exhibit">×</button>
        <div className="published-detail-art"><span>EXHIBIT {artifact.exhibitNumber}</span><i aria-hidden="true">✳</i><small>PRESERVED FROM LIVE CHAT</small></div>
        <div className="detail-copy">
          <p className="eyebrow">PUBLISHED EXHIBIT <span className="detail-category">· {artifact.category}</span></p>
          <h2 id="published-detail-title">{artifact.title}</h2>
          <p className="detail-story">{artifact.story}</p>
          <blockquote><span>ORIGINAL MESSAGE · TWITCH LIVE CHAT</span>{artifact.sourceMessage.text}</blockquote>
          <div className="detail-meta"><div><span>CHATTER</span><strong>{artifact.sourceMessage.userName} (@{artifact.sourceMessage.userLogin})</strong></div><div><span>CHANNEL</span><strong>{artifact.sourceMessage.channelName} (@{artifact.sourceMessage.channelLogin})</strong></div><div><span>MESSAGE TIME</span><strong>{new Date(messageTime).toLocaleString()}</strong></div><div><span>MESSAGE ID</span><strong>{artifact.sourceMessage.id}</strong></div><div><span>PUBLISHED</span><strong>{artifact.publishedAt ? new Date(artifact.publishedAt).toLocaleDateString() : 'Museum archive'}</strong></div></div>
          <button className="return-button" onClick={onClose}>← RETURN TO THE MUSEUM</button>
        </div>
      </article>
    </div>
  )
}
