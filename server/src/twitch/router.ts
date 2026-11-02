import { randomBytes } from 'node:crypto'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { TwitchIntegration } from './TwitchIntegration.js'

const STATE_COOKIE = 'chat_museum_oauth_state'
export const CURATOR_SESSION_COOKIE = 'chat_museum_curator_session'

export function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.cookie?.split(';') ?? []
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split('=')
    if (key === name) {
      try { return decodeURIComponent(parts.join('=')) } catch { return null }
    }
  }
  return null
}

function frontendUrl(origin: string, query: string): string {
  return `${origin.replace(/\/$/, '')}/?${query}`
}

export function createTwitchRouter(
  twitch: TwitchIntegration,
  options: { clientId: string; redirectUri: string; clientOrigin: string; production: boolean },
) {
  const router = Router()
  const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: options.production, path: '/api/twitch/callback', maxAge: 10 * 60 * 1000 }
  const sessionCookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: options.production, path: '/api', maxAge: 30 * 24 * 60 * 60 * 1000 }

  const requireSameOrigin = (request: Request, response: Response, next: NextFunction) => {
    const origin = request.get('origin')
    if (origin && origin !== options.clientOrigin) {
      response.status(403).json({ error: 'This request origin is not allowed.' })
      return
    }
    next()
  }

  const requireCuratorSession = (request: Request, response: Response, next: NextFunction) => {
    if (!twitch.isCuratorSession(cookieValue(request, CURATOR_SESSION_COOKIE))) {
      response.status(401).json({ error: 'Connect your curator Twitch account to manage artifacts.' })
      return
    }
    next()
  }

  router.get('/status', (_request, response) => response.json(twitch.status))

  router.get('/auth', (_request, response) => {
    if (!twitch.isConfigured) {
      response.redirect(frontendUrl(options.clientOrigin, 'section=curator&twitch=setup'))
      return
    }
    const state = randomBytes(32).toString('hex')
    response.cookie(STATE_COOKIE, state, cookieOptions)
    const authorize = new URL('https://id.twitch.tv/oauth2/authorize')
    authorize.search = new URLSearchParams({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      scope: 'user:read:chat',
      state,
    }).toString()
    response.redirect(authorize.toString())
  })

  router.get('/callback', async (request, response) => {
    const stateFromCookie = cookieValue(request, STATE_COOKIE)
    response.clearCookie(STATE_COOKIE, cookieOptions)
    const stateFromQuery = typeof request.query.state === 'string' ? request.query.state : ''
    if (!stateFromCookie || !stateFromQuery || !TwitchIntegration.statesMatch(stateFromCookie, stateFromQuery)) {
      response.redirect(frontendUrl(options.clientOrigin, 'section=curator&twitch=error&reason=state'))
      return
    }
    if (request.query.error) {
      response.redirect(frontendUrl(options.clientOrigin, 'section=curator&twitch=error&reason=denied'))
      return
    }
    const code = typeof request.query.code === 'string' ? request.query.code : ''
    if (!code) {
      response.redirect(frontendUrl(options.clientOrigin, 'section=curator&twitch=error&reason=callback'))
      return
    }
    try {
      const sessionId = await twitch.completeOAuth(code)
      response.cookie(CURATOR_SESSION_COOKIE, sessionId, sessionCookieOptions)
      response.redirect(frontendUrl(options.clientOrigin, 'section=curator&twitch=connected'))
    } catch (error) {
      console.error('Twitch OAuth callback failed:', error instanceof Error ? error.message : 'unknown error')
      response.redirect(frontendUrl(options.clientOrigin, 'section=curator&twitch=error&reason=authorization'))
    }
  })

  router.post('/chat/start', requireSameOrigin, requireCuratorSession, async (_request, response) => {
    try {
      await twitch.startChat()
      response.status(202).json(twitch.status)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start Twitch chat.'
      response.status(400).json({ error: message })
    }
  })

  router.post('/chat/stop', requireSameOrigin, requireCuratorSession, (_request, response) => {
    twitch.stopChat()
    response.json(twitch.status)
  })

  router.post('/disconnect', requireSameOrigin, requireCuratorSession, async (_request, response) => {
    await twitch.disconnect()
    response.clearCookie(CURATOR_SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined })
    response.json(twitch.status)
  })

  return router
}
