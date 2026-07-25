export type PlayerColor = "red" | "green" | "blue" | "yellow";
export type TokenState  = "home" | "path" | "homeStretch" | "finished";
export type RoomStatus  = "waiting" | "playing" | "finished";

export interface FBProfile {
  id:      string;
  name:    string;
  picture: string; // URL
}

export interface RoomPlayer {
  socketId:  string;
  color:     PlayerColor;
  profile:   FBProfile;
  connected: boolean;
}

export interface Token {
  id:      number;
  color:   PlayerColor;
  state:   TokenState;
  pathPos: number;
}

export interface PlayerState {
  color:   PlayerColor;
  profile: FBProfile;
  tokens:  Token[];
}

export interface GameState {
  players:             PlayerState[];
  currentPlayerIndex:  number;
  diceValue:           number | null;
  turnPhase:           "roll" | "select";
  consecutiveSixes:    number;
  winner:              PlayerColor | null;
  message:             string;
}

export interface Room {
  id:        string;
  hostId:    string;
  players:   RoomPlayer[];
  status:    RoomStatus;
  gameState: GameState | null;
  createdAt: Date;
}

// Socket event payloads
export interface CreateRoomPayload  { profile: FBProfile; }
export interface JoinRoomPayload    { roomId: string; profile: FBProfile; }
export interface RollDicePayload    { roomId: string; }
export interface SelectTokenPayload { roomId: string; tokenId: number; }
export interface ReconnectPayload   { roomId: string; profile: FBProfile; }
