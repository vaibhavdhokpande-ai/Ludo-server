import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import {
  createRoom, joinRoom, getRoom, getRoomBySocket,
  setDisconnected, startRoom, updateGameState, deleteOldRooms,
} from "./roomManager";
import {
  createInitialGameState, processRoll, processSelect,
  getBotTokenId, getMovableIds,
} from "./gameLogic";
import {
  CreateRoomPayload, JoinRoomPayload, RollDicePayload,
  SelectTokenPayload, ReconnectPayload,
} from "./types";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:3000", methods: ["GET","POST"] },
});

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Clean old rooms every hour
setInterval(deleteOldRooms, 60 * 60 * 1000);

// Bot turn scheduler
function scheduleBotTurn(roomId: string, delay = 1000) {
  setTimeout(() => {
    const room = getRoom(roomId);
    if (!room || !room.gameState || room.gameState.winner) return;
    const gs = room.gameState;
    const curPlayer = gs.players[gs.currentPlayerIndex];
    const isBotTurn = curPlayer.profile.id.startsWith("bot_");
    if (!isBotTurn) return;

    if (gs.turnPhase === "roll") {
      const newGs = processRoll(gs);
      updateGameState(roomId, newGs);
      io.to(roomId).emit("gameState", newGs);
      if (!newGs.winner) scheduleBotTurn(roomId, 900);
    } else if (gs.turnPhase === "select") {
      // Auto-select or bot picks
      const movable = getMovableIds(gs);
      const tokenId = movable.length === 1 ? movable[0] : getBotTokenId(gs);
      if (tokenId !== null) {
        const newGs = processSelect(gs, tokenId);
        updateGameState(roomId, newGs);
        io.to(roomId).emit("gameState", newGs);
        if (!newGs.winner) scheduleBotTurn(roomId, 800);
      }
    }
  }, delay);
}

// Human auto-select (single movable)
function scheduleAutoSelect(roomId: string) {
  setTimeout(() => {
    const room = getRoom(roomId);
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    if (gs.turnPhase !== "select" || gs.winner) return;
    const movable = getMovableIds(gs);
    if (movable.length === 1) {
      const newGs = processSelect(gs, movable[0]);
      updateGameState(roomId, newGs);
      io.to(roomId).emit("gameState", newGs);
      const curPlayer = newGs.players[newGs.currentPlayerIndex];
      if (!newGs.winner && curPlayer.profile.id.startsWith("bot_")) {
        scheduleBotTurn(roomId, 900);
      }
    }
  }, 350);
}

io.on("connection", (socket: Socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── CREATE ROOM ──────────────────────────────────────────
  socket.on("createRoom", (payload: CreateRoomPayload) => {
    const room = createRoom(socket.id, payload.profile);
    socket.join(room.id);
    socket.emit("roomCreated", {
      roomId: room.id,
      color: room.players[0].color,
      players: room.players,
    });
    console.log(`[room] Created ${room.id} by ${payload.profile.name}`);
  });

  // ── JOIN ROOM ─────────────────────────────────────────────
  socket.on("joinRoom", (payload: JoinRoomPayload) => {
    const result = joinRoom(payload.roomId, socket.id, payload.profile);
    if ("error" in result) {
      socket.emit("error", result.error); return;
    }
    const { room, color } = result;
    socket.join(room.id);
    socket.emit("roomJoined", { roomId: room.id, color, players: room.players });
    io.to(room.id).emit("playerJoined", { players: room.players });
    console.log(`[room] ${payload.profile.name} joined ${room.id} as ${color}`);
  });

  // ── START GAME ────────────────────────────────────────────
  socket.on("startGame", (payload: { roomId: string }) => {
    const room = getRoom(payload.roomId);
    if (!room || room.hostId !== socket.id) {
      socket.emit("error", "Only the host can start the game."); return;
    }
    if (room.players.length < 2) {
      socket.emit("error", "Need at least 2 players to start."); return;
    }
    startRoom(payload.roomId);
    const gs = createInitialGameState(room.players.map(p => ({ color: p.color, profile: p.profile })));
    updateGameState(payload.roomId, gs);
    io.to(payload.roomId).emit("gameStarted", { gameState: gs, players: room.players });

    // If first player is bot, schedule bot turn
    if (gs.players[0].profile.id.startsWith("bot_")) {
      scheduleBotTurn(payload.roomId, 1000);
    }
    console.log(`[game] Started in ${payload.roomId} with ${room.players.length} players`);
  });

  // ── ROLL DICE ─────────────────────────────────────────────
  socket.on("rollDice", (payload: RollDicePayload) => {
    const room = getRoom(payload.roomId);
    if (!room || !room.gameState) { socket.emit("error", "Room or game not found."); return; }
    const gs = room.gameState;
    if (gs.winner || gs.turnPhase !== "roll") return;

    // Verify it's this player's turn
    const curPlayer = gs.players[gs.currentPlayerIndex];
    const roomPlayer = room.players.find(p => p.socketId === socket.id);
    if (!roomPlayer || roomPlayer.color !== curPlayer.color) {
      socket.emit("error", "Not your turn."); return;
    }

    const newGs = processRoll(gs);
    updateGameState(payload.roomId, newGs);
    io.to(payload.roomId).emit("gameState", newGs);

    if (!newGs.winner) {
      // Check if next player is bot
      const nextPlayer = newGs.players[newGs.currentPlayerIndex];
      if (nextPlayer.profile.id.startsWith("bot_")) {
        scheduleBotTurn(payload.roomId, 900);
      } else {
        scheduleAutoSelect(payload.roomId);
      }
    }
  });

  // ── SELECT TOKEN ──────────────────────────────────────────
  socket.on("selectToken", (payload: SelectTokenPayload) => {
    const room = getRoom(payload.roomId);
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    if (gs.winner || gs.turnPhase !== "select") return;

    const curPlayer = gs.players[gs.currentPlayerIndex];
    const roomPlayer = room.players.find(p => p.socketId === socket.id);
    if (!roomPlayer || roomPlayer.color !== curPlayer.color) {
      socket.emit("error", "Not your turn."); return;
    }

    const newGs = processSelect(gs, payload.tokenId);
    if (newGs === gs) return; // invalid move
    updateGameState(payload.roomId, newGs);
    io.to(payload.roomId).emit("gameState", newGs);

    if (!newGs.winner) {
      const nextPlayer = newGs.players[newGs.currentPlayerIndex];
      if (nextPlayer.profile.id.startsWith("bot_")) {
        scheduleBotTurn(payload.roomId, 900);
      }
    }
  });

  // ── RECONNECT ─────────────────────────────────────────────
  socket.on("reconnect", (payload: ReconnectPayload) => {
    const room = getRoom(payload.roomId);
    if (!room) { socket.emit("error", "Room not found."); return; }
    const existing = room.players.find(p => p.profile.id === payload.profile.id);
    if (!existing) { socket.emit("error", "Not in this room."); return; }
    existing.socketId = socket.id;
    existing.connected = true;
    socket.join(room.id);
    socket.emit("reconnected", { roomId: room.id, color: existing.color, players: room.players, gameState: room.gameState });
    io.to(room.id).emit("playerJoined", { players: room.players });
  });

  // ── DISCONNECT ────────────────────────────────────────────
  socket.on("disconnect", () => {
    const room = setDisconnected(socket.id);
    if (room) {
      io.to(room.id).emit("playerDisconnected", { players: room.players });
      console.log(`[disconnect] ${socket.id} from room ${room.id}`);
    }
  });
});

const PORT = parseInt(process.env.PORT || "3001");
httpServer.listen(PORT, () => console.log(`🎲 Ludo server running on port ${PORT}`));
