import { loadNetwork } from './maia-net.js';
import { analyzeFen, humanizeCandidates } from './analyze.js';

const SUPPORTED_ELOS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
const models = new Map();
let pending = null;
let busy = false;
const MAX_CANDIDATES = 20;

function nearestElo(elo) {
  return SUPPORTED_ELOS.reduce((best, value) =>
    Math.abs(value - elo) < Math.abs(best - elo) ? value : best
  );
}

// Any rating maps to one or two Maia networks: 1640 -> 60% maia-1600 + 40% maia-1700.
// Below 1100 / above 1900 the edge network is used (analyze.js flattens it for weaker targets).
function blendFor(elo) {
  const clamped = Math.max(1100, Math.min(1900, elo));
  const lo = Math.min(1800, Math.floor(clamped / 100) * 100), t = (clamped - lo) / 100;
  if (t < 0.12) return [{ elo: lo, weight: 1 }];
  if (t > 0.88) return [{ elo: lo + 100, weight: 1 }];
  return [{ elo: lo, weight: 1 - t }, { elo: lo + 100, weight: t }];
}
async function getBlend(elo) {
  const parts = blendFor(elo);
  const nets = await Promise.all(parts.map((p) => getModel(p.elo)));
  return { blend: parts.map((p, i) => ({ model: nets[i], weight: p.weight })), elo: parts.reduce((a, b) => (b.weight > a.weight ? b : a)).elo, blendElos: parts.map((p) => p.elo) };
}

function getModel(elo) {
  if (!models.has(elo)) {
    const loading = (async () => {
      const url = new URL(`../assets/weights/maia-${elo}.pb.gz`, import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Missing Maia weights maia-${elo}.pb.gz (${response.status})`);
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser does not support gzip decompression for Maia weights');
      }
      const raw = await new Response(
        response.body.pipeThrough(new DecompressionStream('gzip'))
      ).arrayBuffer();
      return loadNetwork(new Uint8Array(raw));
    })();
    models.set(elo, loading);
    loading.catch(() => models.delete(elo));
  }
  return models.get(elo);
}

async function drain() {
  if (busy) return;
  busy = true;
  while (pending) {
    const request = pending;
    pending = null;
    const { requestId } = request;
    try {
      const started = performance.now();
      const { blend: model, elo, blendElos } = await getBlend(request.targetElo);
      const result = request.candidates
        ? humanizeCandidates(model, request.fen, request.candidates, {
          targetElo: request.targetElo,
          maxLoss: request.maxLoss,
          sample: !!request.sample,
        })
        : analyzeFen(model, request.fen, {
          topN: 3,
          targetElo: request.targetElo,
        });
      if (!result) throw new Error('No legal Stockfish candidates to humanize');
      const selectedMove = result.move || result.moves?.[0]?.uci || null;
      const selectedCandidate = result.candidates?.find((candidate) => candidate.move === selectedMove);
      const selectedPrediction = result.moves?.find((move) => move.uci === selectedMove);
      self.postMessage({
        type: 'MAIA_RESULT',
        requestId,
        ...result,
        elo, blendElos,
        move: selectedMove,
        san: selectedCandidate?.san ?? selectedPrediction?.san ?? null,
        text: selectedCandidate?.text ?? selectedPrediction?.text ?? null,
        ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      self.postMessage({
        type: 'MAIA_ERROR',
        requestId,
        error: String(error?.message ?? error),
      });
    }
  }
  busy = false;
}

self.onmessage = ({ data }) => {
  if (data?.type === 'ANALYZE') {
    if (typeof data.fen !== 'string' || data.fen.length > 128 || data.fen.trim().split(/\s+/).length !== 6) {
      self.postMessage({ type: 'MAIA_ERROR', requestId: data.requestId, error: 'A FEN position is required' });
      return;
    }
    const targetElo = Number.isFinite(data.targetElo) ? Math.max(100, Math.min(3200, Math.round(data.targetElo))) : 1500;
    if (pending) {
      self.postMessage({
        type: 'MAIA_ERROR',
        requestId: pending.requestId,
        error: 'superseded',
      });
    }
    pending = {
      requestId: data.requestId,
      fen: data.fen,
      targetElo,
      candidates: Array.isArray(data.candidates) ? data.candidates.slice(0, MAX_CANDIDATES) : null,
      maxLoss: data.maxLoss,
      sample: !!data.sample,
    };
    drain();
  }
};
