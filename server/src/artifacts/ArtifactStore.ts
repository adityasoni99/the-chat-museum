import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LiveChatMessage } from '../twitch/types.js'
import type { ArtifactCategory, ArtifactInput, ArtifactStatus, MuseumArtifact } from './types.js'

type ArtifactRow = {
  id: string
  title: string
  story: string
  category: ArtifactCategory
  status: ArtifactStatus
  exhibit_number: string | null
  source_message_id: string
  source_user_id: string | null
  source_user_login: string
  source_username: string
  channel_id: string | null
  channel_login: string
  channel_name: string
  original_message: string
  twitch_timestamp: string
  received_at: string
  nominated_at: string
  published_at: string | null
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const databaseDirectory = resolve(moduleDirectory, '..', '..', 'data')

export class ArtifactStore {
  private readonly database: DatabaseSync

  constructor(databasePath = resolve(databaseDirectory, 'chat-museum.sqlite')) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true })
    this.database = new DatabaseSync(databasePath, { timeout: 5000 })
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 120),
        story TEXT NOT NULL CHECK(length(trim(story)) BETWEEN 10 AND 2400),
        category TEXT NOT NULL CHECK(category IN ('Community Legend', 'Streamer Achievement', 'Community Culture')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published')),
        exhibit_number TEXT UNIQUE,
        source_message_id TEXT NOT NULL UNIQUE,
        source_user_id TEXT,
        source_user_login TEXT NOT NULL,
        source_username TEXT NOT NULL,
        channel_id TEXT,
        channel_login TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        original_message TEXT NOT NULL,
        twitch_timestamp TEXT,
        received_at TEXT NOT NULL,
        nominated_at TEXT NOT NULL,
        published_at TEXT
      );
      CREATE INDEX IF NOT EXISTS artifacts_status_nominated_idx ON artifacts(status, nominated_at DESC);
    `)
  }

  createPending(input: ArtifactInput, source: LiveChatMessage): MuseumArtifact {
    const id = randomUUID()
    const nominatedAt = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO artifacts (
        id, title, story, category, status, source_message_id, source_user_id,
        source_user_login, source_username, channel_id, channel_login, channel_name,
        original_message, twitch_timestamp, received_at, nominated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.title.trim(), input.story.trim(), input.category, source.id,
      source.userId, source.userLogin, source.userName, source.channelId,
      source.channelLogin, source.channelName, source.text, source.twitchTimestamp,
      source.receivedAt, nominatedAt,
    )
    return this.getById(id)!
  }

  list(status: ArtifactStatus): MuseumArtifact[] {
    const rows = this.database.prepare('SELECT * FROM artifacts WHERE status = ? ORDER BY nominated_at DESC').all(status) as unknown as ArtifactRow[]
    return rows.map(toArtifact)
  }

  getById(id: string): MuseumArtifact | null {
    const row = this.database.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as unknown as ArtifactRow | undefined
    return row ? toArtifact(row) : null
  }

  publish(id: string): MuseumArtifact | null {
    const publishedAt = new Date().toISOString()
    this.database.prepare(`
      UPDATE artifacts
      SET status = 'published', published_at = ?,
          exhibit_number = printf('%03d', (SELECT COUNT(*) FROM artifacts WHERE status = 'published') + 1)
      WHERE id = ? AND status = 'pending'
    `).run(publishedAt, id)
    return this.getById(id)
  }

  close() { this.database.close() }
}

export function isDuplicateSourceMessage(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: artifacts.source_message_id')
}

function toArtifact(row: ArtifactRow): MuseumArtifact {
  return {
    id: row.id,
    title: row.title,
    story: row.story,
    category: row.category,
    status: row.status,
    exhibitNumber: row.exhibit_number,
    sourceMessage: {
      id: row.source_message_id,
      userId: row.source_user_id,
      userLogin: row.source_user_login,
      userName: row.source_username,
      channelId: row.channel_id,
      channelLogin: row.channel_login,
      channelName: row.channel_name,
      text: row.original_message,
      twitchTimestamp: row.twitch_timestamp,
      receivedAt: row.received_at,
      source: 'twitch',
    },
    nominatedAt: row.nominated_at,
    publishedAt: row.published_at,
  }
}
