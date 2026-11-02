type MuseumSection = 'museum' | 'collection' | 'about' | 'curator'

const links: { id: MuseumSection; label: string }[] = [
  { id: 'museum', label: 'The Museum' },
  { id: 'collection', label: 'Collection' },
  { id: 'about', label: 'About' },
  { id: 'curator', label: 'Curator' },
]

type Props = {
  activeSection: MuseumSection
  onNavigate: (section: MuseumSection) => void
  socketStatus: string
}

export type { MuseumSection }

export function MuseumHeader({ activeSection, onNavigate, socketStatus }: Props) {
  return (
    <header className="masthead">
      <button className="wordmark" onClick={() => onNavigate('museum')} aria-label="The Chat Museum home">
        <span className="wordmark-mark">CM</span><span>THE CHAT<br />MUSEUM</span>
      </button>
      <span className="edition">A living archive of live culture</span>
      <nav className="museum-nav" aria-label="Main navigation">
        {links.map((link) => (
          <button key={link.id} className={activeSection === link.id ? 'nav-link is-active' : 'nav-link'} onClick={() => onNavigate(link.id)}>
            {link.label}{link.id === 'curator' && <span className="nav-soon">NEXT</span>}
          </button>
        ))}
      </nav>
      <span className={`connection ${socketStatus === 'Connected' ? 'is-online' : ''}`}><span className="connection-dot" /> {socketStatus}</span>
    </header>
  )
}
