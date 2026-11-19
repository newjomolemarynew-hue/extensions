# Engine licences and provenance — KnightScope V12

## PlentyChess 8.0.0
- Upstream: https://github.com/Yoshie2000/PlentyChess, tag `b-v8.0.0`, commit `50ad9f1b523063cbbbf599fe0547f42870fe2906`.
- Engine licence: GPL-3.0.
- Network: `0178r.bin` from https://github.com/Yoshie2000/PlentyNetworks/releases/download/0178r/0178r.bin; PlentyNetworks is GPL-3.0.
- Browser build: single-thread Emscripten; artifact hashes are recorded in `engine/provenance/plentychess.manifest.json`.
- Corresponding source: https://assets.0x88.app/plentychess/plentychess-emscripten-single-thread-corresponding-source.tar.gz

## Stormphrax 8.0.0
- Upstream: https://github.com/Ciekce/Stormphrax, tag `v8.0.0`, commit `582965517ed2032d41a6b4cd6c2e66b1b934e2ad`.
- Engine licence: GPL-3.0-or-later.
- Network: `undertown.nnue`, release network from https://github.com/Ciekce/stormphrax-nets/releases/download/undertown/undertown.nnue; the upstream browser-build provenance identifies it as the self-trained 8.0.0 network.
- Browser build: single-thread Emscripten; artifact hashes are recorded in `engine/provenance/stormphrax.manifest.json`.
- Corresponding source: https://assets.0x88.app/stormphrax/stormphrax-emscripten-single-thread-corresponding-source.tar.gz

## Stockfish 19
- Existing bundled engine; see `engine/COPYING.txt` and the existing engine README.

The browser-build source archives are hosted by the upstream browser-build project at the URLs above. The extension includes the pinned provenance and SHA-256 records.