import type { Artifact } from '../data/demoArtifacts'

type Props = { artifact: Artifact; onSelect: (artifact: Artifact) => void }

export function ArtifactCard({ artifact, onSelect }: Props) {
  return (
    <button className="artifact-card" onClick={() => onSelect(artifact)} aria-label={`Open exhibit ${artifact.exhibitNumber}: ${artifact.title}`}>
      <div className={`artifact-art ${artifact.accent}`}>
        <span className="art-index">EXHIBIT {artifact.exhibitNumber}</span>
        <span className="art-motif" aria-hidden="true">{artifact.motif}</span>
        <span className="demo-stamp">DEMO</span>
        <span className="art-caption">A COMMUNITY MEMORY</span>
      </div>
      <div className="card-content">
        <div className="card-kicker"><span>{artifact.category}</span><span className="recognition">✳ {artifact.recognitionCount} <small>sample</small></span></div>
        <h3>{artifact.title}</h3>
        <p>{artifact.story}</p>
        <div className="card-footer"><span>KEPT BY {artifact.contributor}</span><span>{artifact.datePreserved}</span></div>
        <span className="card-open">VIEW EXHIBIT <span aria-hidden="true">↗</span></span>
      </div>
    </button>
  )
}
