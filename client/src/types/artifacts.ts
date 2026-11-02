export type ArtifactCategory = 'Community Legend' | 'Streamer Achievement' | 'Community Culture'
export type ArtifactStatus = 'pending' | 'published'

export type LiveTwitchMessage = {
  id: string
  userId: string | null
  userLogin: string
  userName: string
  channelId: string | null
  channelLogin: string
  channelName: string
  text: string
  twitchTimestamp: string | null
  receivedAt: string
  source: 'twitch'
}

export type MuseumArtifact = {
  id: string
  title: string
  story: string
  category: ArtifactCategory
  status: ArtifactStatus
  exhibitNumber: string | null
  sourceMessage: LiveTwitchMessage
  nominatedAt: string
  publishedAt: string | null
}
