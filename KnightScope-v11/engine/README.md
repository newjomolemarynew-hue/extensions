# Browser engine integration notes

KnightScope V11 currently bundles Stockfish 19 as its standalone UCI analysis engine.

Additional engines are not enabled until their browser worker, WASM/runtime files, NNUE or model weights (where required), threading requirements, and redistribution notices are included and tested. Maia's existing model files power human-like move selection in Best Move; they do not make Maia a standalone evaluation engine.

The generic worker integration point remains in `analysis.js`. Do not mark an engine available by changing a metadata flag alone.
