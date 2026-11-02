import { useEffect } from 'react'
import type { Artifact } from '../data/demoArtifacts'

type Props = { artifact: Artifact; onClose: () => void }

export function ArtifactDetail({ artifact, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <article className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button className="detail-close" onClick={onClose} aria-label="Close exhibit">×</button>
        <div className={`detail-art artifact-art ${artifact.accent}`}>
          <span className="art-index">THE CHAT MUSEUM · EXHIBIT {artifact.exhibitNumber}</span><span className="art-motif" aria-hidden="true">{artifact.motif}</span><span className="demo-stamp">DEMO</span>
        </div>
        <div className="detail-copy">
          <p className="eyebrow">EXHIBIT {artifact.exhibitNumber} <span className="detail-category">· {artifact.category}</span></p>
          <h2 id="detail-title">{artifact.title}</h2>
          <p className="detail-story">{artifact.story}</p>
          <blockquote><span>ORIGINAL CHAT · ILLUSTRATIVE DEMO EXCERPT</span>{artifact.originalMessage}</blockquote>
          <div className="detail-meta"><div><span>CONTRIBUTED BY</span><strong>{artifact.contributor}</strong></div><div><span>PRESERVED</span><strong>{artifact.datePreserved}</strong></div><div><span>RECOGNITION</span><strong>{artifact.recognitionCount} sample marks</strong></div></div>
          <button className="return-button" onClick={onClose}>← RETURN TO COLLECTION</button>
          <p className="demo-note">DEMO ARTIFACT · This illustrative exhibit is not a real Twitch message or community activity.</p>
        </div>
      </article>
    </div>
  )
}
