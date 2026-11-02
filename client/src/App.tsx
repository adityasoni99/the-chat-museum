import { useCallback, useEffect, useMemo, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { ArtifactCard } from './components/ArtifactCard'
import { ArtifactDetail } from './components/ArtifactDetail'
import { CuratorConsole } from './components/CuratorConsole'
import { MuseumHeader, type MuseumSection } from './components/MuseumHeader'
import { PublishedArtifactCard } from './components/PublishedArtifactCard'
import { PublishedArtifactDetail } from './components/PublishedArtifactDetail'
import { demoArtifacts, type Artifact } from './data/demoArtifacts'
import { filterArtifacts, type ArtifactFilter } from './data/filterArtifacts'
import type { MuseumArtifact } from './types/artifacts'
import './App.css'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const filters: ArtifactFilter[] = ['All', 'Community Legends', 'Streamer Moments', 'Community Culture']
const initialSection: MuseumSection = new URLSearchParams(window.location.search).get('section') === 'curator' ? 'curator' : 'museum'

function App() {
  const [serverStatus, setServerStatus] = useState('Connecting to the museum...')
  const [socketStatus, setSocketStatus] = useState('Connecting')
  const [socket, setSocket] = useState<Socket | null>(null)
  const [section, setSection] = useState<MuseumSection>(initialSection)
  const [filter, setFilter] = useState<ArtifactFilter>('All')
  const [search, setSearch] = useState('')
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [selectedPublishedArtifact, setSelectedPublishedArtifact] = useState<MuseumArtifact | null>(null)
  const [publishedArtifacts, setPublishedArtifacts] = useState<MuseumArtifact[]>([])
  const [publishedError, setPublishedError] = useState('')

  useEffect(() => {
    const connection = io(apiUrl, { reconnectionAttempts: 3, timeout: 3000, withCredentials: true })
    connection.on('connect', () => {
      setSocket(connection)
      setSocketStatus('Connected')
    })
    connection.on('connect_error', () => {
      setSocket(connection)
      setSocketStatus('Offline')
    })
    connection.on('museum:welcome', (payload: { message: string }) => setServerStatus(payload.message))
    return () => { connection.disconnect() }
  }, [])

  useEffect(() => {
    let active = true
    const refreshPublishedArtifacts = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/artifacts?status=published`, { credentials: 'include' })
        const body = await response.json() as { artifacts?: MuseumArtifact[]; error?: string }
        if (!response.ok) throw new Error(body.error ?? 'The published collection could not be loaded.')
        if (!active) return
        setPublishedArtifacts(body.artifacts ?? [])
        setPublishedError('')
      } catch (error) {
        if (!active) return
        setPublishedError(error instanceof Error ? error.message : 'The published collection could not be loaded.')
      }
    }

    void refreshPublishedArtifacts()
    socket?.on('artifacts:updated', refreshPublishedArtifacts)
    return () => {
      active = false
      socket?.off('artifacts:updated', refreshPublishedArtifacts)
    }
  }, [socket])

  useEffect(() => {
    fetch(`${apiUrl}/api/health`)
      .then((response) => { if (!response.ok) throw new Error('API unavailable'); return response.json() as Promise<{ status: string }> })
      .then((health) => setServerStatus(health.status === 'ok' ? 'Museum systems are ready.' : 'Museum is unavailable.'))
      .catch(() => setServerStatus('Museum server is offline. Start the project with npm run dev.'))
  }, [])

  const visibleArtifacts = useMemo(() => filterArtifacts(demoArtifacts, filter, search), [filter, search])
  const navigate = useCallback((next: MuseumSection) => {
    setSection(next)
    if (next === 'collection' || next === 'museum') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return (
    <main className="museum-shell">
      <MuseumHeader activeSection={section} onNavigate={navigate} socketStatus={socketStatus} />
      {section === 'museum' || section === 'collection' ? (
        <>
          {section === 'museum' && <section className="welcome" aria-labelledby="welcome-title">
            <p className="eyebrow"><span>*</span> THE INTERNET, REMEMBERED TOGETHER</p>
            <h1 id="welcome-title">Every chat has<br /><em>its moment.</em></h1>
            <p className="intro">A place for Twitch communities to keep the moments that made them laugh, cheer, and feel like they were there together.</p>
            <div className="welcome-meta"><span className="index-number">01 - THE COLLECTION BEGINS</span><span className="system-message">{serverStatus}</span></div>
          </section>}
          <section className="published-collection" aria-labelledby="published-collection-title">
            <div className="published-collection-heading"><div><p className="eyebrow">THE LIVING ARCHIVE / PUBLISHED FROM TWITCH CHAT</p><h2 id="published-collection-title">Kept <em>for good.</em></h2></div><p>Streamer-approved artifacts, preserved from actual messages sent in the channel.</p></div>
            {publishedError ? <p className="published-error" role="status">{publishedError}</p> : publishedArtifacts.length ? <div className="published-artifact-grid">{publishedArtifacts.map((artifact) => <PublishedArtifactCard key={artifact.id} artifact={artifact} onSelect={setSelectedPublishedArtifact} />)}</div> : <div className="published-empty">No Twitch chat artifacts have been published yet. Approved exhibits will be kept here.</div>}
          </section>
          <section id="collection" className="collection-section" aria-labelledby="collection-title">
            <div className="collection-heading">
              <div><p className="eyebrow collection-eyebrow">THE PERMANENT COLLECTION / {String(visibleArtifacts.length).padStart(2, '0')} EXHIBITS</p><h2 id="collection-title">Collected <em>moments.</em></h2></div>
              <p className="collection-intro">Small pieces of live culture, kept here because they mattered to the people who were there.</p>
            </div>
            <div className="demo-banner"><span className="demo-banner-mark">DEMO COLLECTION</span><span>Illustrative sample exhibits for visual testing. Messages, dates and recognition counts are fictional, not Twitch activity.</span></div>
            <div className="collection-tools">
              <div className="filter-list" role="group" aria-label="Filter exhibits by category">
                {filters.map((item) => <button key={item} className={filter === item ? 'filter-chip is-selected' : 'filter-chip'} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item}</button>)}
              </div>
              <label className="search-box"><span aria-hidden="true">SEARCH</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an exhibit" aria-label="Search by artifact title" /></label>
            </div>
            {visibleArtifacts.length > 0 ? <div className="artifact-grid">{visibleArtifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} onSelect={setSelectedArtifact} />)}</div> : <div className="empty-state"><span>?</span><p>No exhibits match that search.</p><button onClick={() => { setFilter('All'); setSearch('') }}>CLEAR SEARCH</button></div>}
            <div className="collection-endnote"><span>END OF THE DEMO COLLECTION</span><span>MORE MEMORIES WILL FIND THEIR PLACE</span></div>
          </section>
        </>
      ) : section === 'about' ? (
        <section className="editorial-page"><p className="eyebrow">WHY WE KEEP THINGS</p><h1>A moment is<br /><em>worth remembering.</em></h1><p className="editorial-copy">A stream is made of thousands of small moments. A joke that catches on. A challenge everyone watches together. A phrase that becomes part of the room. The Chat Museum gives communities a place to choose what stays.</p><div className="about-principle"><span>OUR PRINCIPLE / 01</span><p>The community makes the memory. The museum keeps it.</p></div><button className="return-button" onClick={() => navigate('collection')}>EXPLORE THE COLLECTION</button></section>
      ) : (
        <CuratorConsole socket={socket} />
      )}
      <footer className="page-footer"><span>MADE OF MOMENTS. KEPT BY EVERYONE.</span><span>EST. LIVE</span></footer>
      {selectedArtifact && <ArtifactDetail artifact={selectedArtifact} onClose={() => setSelectedArtifact(null)} />}
      {selectedPublishedArtifact && <PublishedArtifactDetail artifact={selectedPublishedArtifact} onClose={() => setSelectedPublishedArtifact(null)} />}
    </main>
  )
}

export default App
