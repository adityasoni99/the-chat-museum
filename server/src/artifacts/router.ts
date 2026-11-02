import { Router, type NextFunction, type Request, type Response } from 'express'
import type { Server } from 'socket.io'
import { TwitchIntegration } from '../twitch/TwitchIntegration.js'
import { cookieValue, CURATOR_SESSION_COOKIE } from '../twitch/router.js'
import { ArtifactStore, isDuplicateSourceMessage } from './ArtifactStore.js'
import { artifactCategories, type ArtifactCategory, type ArtifactStatus } from './types.js'

export function createArtifactRouter(
  store: ArtifactStore,
  twitch: TwitchIntegration,
  io: Server,
  clientOrigin: string,
) {
  const router = Router()

  const requireSameOrigin = (request: Request, response: Response, next: NextFunction) => {
    const origin = request.get('origin')
    if (origin && origin !== clientOrigin) {
      response.status(403).json({ error: 'This request origin is not allowed.' })
      return
    }
    next()
  }

  const requireCurator = (request: Request, response: Response, next: NextFunction) => {
    if (!twitch.isCuratorSession(cookieValue(request, CURATOR_SESSION_COOKIE))) {
      response.status(401).json({ error: 'Connect your curator Twitch account to manage artifacts.' })
      return
    }
    next()
  }

  router.get('/', (request, response) => {
    const status = request.query.status
    if (status !== 'pending' && status !== 'published') {
      response.status(400).json({ error: 'Choose pending or published artifacts.' })
      return
    }
    if (status === 'pending' && !twitch.isCuratorSession(cookieValue(request, CURATOR_SESSION_COOKIE))) {
      response.status(401).json({ error: 'Connect your curator Twitch account to view pending nominations.' })
      return
    }
    response.json({ artifacts: store.list(status as ArtifactStatus) })
  })

  router.post('/', requireSameOrigin, requireCurator, (request, response) => {
    const sourceMessageId = typeof request.body?.sourceMessageId === 'string' ? request.body.sourceMessageId.trim() : ''
    const title = typeof request.body?.title === 'string' ? request.body.title.trim() : ''
    const story = typeof request.body?.story === 'string' ? request.body.story.trim() : ''
    const category = request.body?.category

    if (!sourceMessageId || sourceMessageId.length > 128) {
      response.status(400).json({ error: 'Select a real Twitch message before nominating an artifact.' })
      return
    }
    if (title.length < 3 || title.length > 120) {
      response.status(400).json({ error: 'Artifact title must be between 3 and 120 characters.' })
      return
    }
    if (story.length < 10 || story.length > 2400) {
      response.status(400).json({ error: 'Story or context must be between 10 and 2400 characters.' })
      return
    }
    if (!artifactCategories.includes(category as ArtifactCategory)) {
      response.status(400).json({ error: 'Choose a valid exhibit category.' })
      return
    }
    if (!twitch.status.authenticated) {
      response.status(401).json({ error: 'Reconnect the curator Twitch account before nominating.' })
      return
    }

    const sourceMessage = twitch.getReceivedMessage(sourceMessageId)
    if (!sourceMessage || sourceMessage.channelLogin.toLowerCase() !== twitch.status.channelLogin?.toLowerCase()) {
      response.status(404).json({ error: 'That Twitch message is no longer in the recent live transcript. Select a current message and try again.' })
      return
    }

    try {
      const artifact = store.createPending({ title, story, category: category as ArtifactCategory }, sourceMessage)
      io.emit('artifacts:updated', { status: artifact.status })
      response.status(201).json({ artifact })
    } catch (error) {
      if (isDuplicateSourceMessage(error)) {
        response.status(409).json({ error: 'That Twitch message has already been nominated.' })
        return
      }
      console.error('Could not save artifact nomination:', error instanceof Error ? error.message : 'unknown error')
      response.status(500).json({ error: 'The museum could not save this nomination. Try again.' })
    }
  })

  router.post('/:id/publish', requireSameOrigin, requireCurator, (request, response) => {
    const id = request.params.id
    if (typeof id !== 'string') {
      response.status(400).json({ error: 'Invalid artifact identifier.' })
      return
    }
    const existing = store.getById(id)
    if (!existing) {
      response.status(404).json({ error: 'Artifact nomination not found.' })
      return
    }
    if (existing.status === 'published') {
      response.json({ artifact: existing })
      return
    }
    const artifact = store.publish(id)
    if (!artifact) {
      response.status(500).json({ error: 'The museum could not publish this exhibit.' })
      return
    }
    io.emit('artifacts:updated', { status: artifact.status })
    response.json({ artifact })
  })

  return router
}
