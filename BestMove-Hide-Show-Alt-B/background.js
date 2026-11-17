let creating = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({ url: "offscreen.html", reasons: ["WORKERS"], justification: "Run Stockfish WASM" })
      .finally(() => (creating = null));
  }
  await creating;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ratingCachePrefix = "bmChessComRatings:";
const ratingCacheTtl = 12 * 60 * 60 * 1000;
let ratingQueue = Promise.resolve();
const ratingRequests = new Map();

function toDataUrl(type, buffer) {
  const bytes = new Uint8Array(buffer); let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}
// Piece skins used to be downloaded from a public catalog; that was removed in 3.4.1. Clear what older versions left behind.
try { caches.delete("bm-skins-v1"); chrome.storage.local.remove("bmCatalogCache"); } catch (_) {}

// ---- CSS fallback: insertCSS is not subject to the page's content-security policy ----
async function setTabCss(tabId, css) {
  const key = `bmCss:${tabId}`, prev = (await chrome.storage.session.get(key))[key];
  if (prev) await chrome.scripting.removeCSS({ target: { tabId }, css: prev, origin: "USER" }).catch(() => {});
  if (css) { await chrome.scripting.insertCSS({ target: { tabId }, css, origin: "USER" }); await chrome.storage.session.set({ [key]: css }); }
  else await chrome.storage.session.remove(key);
}


// ---- Suggestions: POST to the feedback endpoint, with a small offline queue ----
const SUGGESTION_URL = "https://best-move-style-atlas.lovable.app/api/public/v1/suggestions";
const QUEUE_KEY = "bmSuggestionQueue", QUEUE_MAX = 20, SEND_GAP_MS = 20000;
let lastSuggestionAt = 0, flushing = null;

function validSuggestion(b) {
  if (!b || typeof b !== "object") return null;
  const user = String(b.user || "").trim().slice(0, 40), message = String(b.message || "").trim().slice(0, 2000);
  if (!user || message.length < 5) return null;
  const out = { user, message };
  if (b.data && typeof b.data === "object") out.data = { category: String(b.data.category || "other").slice(0, 20), ...(b.data.selectedStyle ? { selectedStyle: String(b.data.selectedStyle).slice(0, 60) } : {}) };
  if (b.info && typeof b.info === "object") out.info = { extensionVersion: String(b.info.extensionVersion || "").slice(0, 20), page: String(b.info.page || "").slice(0, 30) };
  return out;
}
// Returns "ok", "retry" (server down / not live yet / rate limited) or "rejected" (the server refused the content).
async function postSuggestion(body) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(SUGGESTION_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal, cache: "no-store" });
    if (res.ok) return "ok";
    if (res.status === 400 || res.status === 413 || res.status === 422) return "rejected";
    return "retry";
  } catch (_) { return "retry"; } finally { clearTimeout(timer); }
}
async function readQueue() { const r = await chrome.storage.local.get(QUEUE_KEY); return Array.isArray(r[QUEUE_KEY]) ? r[QUEUE_KEY] : []; }
async function enqueueSuggestion(body) {
  const q = await readQueue(); q.push({ body, at: Date.now() });
  await chrome.storage.local.set({ [QUEUE_KEY]: q.slice(-QUEUE_MAX) });
}
function flushSuggestions() {
  if (flushing) return flushing;
  flushing = (async () => {
    let q = await readQueue(); if (!q.length) return 0;
    const left = []; let sent = 0, down = false;
    for (const item of q) {
      if (down || Date.now() - item.at > 30 * 24 * 3600 * 1000) { if (!down) continue; left.push(item); continue; }
      const r = await postSuggestion(item.body);
      if (r === "ok") sent++; else if (r === "retry") { down = true; left.push(item); }
    }
    await chrome.storage.local.set({ [QUEUE_KEY]: left });
    return sent;
  })().catch(() => 0).finally(() => { flushing = null; });
  return flushing;
}
async function handleSuggestion(raw) {
  const body = validSuggestion(raw);
  if (!body) return { ok: false, error: "Please write a few words so we know what you mean." };
  if (Date.now() - lastSuggestionAt < 4000) return { ok: false, error: "One moment, then try again." };
  lastSuggestionAt = Date.now();
  const result = await postSuggestion(body);
  if (result === "ok") { flushSuggestions(); return { ok: true }; }
  if (result === "rejected") return { ok: false, error: "The server didn't accept that message. Try shortening it." };
  await enqueueSuggestion(body);
  return { ok: true, queued: true };
}
if (typeof setTimeout === "function") setTimeout(() => flushSuggestions(), 3000);

// ---- Spotify relay ----
async function spotifyCommand(cmd) {
  if (!["prev", "toggle", "next"].includes(cmd)) return { error: "Unknown command" };
  const tabs = await chrome.tabs.query({ url: "https://open.spotify.com/*" });
  if (!tabs.length) return { error: "Open Spotify in a browser tab first" };
  tabs.sort((a, b) => (b.audible ? 1 : 0) - (a.audible ? 1 : 0) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  try { return (await chrome.tabs.sendMessage(tabs[0].id, { type: "bm-spotify-cmd", cmd })) || { ok: false }; }
  catch (_) { return { error: "Reload the Spotify tab once so Best Move can control it" }; }
}
const artCache = new Map();
async function spotifyArt(url) {
  let host = ""; try { const u = new URL(url); host = u.protocol === "https:" ? u.hostname : ""; } catch (_) {}
  if (!/(^|\.)(scdn\.co|spotifycdn\.com)$/.test(host)) return { error: "Unsupported image host" };
  if (artCache.has(url)) return { dataUrl: artCache.get(url) };
  const response = await fetch(url); if (!response.ok) return { error: "Image unavailable" };
  const type = (response.headers.get("content-type") || "image/jpeg").split(";")[0];
  const dataUrl = toDataUrl(type, await response.arrayBuffer());
  if (artCache.size > 12) artCache.delete(artCache.keys().next().value);
  artCache.set(url, dataUrl); return { dataUrl };
}
chrome.tabs.onRemoved.addListener(async () => {
  try { if (!(await chrome.tabs.query({ url: "https://open.spotify.com/*" })).length) await chrome.storage.local.set({ bmSpotify: { active: false, ts: 0 } }); } catch (_) {}
});

function normalizedRating(rating) {
  return Number.isInteger(rating) && rating >= 0 ? rating : null;
}

function getPlayerRatings(username) {
  const normalized = String(username || "").trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_-]{1,25}$/.test(normalized)) return Promise.resolve({ error: "Invalid Chess.com username" });
  const cacheKey = ratingCachePrefix + normalized;
  if (ratingRequests.has(cacheKey)) return ratingRequests.get(cacheKey);
  const operation = (async () => {
    const cachedValues = await chrome.storage.local.get(cacheKey);
    const cached = cachedValues[cacheKey];
    if (cached && Date.now() - cached.fetchedAt < ratingCacheTtl) return { ...cached.value, cached: true };

    const resultPromise = ratingQueue.then(async () => {
      const response = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(normalized)}/stats`, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (response.status === 404) return { error: "Chess.com player was not found" };
      if (!response.ok) return { error: `Chess.com ratings request failed (${response.status})` };
      const data = await response.json();
      const ratings = {};
      for (const key of ["chess_bullet", "chess_blitz", "chess_rapid", "chess_daily"]) {
        const rating = normalizedRating(data?.[key]?.last?.rating);
        ratings[key] = rating == null ? null : { last: { rating } };
      }
      return { username: normalized, ratings };
    });
    ratingQueue = resultPromise.then(() => undefined, () => undefined);
    const value = await resultPromise;
    if (!value.error) await chrome.storage.local.set({ [cacheKey]: { fetchedAt: Date.now(), value } });
    return value;
  })();
  ratingRequests.set(cacheKey, operation);
  return operation.finally(() => {
    if (ratingRequests.get(cacheKey) === operation) ratingRequests.delete(cacheKey);
  });
}

async function askEngine(msg) {
  await ensureOffscreen();
  // The engine page may still be loading its WebAssembly; wait up to ~6 s before giving up.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await chrome.runtime.sendMessage({ target: "offscreen", ...msg });
      if (res !== undefined) return res;
    } catch (_) { /* offscreen page not listening yet */ }
    await sleep(i < 10 ? 50 : 100);
    if (i === 30) await ensureOffscreen().catch(() => {});   // it may have been closed in the meantime
  }
  return { error: "Engine did not respond" };
}

chrome.runtime.onStartup.addListener(() => { ensureOffscreen().catch(() => {}); flushSuggestions(); });
chrome.runtime.onInstalled.addListener(() => ensureOffscreen().catch(() => {}));

const CONTENT_FILES = ["chess.js", "brain.js", "liquid.js", "customization/pieces.js", "customization/fx.js", "customization/board-fx.js", "customization/customization.js",
  "features/fx-live.js", "features/spotify-widget.js", "features/board-state.js", "features/game-mode.js", "features/player-ratings.js",
  "features/opponent-auto-config.js", "features/engine-client.js", "features/arrow-renderer.js", "features/auto-play.js", "features/panel-template.js", "features/feedback.js", "features/review-prompt.js", "features/whats-new.js", "features/live-panel.js", "content.js"];

async function restartPanel(tab) {
  if (!tab || !tab.id) throw new Error("No active tab is available");
  if (!/^https:\/\/www\.chess\.com\//.test(tab.url || "")) throw new Error("Open a Chess.com tab first");
  // The panel's detached flag is tab-session state. Clear it in the page's
  // main world, then reload so the manifest content scripts build a fresh panel.
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: () => { try { sessionStorage.removeItem("bmPanelDetached"); } catch (_) {} }
  });
  await chrome.tabs.reload(tab.id);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if ((msg.type === "bm-insert-css" || msg.type === "bm-remove-css") && !msg.target) {
    const tabId = _sender.tab && _sender.tab.id; if (!tabId) { sendResponse({ error: "No tab" }); return; }
    setTabCss(tabId, msg.type === "bm-insert-css" ? String(msg.css || "").slice(0, 4_000_000) : "").then(() => sendResponse({ ok: 1 })).catch((e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg.type === "bm-suggestion" && !msg.target) { handleSuggestion(msg.body).then(sendResponse).catch(() => sendResponse({ ok: false, error: "Could not send. Please try again." })); return true; }
  if (msg.type === "bm-flush-suggestions" && !msg.target) { flushSuggestions().then((n) => sendResponse({ sent: n })); return true; }
  if (msg.type === "bm-spotify-cmd" && !msg.target) { spotifyCommand(msg.cmd).then(sendResponse); return true; }
  if (msg.type === "bm-spotify-art" && !msg.target) { spotifyArt(String(msg.url || "")).then(sendResponse).catch((e) => sendResponse({ error: String(e) })); return true; }
  if (msg.type === "openCustomization" && !msg.target) {
    chrome.windows.create({ url: chrome.runtime.getURL("customization/index.html"), type: "popup", width: 1240, height: 900 }, (win) => {
      if (chrome.runtime.lastError) sendResponse({ error: chrome.runtime.lastError.message });
      else sendResponse({ ok: 1, windowId: win && win.id });
    });
    return true;
  }
  if ((msg.type === "openReview" || msg.type === "openAnalysis") && !msg.target) {
    const open = () => chrome.windows.create({ url: chrome.runtime.getURL("analysis.html"), type: "popup", width: 1540, height: 980 }, () => void chrome.runtime.lastError);
    if (msg.payload) chrome.storage.local.set({ bmReviewInbox: msg.payload }, open); else chrome.storage.local.remove("bmReviewInbox", open);
    sendResponse({ ok: 1 }); return;
  }
  if (msg.type === "get-player-ratings" && !msg.target) {
    getPlayerRatings(msg.username)
      .then(sendResponse)
      .catch((error) => sendResponse({ error: `Chess.com ratings request failed: ${error.message || error}` }));
    return true;
  }
  if (msg.type === "showPanel" && !msg.target) {
    chrome.tabs.get(msg.tabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      restartPanel(tab)
        .then(() => sendResponse({ ok: 1 }))
        .catch((error) => sendResponse({ error: error.message || String(error) }));
    });
    return true;
  }
  if (msg.type === "warm" && !msg.target) { ensureOffscreen().then(() => sendResponse({ ok: 1 })).catch(() => sendResponse({ ok: 0 })); return true; }
  if (msg.target || !["analyze", "maia-analyze"].includes(msg.type)) return; // ignore internal traffic
  askEngine(msg).then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
  return true;
});

// Open the toolbar interface in a normal extension window so it can be minimized or closed.
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({ url: chrome.runtime.getURL("customization/popup.html"), type: "popup", width: 390, height: 690 }, () => void chrome.runtime.lastError);
});
