import type { Artifact, ArtifactCategory } from './demoArtifacts'

export type ArtifactFilter = 'All' | 'Community Legends' | 'Streamer Moments' | 'Community Culture'

const categoryForFilter: Partial<Record<ArtifactFilter, ArtifactCategory>> = {
  'Community Legends': 'Community Legend',
  'Streamer Moments': 'Streamer Achievement',
  'Community Culture': 'Community Culture',
}

export function filterArtifacts(artifacts: Artifact[], filter: ArtifactFilter, search: string): Artifact[] {
  const category = categoryForFilter[filter]
  const titleQuery = search.trim().toLocaleLowerCase()
  return artifacts.filter((artifact) => {
    const matchesCategory = !category || artifact.category === category
    return matchesCategory && artifact.title.toLocaleLowerCase().includes(titleQuery)
  })
}
