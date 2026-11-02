import type { LiveChatMessage } from '../twitch/types.js'

export const artifactCategories = ['Community Legend', 'Streamer Achievement', 'Community Culture'] as const
export type ArtifactCategory = typeof artifactCategories[number]
export type ArtifactStatus = 'pending' | 'published'

export type ArtifactInput = {
  title: string
  story: string
  category: ArtifactCategory
}

export type MuseumArtifact = {
  id: string
  title: string
  story: string
  category: ArtifactCategory
  status: ArtifactStatus
  exhibitNumber: string | null
  sourceMessage: LiveChatMessage
  nominatedAt: string
  publishedAt: string | null
}
