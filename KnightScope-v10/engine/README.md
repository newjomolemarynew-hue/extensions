# V9 engine package directory

Stockfish 19 is the currently bundled UCI analysis engine in `../engine/`.

Additional engines must be integrated as complete browser-compatible packages, not just added to the selector. Each package needs:
- its worker bridge / UCI adapter;
- its JavaScript and WebAssembly runtime files;
- required NNUE or neural-network weights;
- any required browser threading / SIMD compatibility handling;
- applicable license and source notices.

The Analysis Board engine wrapper accepts a worker URL in V9. New engine adapters can be registered in `analysis.js` once their packages are added and tested. Do not mark an engine as bundled until all required assets are present.
