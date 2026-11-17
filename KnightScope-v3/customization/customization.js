// Shared look-and-feel loader (Chess.com panel, Analysis, popup, Studio).
//  - Static looks are generated locally from colours (BMPieces): no downloads.
//  - Nothing is downloaded: pieces (with added parts and hand-drawn strokes), board textures and animated
//    board backgrounds are all generated locally.
//  - Everything is saved in the user's own extension storage (chrome.storage.local).
(() => {
  const KEY = "bmCustomization";
  const PIECE_THEME_KEY = "bmChessComPieceTheme";
  const CODES = ["wk", "wq", "wr", "wb", "wn", "wp", "bk", "bq", "br", "bb", "bn", "bp"];
  const HEX = /^#[0-9a-f]{6}$/i;
  const Pc = self.BMPieces;

  const BOARDS = [
    { id: "default", name: "Chess.com", light: null, dark: null },
    { id: "classic", name: "Classic", light: "#ebecd0", dark: "#739552" },
    { id: "walnut", name: "Walnut", light: "#f0d9b5", dark: "#b58863" },
    { id: "ice", name: "Ice", light: "#e8f1f8", dark: "#7fa6c4" },
    { id: "slate", name: "Slate", light: "#c9ced6", dark: "#5f6b7a" },
    { id: "midnight", name: "Midnight", light: "#6d7aa8", dark: "#2a3158" },
    { id: "rose", name: "Rose", light: "#f6e3e6", dark: "#c98a98" },
    { id: "ocean", name: "Ocean", light: "#cfe9e6", dark: "#3f8f94" },
    { id: "violet", name: "Violet", light: "#e6dcf5", dark: "#8266b8" },
    { id: "sunset", name: "Sunset", light: "#ffe3c2", dark: "#e07a5f" },
    { id: "mono", name: "Mono", light: "#e9e9e9", dark: "#8a8a8a" },
    { id: "ember", name: "Ember", light: "#d9c2a6", dark: "#4a3426" }
  ];
  const DEFAULTS = Object.freeze({
    pieceSource: "chesscom",           // "chesscom" (the site's own) | "theme" (a Chess.com piece set + your parts) | "local" (designed here)
    pieceTheme: "neo",
    presetId: "ivory",                 // preset id, or "custom"
    piece: Pc.DEFAULT_PIECE,
    fx: Pc.FX_DEFAULT,
    boardStyle: "default",
    boardTexture: "none",              // see TEXTURES
    boardAnim: "none",                 // see BMBoardFx.STYLES
    boardAnimPower: 60,
    squareColors: Object.freeze({ light: "#ebecd0", dark: "#739552" }),
    reducedMotion: false,
    glass: 55,
    spotify: true,
    myPresets: []
  });

  const boardById = (id) => BOARDS.find((b) => b.id === id) || BOARDS[0];
  const reducedPref = () => { try { return !!(self.matchMedia && self.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (_) { return false; } };
  const send = (message) => new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (!response) reject(new Error("No response from the extension"));
        else if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    } catch (error) { reject(error); }
  });

  // ---------- settings ----------
  const clampN = (v, a, b, d) => (Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : d);
  function normalize(input) {
    const s = input && typeof input === "object" ? input : {};
    const board = boardById(s.boardStyle), sc = s.squareColors || {};
    const colors = {
      light: HEX.test(sc.light || "") ? sc.light : board.light || DEFAULTS.squareColors.light,
      dark: HEX.test(sc.dark || "") ? sc.dark : board.dark || DEFAULTS.squareColors.dark
    };
    let source = s.pieceSource, presetId = s.presetId;
    if (!source && "pieceStyle" in s) source = s.pieceStyle === "" ? "chesscom" : "local";   // settings saved by an older version
    if (source === "catalog") source = "chesscom";            // animated skins were removed in 3.4.1
    if (!["chesscom", "theme", "local"].includes(source)) source = DEFAULTS.pieceSource;
    const preset = Pc.presetById(presetId);
    const piece = Pc.normalizePiece(s.piece && Object.keys(s.piece).length ? s.piece : preset ? preset.piece : DEFAULTS.piece);
    const mine = Array.isArray(s.myPresets) ? s.myPresets.slice(0, 8).filter((m) => m && typeof m.id === "string").map((m) => ({
      id: String(m.id).slice(0, 40), name: String(m.name || "My pieces").slice(0, 28), piece: Pc.normalizePiece(m.piece), fx: Pc.normalizeFx(m.fx)
    })) : [];
    return {
      pieceSource: source, pieceTheme: THEME_IDS.includes(s.pieceTheme) ? s.pieceTheme : DEFAULTS.pieceTheme,
      presetId: typeof presetId === "string" && (preset || presetId === "custom" || mine.some((m) => m.id === presetId)) ? presetId : "custom",
      piece, fx: Pc.normalizeFx(s.fx || (preset && !s.fx ? preset.fx : DEFAULTS.fx)),
      boardStyle: board.id, squareColors: colors,
      boardTexture: TEXTURES[s.boardTexture] ? s.boardTexture : "none",
      boardAnim: ["none", ...(self.BMBoardFx ? self.BMBoardFx.STYLES : [])].includes(s.boardAnim) ? s.boardAnim : "none",
      boardAnimPower: clampN(s.boardAnimPower, 10, 100, DEFAULTS.boardAnimPower),
      reducedMotion: !!s.reducedMotion, glass: clampN(s.glass, 0, 100, DEFAULTS.glass),
      spotify: s.spotify !== false, myPresets: mine
    };
  }
  const store = () => chrome.storage && chrome.storage.local;
  function rawGet(key) {
    return new Promise((resolve, reject) => {
      try { store().get(key, (v) => { const e = chrome.runtime.lastError; if (e) reject(new Error(e.message)); else resolve(v || {}); }); }
      catch (error) { reject(error); }
    });
  }
  async function load() {
    const values = await rawGet(KEY);
    return normalize(values[KEY]);
  }
  let writeQueue = Promise.resolve();
  function save(patch) {         // serialised read-modify-write so rapid slider changes never clobber each other
    const job = writeQueue.then(async () => {
      const current = normalize((await rawGet(KEY))[KEY]);
      const p = patch || {};
      const preset = p.boardStyle && !p.squareColors ? boardById(p.boardStyle) : null;
      const colors = preset && preset.light ? { light: preset.light, dark: preset.dark } : { ...current.squareColors, ...p.squareColors };
      const next = normalize({ ...current, ...p, piece: p.piece ? { ...current.piece, ...p.piece } : current.piece, fx: p.fx ? { ...current.fx, ...p.fx } : current.fx, squareColors: colors });
      await new Promise((resolve, reject) => { store().set({ [KEY]: next }, () => { const e = chrome.runtime.lastError; if (e) reject(new Error(e.message)); else resolve(); }); });
      return next;
    });
    writeQueue = job.catch(() => {});
    return job;
  }
  function watch(callback) {
    const listener = (changes, area) => { if (area === "local" && changes[KEY]) callback(normalize(changes[KEY].newValue)); };
    try { chrome.storage.onChanged.addListener(listener); } catch (_) { return () => {}; }
    return () => { try { chrome.storage.onChanged.removeListener(listener); } catch (_) {} };
  }

  // ---------- CSS ----------
  const IMP = (important) => (important ? "!important" : "");
  // Chess.com's own piece sets (PNG, loaded from Chess.com itself, nothing is bundled).
  const THEMES = [["neo", "Neo"], ["classic", "Classic"], ["neo_wood", "Neo Wood"], ["wood", "Wood"], ["glass", "Glass"], ["game_room", "Game Room"], ["icy_sea", "Icy Sea"], ["ocean", "Ocean"],
    ["light", "Light"], ["bubblegum", "Bubblegum"], ["graffiti", "Graffiti"], ["lolz", "Lolz"], ["metal", "Metal"], ["newspaper", "Newspaper"], ["nature", "Nature"], ["space", "Space"],
    ["sky", "Sky"], ["vintage", "Vintage"], ["tigers", "Tigers"], ["8_bit", "8-Bit"], ["neon", "Neon"], ["gothic", "Gothic"], ["marble", "Marble"], ["club", "Club"],
    ["3d_wood", "3D Wood"], ["3d_plastic", "3D Plastic"], ["3d_staunton", "3D Staunton"], ["3d_chesskid", "3D ChessKid"]];
  const THEME_IDS = THEMES.map((t) => t[0]);
  const themeUrl = (theme, code) => `https://images.chesscomfiles.com/chess-themes/pieces/${theme}/150/${code}.png`;
  // Images that make up one piece, from the top layer down. null = leave Chess.com's own piece alone.
  function pieceLayers(s, code) {
    if (s.pieceSource === "local") return [Pc.dataUri(code, s.piece)];
    if (s.pieceSource !== "theme") return null;
    const L = Pc.partsLayers(code, s.piece);
    return [L && L.front, themeUrl(s.pieceTheme, code), L && L.back].filter(Boolean);
  }
  function localPieceCss(s, selFor, important) {
    const b = IMP(important);
    return CODES.map((c) => { const L = pieceLayers(s, c); if (!L) return "";
      const n = L.length, rep = Array(n).fill("no-repeat").join(","), siz = Array(n).fill("contain").join(","), pos = Array(n).fill("center").join(",");
      return `${selFor(c)}{background-image:${L.map((u) => `url("${u}")`).join(",")}${b};background-repeat:${rep}${b};background-size:${siz}${b};background-position:${pos}${b}}`; }).join("");
  }
  // Procedural board textures (grey noise, blended over the square colours with "overlay").
  const noiseSvg = (freq, oct, seed, gain, off, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 400 400"><filter id="n" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${oct}" seed="${seed}"/>${extra}<feColorMatrix type="matrix" values="${gain} 0 0 0 ${off}  ${gain} 0 0 0 ${off}  ${gain} 0 0 0 ${off}  0 0 0 0 1"/></filter><rect width="400" height="400" filter="url(#n)"/></svg>`;
  const TEXTURES = {
    none: { name: "Flat" },
    wood: { name: "Wood grain", svg: () => noiseSvg("0.004 0.11", 5, 7, 1.35, -0.18) },
    marble: { name: "Marble", svg: () => noiseSvg("0.011 0.016", 6, 21, 1.6, -0.3, '<feComponentTransfer><feFuncR type="table" tableValues="0 .5 1 .5 0 .6 1 .45 0"/></feComponentTransfer>') },
    stone: { name: "Stone", svg: () => noiseSvg("0.06", 4, 3, 1.3, -0.15) },
    linen: { name: "Linen", svg: () => noiseSvg("0.9 0.04", 2, 11, 1.25, -0.12) },
    brushed: { name: "Brushed metal", svg: () => noiseSvg("0.003 0.9", 3, 5, 1.25, -0.12) }
  };
  const texUrl = (id) => { const t = TEXTURES[id]; return t && t.svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(t.svg()) : ""; };
  function boardCss(s, sel) {
    if (boardById(s.boardStyle).id === "default") return "";
    const { light, dark } = s.squareColors, tex = texUrl(s.boardTexture), conic = `conic-gradient(${dark} 25%,${light} 0 50%,${dark} 0 75%,${light} 0)`;
    // Chess.com's own board image sets no-repeat / a fixed size; without overriding those only one 2x2 tile (4 squares) would be painted.
    const base = `background-color:${light}!important;background-position:0 0!important;background-origin:border-box!important`;
    if (!tex) return `${sel}{background-image:${conic}!important;background-size:25% 25%!important;background-repeat:repeat!important;${base}}`;
    return `${sel}{background-image:url("${tex}"),${conic}!important;background-size:100% 100%,25% 25%!important;background-repeat:no-repeat,repeat!important;background-blend-mode:overlay,normal!important;${base}}`;
  }
  // Builds the whole stylesheet for a target (live board, review board or preview).
  function buildCss(settings, target) {
    const s = normalize(settings);
    const t = Object.assign({ piece: (c) => `.piece.${c}`, board: "wc-chess-board.board,chess-board.board,.board", important: true }, target);
    let css = t.board ? boardCss(s, t.board) : "";
    if (s.pieceSource === "local" || s.pieceSource === "theme") css += localPieceCss(s, t.piece, t.important);
    return css;
  }
  // Kept for older callers: nothing needs preparing any more (no downloads).
  async function prepare() { return {}; }

  // ---------- Chess.com's own piece theme (Analysis fallback) ----------
  const trustedImage = (url) => { try { const u = new URL(url); return u.protocol === "https:" && /(^|\.)chesscomfiles\.com$|(^|\.)chess\.com$/.test(u.hostname); } catch (_) { return false; } };
  const defaultPieceTheme = () => ({});
  function normalizePieceTheme(value) {
    const out = {}; if (!value || typeof value !== "object") return out;
    for (const code of CODES) { const t = value[code]; if (t && typeof t.image === "string" && trustedImage(t.image)) out[code] = { image: t.image, size: String(t.size || "contain"), position: String(t.position || "center") }; }
    return out;
  }
  async function captureChessComTheme() {
    try {
      if (!/(^|\.)chess\.com$/.test(location.hostname)) return;
      const theme = {};
      for (const code of CODES) {
        const el = document.querySelector(`.piece.${code}`); if (!el) continue;
        const cs = getComputedStyle(el), m = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage || "");
        if (m && trustedImage(m[1])) theme[code] = { image: m[1], size: cs.backgroundSize || "contain", position: cs.backgroundPosition || "center" };
      }
      if (Object.keys(theme).length >= 6) await new Promise((r) => store().set({ [PIECE_THEME_KEY]: theme }, () => r()));
    } catch (_) { /* best effort */ }
  }

  // ---------- applying on Chess.com ----------
  let token = 0, themeCaptured = false, lastCss = null;
  function liveStyleEl() {
    let el = document.getElementById("bm-skin-style");
    if (!el) { el = document.createElement("style"); el.id = "bm-skin-style"; (document.head || document.documentElement).appendChild(el); }
    return el;
  }
  const probe = () => document.querySelector("wc-chess-board .piece, chess-board .piece, .board .piece");
  // If the page's content-security policy ignored our <style>, hand the CSS to the service worker (insertCSS bypasses it).
  function verifyApplied(css) {
    setTimeout(() => {
      const el = probe(); if (!el) return;
      const bg = getComputedStyle(el).backgroundImage || "";
      if (!/data:|chesscomfiles/.test(bg)) { try { chrome.runtime.sendMessage({ type: "bm-insert-css", css }, () => void chrome.runtime.lastError); } catch (_) {} }
    }, 450);
  }
  async function applyLive(settings) {
    const my = ++token, s = normalize(settings), el = liveStyleEl();
    if (!themeCaptured) { themeCaptured = true; captureChessComTheme(); }
    const prep = await prepare(s);
    if (my !== token) return;
    const css = buildCss(s, {});
    if (css === lastCss) return;
    lastCss = css; el.textContent = css;
    if (s.pieceSource !== "chesscom") verifyApplied(css);
    else { try { chrome.runtime.sendMessage({ type: "bm-remove-css" }, () => void chrome.runtime.lastError); } catch (_) {} }
  }

  self.BMCustomization = {
    KEY, PIECE_THEME_KEY, CODES, DEFAULTS, BOARDS, PRESETS: Pc.PRESETS,
    load, save, watch, normalize, prepare, buildCss, applyLive, TEXTURES, texUrl,
    defaultPieceTheme, normalizePieceTheme, boardStyleInfo: boardById, THEMES, themeUrl, pieceLayers
  };
})();
