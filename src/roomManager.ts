import { Room, RoomPlayer, FBProfile, PlayerColor } from "./types";

const COLORS: PlayerColor[] = ["red", "green", "blue", "yellow"];
const rooms = new Map<string, Room>();

function genRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function createRoom(socketId: string, profile: FBProfile): Room {
  let id = genRoomId();
  while (rooms.has(id)) id = genRoomId();

  const player: RoomPlayer = { socketId, color: COLORS[0], profile, connected: true };
  const room: Room = { id, hostId: socketId, players: [player], status: "waiting", gameState: null, createdAt: new Date() };
  rooms.set(id, room);
  return room;
}

export function joinRoom(roomId: string, socketId: string, profile: FBProfile): { room: Room; color: PlayerColor } | { error: string } {
  const room = rooms.get(roomId.toUpperCase());
  if (!room) return { error: "Room not found." };
  if (room.status === "playing") {
    // Allow reconnect
    const existing = room.players.find(p => p.profile.id === profile.id);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      return { room, color: existing.color };
    }
    return { error: "Game already in progress." };
  }
  if (room.players.length >= 4) return { error: "Room is full." };
  const usedColors = room.players.map(p => p.color);
  const color = COLORS.find(c => !usedColors.includes(c))!;
  const player: RoomPlayer = { socketId, color, profile, connected: true };
  room.players.push(player);
  return { room, color };
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getRoomBySocket(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.socketId === socketId)) return room;
  }
}

export function setDisconnected(socketId: string): Room | undefined {
  const room = getRoomBySocket(socketId);
  if (!room) return;
  const p = room.players.find(p => p.socketId === socketId);
  if (p) p.connected = false;
  return room;
}

export function startRoom(roomId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || room.players.length < 2) return false;
  room.status = "playing";
  return true;
}

export function updateGameState(roomId: string, gs: any): void {
  const room = rooms.get(roomId);
  if (room) room.gameState = gs;
}

export function deleteOldRooms(): void {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.createdAt.getTime() > 3 * 60 * 60 * 1000) rooms.delete(id);
  }
}
