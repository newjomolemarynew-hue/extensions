// Turns a network evaluation into ranked human-move predictions for a FEN.
// This is the equivalent of `go nodes 1` in lc0: no search, just the policy
// head's probabilities over the legal moves.
//
// Maia networks only go down to 1100. For lower target ratings the 1100
// network's distribution is flattened (higher softmax temperature, mixed with
// uniformly random legal moves) and one move is sampled from it, so the
// suggestion behaves like a weaker player. The sample is seeded by the
// position, so the same position always gives the same suggestion.

import { parseFen, legalMoves, moveToUci, moveToSan, describeMove } from './chess.js';
import { encodePosition, moveToPolicyIndex } from './encoder.js';
import { evaluate } from './maia-net.js';

export const MIN_MAIA_ELO = 1100;

function softmax(logits, temperature = 1) {
  const scaled = logits.map((l) => l / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

// Deterministic 0..1 random number from a string (FNV-1a hash + mulberry32).
function seededRandom(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// How much to weaken the 1100 network for a target rating below 1100:
// 0 at 1100, 1 at 100.
export function weakness(targetElo) {
  return Math.min(1, Math.max(0, (MIN_MAIA_ELO - targetElo) / 1000));
}

// A "model" is either one network or a blend [{ model, weight }] of neighbouring Maia networks
// (e.g. 1600 + 1700 for a 1640 opponent), which gives finer rating steps than 100-point jumps.
const asBlend = (m) => (Array.isArray(m) ? m : [{ model: m, weight: 1 }]);

function policyDistribution(model, pos, targetElo) {
  const moves = legalMoves(pos);
  if (moves.length === 0) return { moves, probs: [], wdl: null, q: null };
  const w = weakness(targetElo);
  const blend = asBlend(model), input = encodePosition(pos);
  const total = blend.reduce((a, b) => a + b.weight, 0) || 1;
  let probs = new Array(moves.length).fill(0), wdl = null, q = 0;
  for (const { model: net, weight } of blend) {
    const ev = evaluate(net, input);
    const p = softmax(moves.map((m) => ev.policy[moveToPolicyIndex(pos, m)]), 1 + 2 * w);
    for (let i = 0; i < p.length; i++) probs[i] += (p[i] * weight) / total;
    if (ev.wdl) wdl = wdl ? wdl.map((v, i) => v + (ev.wdl[i] * weight) / total) : Array.from(ev.wdl, (v) => (v * weight) / total);
    q += ((ev.q ?? 0) * weight) / total;
  }
  if (w > 0) {
    const mix = 0.35 * w;
    probs = probs.map((p) => p * (1 - mix) + mix / moves.length);
  }
  return { moves, probs, wdl, q };
}

export function scoreCandidates(model, fen, candidates, { targetElo = MIN_MAIA_ELO } = {}) {
  const pos = parseFen(fen);
  const { moves, probs } = policyDistribution(model, pos, targetElo);
  const legalByUci = new Map(moves.map((move) => [moveToUci(move), move]));
  const indexByMove = new Map(moves.map((move, index) => [move, index]));
  return candidates
    .filter((candidate) => legalByUci.has(candidate.move))
    .map((candidate) => ({
      ...candidate,
      probability: probs[indexByMove.get(legalByUci.get(candidate.move))],
    }))
    .sort((a, b) => b.probability - a.probability);
}

// Picks the most human-like move among Stockfish's candidates.
//  - candidates worse than the best by more than maxLoss (centipawns) are never played
//  - Maia gives how likely a player of this rating is to choose each remaining move
//  - weight = maiaProbability^(1/T) * exp(-loss / tau): human-likely and still sound moves win;
//    T rises for weaker ratings (more variety), falls for stronger ones (sticks to the likeliest move)
//  - sample=false returns the single most likely move (stable suggestion arrow);
//    sample=true draws from the weights, seeded by the position, so the same position always gets the same move
export function humanizeCandidates(model, fen, candidates, { targetElo = MIN_MAIA_ELO, maxLoss = 100, sample = false } = {}) {
  const pos = parseFen(fen);
  const legalMovesList = legalMoves(pos);
  const legalByUci = new Map(legalMovesList.map((move) => [moveToUci(move), move]));
  const valid = candidates.filter((candidate) =>
    legalByUci.has(candidate.move) && Number.isFinite(candidate.quality)
  );
  if (!valid.length) return null;

  const stockfish = valid.reduce((best, candidate) =>
    candidate.quality > best.quality ? candidate : best
  );
  const strong = Math.max(0, Math.min(1, (targetElo - 1500) / 700));            // 0 at <=1500, 1 at 2200+
  const threshold = Math.max(0, Math.min(500, maxLoss)) * (1 - 0.55 * strong);
  // a forced mate for us is always played; a human at any level takes it
  const mating = stockfish.quality >= 9000;
  const safe = mating ? [stockfish] : valid.filter((candidate) => candidate.quality >= stockfish.quality - threshold);
  const scored = scoreCandidates(model, fen, safe, { targetElo });
  const T = Math.max(0.55, 0.85 + Math.max(0, (1500 - targetElo) / 1600) - 0.3 * strong);
  const tau = Math.max(12, threshold * 0.7);
  const ranked = scored.map((candidate) => {
    const move = legalByUci.get(candidate.move);
    const loss = Math.max(0, stockfish.quality - candidate.quality);
    const weight = Math.pow(Math.max(candidate.probability, 1e-6), 1 / T) * Math.exp(-loss / tau);
    return { ...candidate, loss, weight, san: moveToSan(pos, move), text: describeMove(pos, move) };
  }).sort((a, b) => b.weight - a.weight);

  let selected = ranked[0] || stockfish;
  if (sample && ranked.length > 1) {
    const total = ranked.reduce((a, c) => a + c.weight, 0);
    let r = seededRandom(`${fen}|${targetElo}|h`) * total;
    for (const c of ranked) { r -= c.weight; if (r <= 0) { selected = c; break; } }
  }
  return {
    move: selected.move,
    stockfishMove: stockfish.move,
    probability: selected.probability ?? 0,
    loss: selected.loss ?? 0,
    candidateCount: safe.length,
    sampled: !!sample,
    candidates: ranked,
  };
}

export function analyzeFen(model, fen, { topN = 3, targetElo = MIN_MAIA_ELO } = {}) {
  const pos = parseFen(fen);
  const { moves, probs, wdl, q } = policyDistribution(model, pos, targetElo);
  if (moves.length === 0) {
    return { fen, moves: [], wdl: null, q: null, gameOver: true, turn: pos.turn, simulated: false };
  }

  const w = weakness(targetElo);
  let pick;
  if (w > 0) {
    let r = seededRandom(`${fen}|${targetElo}`);
    pick = probs.length - 1;
    for (let i = 0; i < probs.length; i++) {
      r -= probs[i];
      if (r <= 0) { pick = i; break; }
    }
  } else {
    pick = probs.indexOf(Math.max(...probs));
  }

  const order = probs.map((p, i) => i).filter((i) => i !== pick).sort((a, b) => probs[b] - probs[a]);
  const ranked = [pick, ...order].slice(0, topN).map((i) => ({
    uci: moveToUci(moves[i]),
    san: moveToSan(pos, moves[i]),
    text: describeMove(pos, moves[i]),
    probability: probs[i],
  }));

  // The network's value is from the side to move's point of view.
  return { fen, moves: ranked, wdl, q, gameOver: false, turn: pos.turn, simulated: w > 0 };
}
