import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { ArtifactStore } from './artifacts/ArtifactStore.js'
import { createArtifactRouter } from './artifacts/router.js'
import { TwitchIntegration } from './twitch/TwitchIntegration.js'
import { createTwitchRouter } from './twitch/router.js'

const port = Number(process.env.PORT ?? 3001)
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
const redirectUri = process.env.TWITCH_REDIRECT_URI ?? `http://localhost:${port}/api/twitch/callback`
const app = express()
const httpServer = createServer(app)

app.use(cors({ origin: clientOrigin, credentials: true }))
app.use(express.json())
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'chat-museum-api' })
})

const io = new Server(httpServer, { cors: { origin: clientOrigin, credentials: true } })
const twitch = new TwitchIntegration(
  io,
  process.env.TWITCH_CLIENT_ID ?? '',
  process.env.TWITCH_CLIENT_SECRET ?? '',
  redirectUri,
)

app.use('/api/twitch', createTwitchRouter(twitch, {
  clientId: process.env.TWITCH_CLIENT_ID ?? '',
  redirectUri,
  clientOrigin,
  production: process.env.NODE_ENV === 'production',
}))

const artifactStore = new ArtifactStore()
app.use('/api/artifacts', createArtifactRouter(artifactStore, twitch, io, clientOrigin))

io.on('connection', (socket) => {
  socket.emit('museum:welcome', { message: 'Connected to The Chat Museum server.' })
  twitch.attachSocket(socket)
  socket.on('twitch:sync', () => twitch.attachSocket(socket))
})

httpServer.listen(port, () => {
  console.log(`The Chat Museum API listening at http://localhost:${port}`)
  console.log(`Twitch integration ${twitch.isConfigured ? 'configured' : 'not configured; demo mode remains available'}`)
})
