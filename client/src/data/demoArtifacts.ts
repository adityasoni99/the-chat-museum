export type ArtifactCategory = 'Community Legend' | 'Streamer Achievement' | 'Community Culture'

export type Artifact = {
  id: string
  exhibitNumber: string
  title: string
  story: string
  category: ArtifactCategory
  originalMessage: string
  contributor: string
  datePreserved: string
  recognitionCount: number
  motif: string
  accent: string
}

// Visual-only sample content. Messages and recognition values below are fictional.
export const demoArtifacts: Artifact[] = [
  {
    id: 'potato-incident', exhibitNumber: '001', title: 'The Great Potato Incident',
    story: 'A viewer suggested replacing every in-game weapon with potatoes. The chat adopted the idea and turned it into the running joke of the stream. Before long, every close call became a potato emergency and every victory came with a side of starch.',
    category: 'Community Legend', originalMessage: '“what if every weapon was just a potato” — illustrative demo excerpt',
    contributor: 'sample_viewer', datePreserved: 'Demo date · 14 Mar 2025', recognitionCount: 128,
    motif: '✳', accent: 'potato',
  },
  {
    id: 'impossible-promise', exhibitNumber: '002', title: 'The Impossible Promise',
    story: 'The streamer promised to complete a challenge without taking damage. The community followed every attempt, holding its breath through each near miss. The promise became a shared ritual: one more try, one more moment the whole room leaned in.',
    category: 'Streamer Achievement', originalMessage: '“no damage run. I mean it this time.” — illustrative demo excerpt',
    contributor: 'sample_viewer', datePreserved: 'Demo date · 02 Jun 2025', recognitionCount: 94,
    motif: '◎', accent: 'promise',
  },
  {
    id: 'new-emote', exhibitNumber: '003', title: 'The Birth of a New Emote',
    story: 'An unexpected phrase became the unofficial expression of the evening. It appeared in chat after every surprising turn, then every small victory, until the whole community knew exactly when to use it.',
    category: 'Community Culture', originalMessage: '“that was so aggressively polite” — illustrative demo excerpt',
    contributor: 'sample_viewer', datePreserved: 'Demo date · 19 Aug 2025', recognitionCount: 76,
    motif: 'Aa', accent: 'emote',
  },
]
