(() => {
  const MAX_STOCKFISH_ELO = 3200;
  const MIN_MAIA_ELO = 1100;
  const MAX_MAIA_ELO = 1900;

  // how many centipawns below the engine's best a human of this rating may drift
  const lossFor = (elo) => Math.round(Math.max(50, Math.min(220, 220 - (elo - 800) * 0.13)));

  function resolve({ enabled, mode, rating, speed }) {
    if (!enabled || mode !== "bot") {
      return { active: false, engineElo: null, moveTime: null, multipv: null, maiaElo: null, maiaMaxLoss: null };
    }

    const opponentElo = Number.isInteger(rating) && rating >= 0 ? rating : null;
    // any known rating is humanized: the worker blends neighbouring Maia networks and clamps to 1100..1900
    const maiaElo = opponentElo != null ? opponentElo : null;
    const moveTime = speed === "turbo" ? 350 : speed === "deep" ? 2500 : 1000;

    return {
      active: true,
      opponentElo,
      engineElo: MAX_STOCKFISH_ELO,
      moveTime,
      multipv: maiaElo == null ? 1 : 4,
      maiaElo,
      maiaMaxLoss: maiaElo == null ? 0 : lossFor(maiaElo)
    };
  }

  self.BMOpponentAutoConfig = { resolve };
})();
