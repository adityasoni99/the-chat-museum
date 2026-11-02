import type { MuseumArtifact } from '../types/artifacts'

type Props = { artifact: MuseumArtifact; onSelect: (artifact: MuseumArtifact) => void }

export function PublishedArtifactCard({ artifact, onSelect }: Props) {
  return (
    <button className="published-artifact-card" onClick={() => onSelect(artifact)} aria-label={`Open exhibit ${artifact.exhibitNumber}: ${artifact.title}`}>
      <div className="published-art"><span>EXHIBIT {artifact.exhibitNumber}</span><i aria-hidden="true">✳</i><small>PRESERVED FROM LIVE CHAT</small></div>
      <div className="published-copy"><p className="published-category">{artifact.category}</p><h3>{artifact.title}</h3><p className="published-story">{artifact.story}</p><div className="published-source"><span>CHAT MESSAGE BY {artifact.sourceMessage.userName}</span><span>{artifact.sourceMessage.channelName}</span></div></div>
    </button>
  )
}
