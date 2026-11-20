// Minimal chess rules: FEN parsing and legal move generation.
// Squares are 0..63 with a1 = 0, b1 = 1, ..., h8 = 63 (index = rank * 8 + file).
// Pieces are FEN letters: uppercase white, lowercase black, null for empty.

const FILES = 'abcdefgh';

export function squareName(sq) {
  return FILES[sq & 7] + ((sq >> 3) + 1);
}

export function parseSquare(name) {
  const file = FILES.indexOf(name[0]);
  const rank = Number(name[1]) - 1;
  if (file < 0 || !(rank >= 0 && rank < 8)) throw new Error(`bad square "${name}"`);
  return rank * 8 + file;
}

export function colorOf(piece) {
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

export function parseFen(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error('FEN needs at least 4 fields');
  const [placement, turn, castling, ep, half = '0', full = '1'] = parts;

  const board = new Array(64).fill(null);
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error('FEN placement needs 8 ranks');
  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else if (/[pnbrqkPNBRQK]/.test(ch)) {
        if (file > 7) throw new Error(`rank ${8 - r} is too long`);
        board[(7 - r) * 8 + file] = ch;
        file++;
      } else {
        throw new Error(`bad FEN character "${ch}"`);
      }
    }
    if (file !== 8) throw new Error(`rank ${8 - r} does not have 8 squares`);
  }

  if (turn !== 'w' && turn !== 'b') throw new Error('side to move must be w or b');
  if (!/^(-|[KQkq]+)$/.test(castling)) throw new Error('bad castling field');

  const pos = {
    board,
    turn,
    castling: {
      K: castling.includes('K'),
      Q: castling.includes('Q'),
      k: castling.includes('k'),
      q: castling.includes('q'),
    },
    ep: ep === '-' ? -1 : parseSquare(ep),
    halfmove: Number(half) || 0,
    fullmove: Number(full) || 1,
  };

  for (const color of ['w', 'b']) {
    const king = color === 'w' ? 'K' : 'k';
    if (board.filter((p) => p === king).length !== 1) {
      throw new Error(`${color === 'w' ? 'white' : 'black'} must have exactly one king`);
    }
  }
  return pos;
}

export function toFen(pos) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pos.board[r * 8 + f];
      if (p) {
        if (empty) row += empty;
        empty = 0;
        row += p;
      } else {
        empty++;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const c = pos.castling;
  const castling = (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') || '-';
  const ep = pos.ep < 0 ? '-' : squareName(pos.ep);
  return `${rows.join('/')} ${pos.turn} ${castling} ${ep} ${pos.halfmove} ${pos.fullmove}`;
}

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function offset(sq, df, dr) {
  const f = (sq & 7) + df;
  const r = (sq >> 3) + dr;
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1;
}

function isPiece(board, sq, color, type) {
  const p = board[sq];
  return p !== null && colorOf(p) === color && p.toLowerCase() === type;
}

// True if `sq` is attacked by any piece of `byColor`.
export function isAttacked(board, sq, byColor) {
  // A white pawn attacks diagonally upward, so it sits one rank below the target.
  const pawnRank = byColor === 'w' ? -1 : 1;
  for (const df of [-1, 1]) {
    const s = offset(sq, df, pawnRank);
    if (s >= 0 && isPiece(board, s, byColor, 'p')) return true;
  }
  for (const [df, dr] of KNIGHT_STEPS) {
    const s = offset(sq, df, dr);
    if (s >= 0 && isPiece(board, s, byColor, 'n')) return true;
  }
  for (const [df, dr] of KING_STEPS) {
    const s = offset(sq, df, dr);
    if (s >= 0 && isPiece(board, s, byColor, 'k')) return true;
  }
  for (const [dirs, types] of [[ROOK_DIRS, 'rq'], [BISHOP_DIRS, 'bq']]) {
    for (const [df, dr] of dirs) {
      let s = offset(sq, df, dr);
      while (s >= 0) {
        const p = board[s];
        if (p) {
          if (colorOf(p) === byColor && types.includes(p.toLowerCase())) return true;
          break;
        }
        s = offset(s, df, dr);
      }
    }
  }
  return false;
}

function kingSquare(board, color) {
  return board.indexOf(color === 'w' ? 'K' : 'k');
}

export function inCheck(pos) {
  return isAttacked(pos.board, kingSquare(pos.board, pos.turn), pos.turn === 'w' ? 'b' : 'w');
}

function pseudoLegalMoves(pos) {
  const { board, turn } = pos;
  const them = turn === 'w' ? 'b' : 'w';
  const moves = [];
  const add = (from, to, promo = '') => moves.push({ from, to, promo });

  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || colorOf(p) !== turn) continue;
    const type = p.toLowerCase();

    if (type === 'p') {
      const dir = turn === 'w' ? 1 : -1;
      const startRank = turn === 'w' ? 1 : 6;
      const lastRank = turn === 'w' ? 7 : 0;
      const pushPawn = (to) => {
        if ((to >> 3) === lastRank) for (const promo of 'qrbn') add(from, to, promo);
        else add(from, to);
      };
      const one = offset(from, 0, dir);
      if (one >= 0 && !board[one]) {
        pushPawn(one);
        const two = offset(from, 0, 2 * dir);
        if ((from >> 3) === startRank && !board[two]) add(from, two);
      }
      for (const df of [-1, 1]) {
        const to = offset(from, df, dir);
        if (to < 0) continue;
        if (board[to] && colorOf(board[to]) === them) pushPawn(to);
        else if (to === pos.ep) add(from, to);
      }
    } else if (type === 'n' || type === 'k') {
      for (const [df, dr] of type === 'n' ? KNIGHT_STEPS : KING_STEPS) {
        const to = offset(from, df, dr);
        if (to >= 0 && (!board[to] || colorOf(board[to]) === them)) add(from, to);
      }
    } else {
      const dirs = type === 'r' ? ROOK_DIRS : type === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
      for (const [df, dr] of dirs) {
        let to = offset(from, df, dr);
        while (to >= 0) {
          if (board[to]) {
            if (colorOf(board[to]) === them) add(from, to);
            break;
          }
          add(from, to);
          to = offset(to, df, dr);
        }
      }
    }
  }

  // Castling: king and rook on their home squares, path empty, and the king
  // does not start in, pass through, or land on an attacked square.
  const home = turn === 'w' ? 0 : 56;
  const king = turn === 'w' ? 'K' : 'k';
  const rook = turn === 'w' ? 'R' : 'r';
  const rights = turn === 'w' ? [pos.castling.K, pos.castling.Q] : [pos.castling.k, pos.castling.q];
  if (board[home + 4] === king && !isAttacked(board, home + 4, them)) {
    if (rights[0] && board[home + 7] === rook && !board[home + 5] && !board[home + 6] &&
        !isAttacked(board, home + 5, them) && !isAttacked(board, home + 6, them)) {
      add(home + 4, home + 6);
    }
    if (rights[1] && board[home] === rook && !board[home + 1] && !board[home + 2] && !board[home + 3] &&
        !isAttacked(board, home + 3, them) && !isAttacked(board, home + 2, them)) {
      add(home + 4, home + 2);
    }
  }
  return moves;
}

// Returns a new position with `move` ({from, to, promo}) played. Does not check legality.
export function makeMove(pos, move) {
  const board = pos.board.slice();
  const { from, to, promo } = move;
  const piece = board[from];
  const type = piece.toLowerCase();
  const captured = board[to];

  board[to] = promo ? (pos.turn === 'w' ? promo.toUpperCase() : promo) : piece;
  board[from] = null;

  if (type === 'p' && to === pos.ep) {
    board[to + (pos.turn === 'w' ? -8 : 8)] = null;
  }
  if (type === 'k' && Math.abs(to - from) === 2) {
    const rookFrom = to > from ? from + 3 : from - 4;
    const rookTo = to > from ? from + 1 : from - 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  const castling = { ...pos.castling };
  const touch = (sq) => {
    if (sq === 4) castling.K = castling.Q = false;
    if (sq === 60) castling.k = castling.q = false;
    if (sq === 0) castling.Q = false;
    if (sq === 7) castling.K = false;
    if (sq === 56) castling.q = false;
    if (sq === 63) castling.k = false;
  };
  touch(from);
  touch(to);

  return {
    board,
    turn: pos.turn === 'w' ? 'b' : 'w',
    castling,
    ep: type === 'p' && Math.abs(to - from) === 16 ? (from + to) / 2 : -1,
    halfmove: type === 'p' || captured ? 0 : pos.halfmove + 1,
    fullmove: pos.fullmove + (pos.turn === 'b' ? 1 : 0),
  };
}

export function moveToUci(move) {
  return squareName(move.from) + squareName(move.to) + (move.promo || '');
}

export function legalMoves(pos) {
  return pseudoLegalMoves(pos).filter((move) => {
    const next = makeMove(pos, move);
    return !isAttacked(next.board, kingSquare(next.board, pos.turn), next.turn);
  });
}

// Standard algebraic notation for a legal move in `pos`, e.g. "Nf3", "exd5", "O-O", "e8=Q+".
export function moveToSan(pos, move) {
  const piece = pos.board[move.from];
  const type = piece.toLowerCase();
  let san;
  if (type === 'k' && Math.abs(move.to - move.from) === 2) {
    san = move.to > move.from ? 'O-O' : 'O-O-O';
  } else {
    const capture = pos.board[move.to] !== null || (type === 'p' && move.to === pos.ep);
    if (type === 'p') {
      san = (capture ? squareName(move.from)[0] + 'x' : '') + squareName(move.to);
      if (move.promo) san += '=' + move.promo.toUpperCase();
    } else {
      // Disambiguate when another piece of the same kind can reach the same square.
      const rivals = legalMoves(pos).filter((m) =>
        m.to === move.to && m.from !== move.from && pos.board[m.from] === piece);
      let disambig = '';
      if (rivals.length) {
        const sameFile = rivals.some((m) => (m.from & 7) === (move.from & 7));
        const sameRank = rivals.some((m) => (m.from >> 3) === (move.from >> 3));
        if (!sameFile) disambig = squareName(move.from)[0];
        else if (!sameRank) disambig = squareName(move.from)[1];
        else disambig = squareName(move.from);
      }
      san = type.toUpperCase() + disambig + (capture ? 'x' : '') + squareName(move.to);
    }
  }
  const next = makeMove(pos, move);
  if (inCheck(next)) san += legalMoves(next).length ? '+' : '#';
  return san;
}

const PIECE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

// Plain-English description of a legal move, e.g. "Pawn to d3",
// "Knight takes bishop on c4", "Castle kingside", "Pawn to e8, becomes a Queen".
export function describeMove(pos, move) {
  const piece = pos.board[move.from];
  const type = piece.toLowerCase();
  let text;
  if (type === 'k' && Math.abs(move.to - move.from) === 2) {
    text = move.to > move.from ? 'Castle kingside' : 'Castle queenside';
  } else {
    const enPassant = type === 'p' && move.to === pos.ep;
    const captured = enPassant ? 'p' : pos.board[move.to] && pos.board[move.to].toLowerCase();
    // Name the starting square when another piece of the same kind could make the same move.
    const ambiguous = type !== 'p' && legalMoves(pos).some((m) =>
      m.to === move.to && m.from !== move.from && pos.board[m.from] === piece);
    const who = PIECE_NAMES[type] + (ambiguous ? ` on ${squareName(move.from)}` : '');
    text = captured
      ? `${who} takes ${PIECE_NAMES[captured].toLowerCase()} on ${squareName(move.to)}`
      : `${who} to ${squareName(move.to)}`;
    if (enPassant) text += ' (en passant)';
    if (move.promo) text += `, becomes a ${PIECE_NAMES[move.promo]}`;
  }
  const next = makeMove(pos, move);
  if (inCheck(next)) text += legalMoves(next).length ? ', check' : ', checkmate!';
  return text;
}
