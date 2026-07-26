import { GameState, PlayerState, PlayerColor, Token, TokenState } from "./types";

const MAIN_PATH: {row:number;col:number}[] = [
  {row:6,col:1},{row:6,col:2},{row:6,col:3},{row:6,col:4},{row:6,col:5},
  {row:5,col:6},{row:4,col:6},{row:3,col:6},{row:2,col:6},{row:1,col:6},{row:0,col:6},
  {row:0,col:7},{row:0,col:8},
  {row:1,col:8},{row:2,col:8},{row:3,col:8},{row:4,col:8},{row:5,col:8},
  {row:6,col:9},{row:6,col:10},{row:6,col:11},{row:6,col:12},{row:6,col:13},{row:6,col:14},
  {row:7,col:14},{row:8,col:14},
  {row:8,col:13},{row:8,col:12},{row:8,col:11},{row:8,col:10},{row:8,col:9},
  {row:9,col:8},{row:10,col:8},{row:11,col:8},{row:12,col:8},{row:13,col:8},{row:14,col:8},
  {row:14,col:7},{row:14,col:6},
  {row:13,col:6},{row:12,col:6},{row:11,col:6},{row:10,col:6},{row:9,col:6},
  {row:8,col:5},{row:8,col:4},{row:8,col:3},{row:8,col:2},{row:8,col:1},{row:8,col:0},
  {row:7,col:0},{row:6,col:0},
];

const SAFE_ZONES       = [11, 24, 37, 50];
const START_POS: Record<PlayerColor,number> = { red:0, green:13, blue:26, yellow:39 };
const HOME_COL_LEN     = 6;
const TURN_ORDER: PlayerColor[] = ["red","green","blue","yellow"];

export function createInitialGameState(players: {color:PlayerColor;profile:any}[]): GameState {
  const orderedPlayers: PlayerState[] = TURN_ORDER
    .filter(c => players.some(p => p.color === c))
    .map(color => ({
      color,
      profile: players.find(p => p.color === color)!.profile,
      tokens: [0,1,2,3].map(id => ({ id, color, state:"home" as TokenState, pathPos:0 })),
    }));

  // Fill missing slots with bots
  const colors: PlayerColor[] = ["red","green","blue","yellow"];
  for (const c of colors) {
    if (!orderedPlayers.find(p => p.color === c)) {
      orderedPlayers.push({
        color: c,
        profile: { id:`bot_${c}`, name:`Bot ${c.charAt(0).toUpperCase()+c.slice(1)}`, picture:"" },
        tokens: [0,1,2,3].map(id => ({ id, color:c, state:"home" as TokenState, pathPos:0 })),
      });
    }
  }
  orderedPlayers.sort((a,b) => TURN_ORDER.indexOf(a.color) - TURN_ORDER.indexOf(b.color));

  return {
    players: orderedPlayers,
    currentPlayerIndex: 0,
    diceValue: null,
    turnPhase: "roll",
    consecutiveSixes: 0,
    winner: null,
    message: `${orderedPlayers[0].profile.name}'s turn. Roll the dice!`,
  };
}

export function serverRollDice(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function getMainIdx(color: PlayerColor, pathPos: number): number {
  return (START_POS[color] + pathPos) % 52;
}

function canMove(token: Token, dice: number): boolean {
  if (token.state === "finished") return false;
  if (token.state === "home") return dice === 6;
  if (token.state === "path") {
    const e = 52 - token.pathPos;
    return dice < e || (dice - e) <= HOME_COL_LEN;
  }
  if (token.state === "homeStretch") return token.pathPos + dice <= HOME_COL_LEN;
  return false;
}

function applyMove(token: Token, dice: number): { state: TokenState; pathPos: number } {
  if (token.state === "path") {
    const e = 52 - token.pathPos;
    if (dice < e) return { state:"path", pathPos:(token.pathPos+dice)%52 };
    const h = dice - e;
    if (h < HOME_COL_LEN) return { state:"homeStretch", pathPos:h };
    if (h === HOME_COL_LEN) return { state:"finished", pathPos:HOME_COL_LEN };
    return { state:"path", pathPos:token.pathPos };
  }
  if (token.state === "homeStretch") {
    const n = token.pathPos + dice;
    if (n < HOME_COL_LEN) return { state:"homeStretch", pathPos:n };
    if (n === HOME_COL_LEN) return { state:"finished", pathPos:HOME_COL_LEN };
    return { state:"homeStretch", pathPos:token.pathPos };
  }
  return { state:token.state, pathPos:token.pathPos };
}

function checkCapture(gs: GameState, color: PlayerColor, mainIdx: number): Token | null {
  if (SAFE_ZONES.includes(mainIdx)) return null;
  for (const p of gs.players) {
    if (p.color === color) continue;
    for (const t of p.tokens) {
      if (t.state === "path" && getMainIdx(p.color, t.pathPos) === mainIdx) return t;
    }
  }
  return null;
}

function checkWinner(gs: GameState): PlayerColor | null {
  for (const p of gs.players) {
    if (p.tokens.every(t => t.state === "finished")) return p.color;
  }
  return null;
}

function cloneState(gs: GameState): GameState {
  return {
    ...gs,
    players: gs.players.map(p => ({ ...p, tokens: p.tokens.map(t => ({...t})) })),
  };
}

function movableIds(gs: GameState): number[] {
  const player = gs.players[gs.currentPlayerIndex];
  if (!gs.diceValue) return [];
  return player.tokens.filter(t => canMove(t, gs.diceValue!)).map(t => t.id);
}

export function processRoll(gs: GameState): GameState {
  const dice = serverRollDice();
  const ns = cloneState(gs);
  ns.diceValue = dice;
  let sixes = gs.consecutiveSixes;
  if (dice === 6) sixes++; else sixes = 0;
  ns.consecutiveSixes = sixes;

  const player = ns.players[ns.currentPlayerIndex];

  if (sixes >= 3) {
    const ni = (ns.currentPlayerIndex + 1) % 4;
    ns.consecutiveSixes = 0;
    ns.message = `${player.profile.name} rolled three 6s! Turn lost.`;
    ns.currentPlayerIndex = ni;
    ns.diceValue = null;
    ns.turnPhase = "roll";
    return ns;
  }

  const mv = movableIds(ns);
  if (!mv.length) {
    if (dice === 6) {
      ns.message = `${player.profile.name} rolled 6 but no moves. Roll again!`;
      ns.diceValue = null;
      ns.consecutiveSixes = 0;
      ns.turnPhase = "roll";
      return ns;
    }
    const ni = (ns.currentPlayerIndex + 1) % 4;
    ns.message = `${player.profile.name} rolled ${dice} — no moves.`;
    ns.currentPlayerIndex = ni;
    ns.diceValue = null;
    ns.turnPhase = "roll";
    ns.consecutiveSixes = 0;
    return ns;
  }

  ns.turnPhase = "select";
  ns.message = dice === 6
    ? `${player.profile.name} rolled 6! Pick a token. (Bonus turn!)`
    : `${player.profile.name} rolled ${dice}. Pick a token.`;
  return ns;
}

export function processSelect(gs: GameState, tokenId: number): GameState {
  if (gs.turnPhase !== "select" || !gs.diceValue) return gs;
  const player = gs.players[gs.currentPlayerIndex];
  const token = player.tokens.find(t => t.id === tokenId);
  if (!token || !canMove(token, gs.diceValue)) return gs;

  const ns = cloneState(gs);
  const np = ns.players[ns.currentPlayerIndex];
  const nt = np.tokens.find(t => t.id === tokenId)!;

  if (nt.state === "home") {
    nt.state = "path"; nt.pathPos = 0;
  } else {
    const r = applyMove(nt, gs.diceValue);
    nt.state = r.state; nt.pathPos = r.pathPos;
    if (nt.state === "path") {
      const mi = getMainIdx(np.color, nt.pathPos);
      const cap = checkCapture(ns, np.color, mi);
      if (cap) {
        for (const p of ns.players) {
          if (p.color === cap.color) {
            const ct = p.tokens.find(t => t.id === cap.id)!;
            ct.state = "home"; ct.pathPos = 0;
          }
        }
        const capName = ns.players.find(p => p.color === cap.color)!.profile.name;
        ns.message = `${np.profile.name} captured ${capName}'s token! Bonus turn!`;
        ns.diceValue = null; ns.turnPhase = "roll";
        const w = checkWinner(ns); if (w) { ns.winner = w; ns.message = `${np.profile.name} wins! 🎉`; }
        return ns;
      }
    }
  }

  const w = checkWinner(ns);
  if (w) { ns.winner = w; ns.message = `${np.profile.name} wins! 🎉`; return ns; }

  if (gs.diceValue === 6) {
    ns.diceValue = null; ns.turnPhase = "roll";
    ns.message = `${np.profile.name} gets another turn!`;
  } else {
    const ni = (ns.currentPlayerIndex + 1) % 4;
    ns.currentPlayerIndex = ni;
    ns.diceValue = null; ns.turnPhase = "roll"; ns.consecutiveSixes = 0;
    ns.message = `${ns.players[ni].profile.name}'s turn. Roll the dice!`;
  }
  return ns;
}

export function getBotTokenId(gs: GameState): number | null {
  const player = gs.players[gs.currentPlayerIndex];
  const dv = gs.diceValue; if (!dv) return null;
  const mv = player.tokens.filter(t => canMove(t, dv));
  if (!mv.length) return null;
  if (mv.length === 1) return mv[0].id;
  for (const t of mv) {
    if (t.state === "path") {
      const r = applyMove(t, dv);
      if (r.state === "path") {
        const mi = getMainIdx(player.color, r.pathPos);
        if (checkCapture(gs, player.color, mi)) return t.id;
      }
    }
  }
  for (const t of mv) { const r = applyMove(t, dv); if (r.state === "finished") return t.id; }
  const fh = mv.find(t => t.state === "home"); if (fh) return fh.id;
  let best = mv[0], bp = -1;
  for (const t of mv) {
    const p = t.state === "homeStretch" ? 52 + t.pathPos : t.pathPos;
    if (p > bp) { bp = p; best = t; }
  }
  return best.id;
}

export function getMovableIds(gs: GameState): number[] {
  return movableIds(gs);
}
