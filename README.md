# 🎲 Ludo Server — Node.js + Socket.io

Real-time multiplayer backend for Ludo Game.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev        # Development
npm run build && npm start  # Production
```

## Environment Variables

```
PORT=3001
CLIENT_URL=http://localhost:3000   # or your Vercel URL
```

## Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `createRoom` | `{ profile }` | Create new room, get 5-char code |
| `joinRoom` | `{ roomId, profile }` | Join existing room |
| `startGame` | `{ roomId }` | Host starts the game |
| `rollDice` | `{ roomId }` | Roll dice (server generates number) |
| `selectToken` | `{ roomId, tokenId }` | Move selected token |
| `reconnect` | `{ roomId, profile }` | Rejoin after disconnect |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `roomCreated` | `{ roomId, color, players }` | Room created |
| `roomJoined` | `{ roomId, color, players }` | Joined room |
| `playerJoined` | `{ players }` | Someone joined/rejoined |
| `gameStarted` | `{ gameState, players }` | Game started |
| `gameState` | `MPGameState` | State update after every move |
| `playerDisconnected` | `{ players }` | Player went offline |
| `reconnected` | `{ gameState, players, color, roomId }` | Reconnect success |
| `error` | `string` | Error message |

## Deploy

### Railway / Render
```bash
# Set env vars in dashboard
# Build: npm run build
# Start: npm start
```

### Heroku
```bash
heroku create your-ludo-server
heroku config:set PORT=3001 CLIENT_URL=https://your-ludo-game.vercel.app
git push heroku main
```
