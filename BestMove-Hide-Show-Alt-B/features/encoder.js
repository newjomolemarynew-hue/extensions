// Converts positions to Lc0's 112-plane classical input and maps policy
// outputs back to moves. Mirrors lc0's EncodePositionForNN for
// INPUT_CLASSICAL_112_PLANE with HistoryFill=fen_only, which is what
// `lc0 --weights=maia-XXXX.pb.gz` does when given a bare FEN.

import { MOVE_STRS, CONV_POLICY_MAP } from './tables.js';
import { colorOf, squareName } from './chess.js';

export const INPUT_PLANES = 112;
export const POLICY_SIZE = 1858;

const MOVE_INDEX = new Map(MOVE_STRS.map((m, i) => [m, i]));
const PIECE_ORDER = 'pnbrqk';
const STARTPOS_PLACEMENT = 'RNBQKBNRPPPPPPPP' + '.'.repeat(32) + 'pppppppprnbqkbnr';

// Lc0 always sees the board from the side to move: for black the ranks are mirrored.
function toNnSquare(sq, black) {
  return black ? (7 - (sq >> 3)) * 8 + (sq & 7) : sq;
}

function isStartpos(pos) {
  const c = pos.castling;
  return pos.turn === 'w' && pos.ep < 0 && c.K && c.Q && c.k && c.q &&
    pos.board.map((p) => p || '.').join('') === STARTPOS_PLACEMENT;
}

// True when the side to move can actually capture en passant (lc0 only keeps
// the en passant flag in that case).
function hasEnPassant(pos) {
  if (pos.ep < 0) return false;
  const pawn = pos.turn === 'w' ? 'P' : 'p';
  const rankBehind = pos.turn === 'w' ? -8 : 8;
  const file = pos.ep & 7;
  return [-1, 1].some((df) => file + df >= 0 && file + df < 8 &&
    pos.board[pos.ep + rankBehind + df] === pawn);
}

export function encodePosition(pos) {
  const planes = new Float32Array(INPUT_PLANES * 64);
  const black = pos.turn === 'b';
  const fill = (plane, value) => planes.fill(value, plane * 64, plane * 64 + 64);

  // 8 history slots of 13 planes. With only a FEN there is no history, so lc0
  // repeats the current board in every slot (except for the start position).
  const epFile = hasEnPassant(pos) ? pos.ep & 7 : -1;
  const historySlots = isStartpos(pos) ? 1 : 8;
  for (let slot = 0; slot < historySlots; slot++) {
    const base = slot * 13;
    for (let sq = 0; sq < 64; sq++) {
      const p = pos.board[sq];
      if (!p) continue;
      const ours = colorOf(p) === pos.turn;
      const plane = base + (ours ? 0 : 6) + PIECE_ORDER.indexOf(p.toLowerCase());
      planes[plane * 64 + toNnSquare(sq, black)] = 1;
    }
    // In the filled-in history the opponent's double pawn push hasn't happened
    // yet, so lc0 moves that pawn back from rank 5 to rank 7 (our perspective).
    if (slot > 0 && epFile >= 0) {
      planes[(base + 6) * 64 + 32 + epFile] = 0;
      planes[(base + 6) * 64 + 48 + epFile] = 1;
    }
    // Plane base + 12 (repetitions) stays zero.
  }

  const c = pos.castling;
  const [usQ, usK, themQ, themK] = black ? [c.q, c.k, c.Q, c.K] : [c.Q, c.K, c.q, c.k];
  if (usQ) fill(104, 1);
  if (usK) fill(105, 1);
  if (themQ) fill(106, 1);
  if (themK) fill(107, 1);
  if (black) fill(108, 1);
  fill(109, pos.halfmove);
  // Plane 110 is unused (zeros); plane 111 is all ones.
  fill(111, 1);
  return planes;
}

// Index into the 1858 policy vector for a legal move ({from, to, promo}) in `pos`.
export function moveToPolicyIndex(pos, move) {
  const black = pos.turn === 'b';
  let to = move.to;
  // Lc0 encodes castling as "king takes rook" (e1h1 / e1a1).
  const piece = pos.board[move.from];
  if (piece.toLowerCase() === 'k' && Math.abs(move.to - move.from) === 2) {
    to = move.to > move.from ? move.from + 3 : move.from - 4;
  }
  let key = squareName(toNnSquare(move.from, black)) + squareName(toNnSquare(to, black));
  // Knight promotions use the plain move; q/r/b promotions have their own entries.
  if (move.promo && move.promo !== 'n') key += move.promo;
  const idx = MOVE_INDEX.get(key);
  if (idx === undefined) throw new Error(`no policy index for ${key}`);
  return idx;
}

// Folds the 80x8x8 convolutional policy output into the 1858-move vector.
export function convPolicyToFlat(conv) {
  const flat = new Float32Array(POLICY_SIZE);
  for (let i = 0; i < CONV_POLICY_MAP.length; i++) {
    const idx = CONV_POLICY_MAP[i];
    if (idx >= 0) flat[idx] = conv[i];
  }
  return flat;
}
