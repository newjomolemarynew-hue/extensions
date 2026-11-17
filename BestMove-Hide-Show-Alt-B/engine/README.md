# Engine

The Stockfish 19 engine is bundled here. Nothing to download.

- `stockfish-19-lite-single.js` + `stockfish-19-lite-single.wasm`
  Stockfish 19 (NNUE), single-threaded WebAssembly build.
  The single-threaded flavour is used because it runs without
  cross-origin-isolation headers, which an extension page cannot set.
- `LICENSE-stockfish.txt`: Stockfish is GPLv3; this folder ships under that
  licence.

The engine is loaded as a Web Worker from `offscreen.html`, because an MV3
service worker cannot keep a multi-megabyte WASM engine alive. All analysis
happens on your machine; no position ever leaves the browser.

LCZero is not bundled: it needs a browser-compatible engine build and a
compatible network file before it can be selected in the extension.
