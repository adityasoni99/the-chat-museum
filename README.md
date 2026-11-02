# THE CHAT MUSEUM

A living archive where Twitch communities can preserve the moments that made a stream memorable.

## Requirements

- Node.js 24.15 or newer (the server uses Node's built-in SQLite API)
- npm

## Run locally

From the project root:

```powershell
npm install
npm run dev
```

Open the Vite address shown in the terminal (normally http://localhost:5173). The Express API runs at http://localhost:3001 and exposes `/api/health`.

The current gallery includes three clearly labelled illustrative demo artifacts. Their sample chat excerpts, preservation dates, and recognition counts are fictional and are not real Twitch messages or community activity. Live Twitch chat is shown separately in the Curator room. Nominated artifacts are persisted to SQLite and kept separate from the demo collection.

## Twitch chat setup

1. Create an application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Set its OAuth Redirect URL to `http://localhost:3001/api/twitch/callback` and choose the **Confidential** client type.
3. From the project root, create the private environment file in PowerShell:

   ```powershell
   Copy-Item .env.example server/.env
   ```

   Open `server/.env` and fill in `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Keep this file private; it is ignored by Git.
4. Restart the development server with `npm run dev`, open **Curator**, connect the broadcaster's Twitch account, then choose **Start Live Chat**.

The server requests only the `user:read:chat` permission, validates OAuth state, keeps access and refresh tokens in server memory, and subscribes to Twitch EventSub's `channel.chat.message` WebSocket event. The in-memory authorization is cleared when the server restarts; reconnect through Twitch after a restart. The curator transcript contains Twitch events only. The sample exhibit gallery remains separately labelled DEMO content.

## Message nominations and exhibits

In **Curator**, choose **Nominate** on a message received from the connected Twitch channel, add its title, story, and category, then save it as pending. The nomination stores a snapshot of the actual Twitch message and its identifiers in `server/data/chat-museum.sqlite`. Pending nominations are visible only to the active curator session. Use **Approve & Publish** to assign an exhibit number and add it to the separate published collection on the museum homepage. Demo exhibits remain in their own labelled section.

## Build

```powershell
npm run build
```
