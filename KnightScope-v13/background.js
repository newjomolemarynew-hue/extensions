"use strict";
let creating = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({ url: "engine.html", reasons: ["WORKERS"], justification: "Run Stockfish WASM" })
      .finally(() => (creating = null));
  }
  await creating;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ratingCachePrefix = "bmChessComRatings:";
const ratingCacheTtl = 12 * 60 * 60 * 1000;
let ratingQueue = Promise.resolve();
const ratingRequests = new Map();

// Optional integrations are disabled in this Chess.com-only build.

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


const CONTENT_FILES = ["chess.js", "brain.js", "liquid.js", "customization/pieces.js", "customization/fx.js", "customization/board-fx.js", "customization/customization.js",
  "features/fx-live.js", "features/board-state.js", "features/game-mode.js", "features/player-ratings.js",
  "features/opponent-auto-config.js", "features/engine-client.js", "features/arrow-renderer.js", "features/auto-play.js", "features/panel-template.js", "features/review-prompt.js", "features/whats-new.js", "features/live-panel.js", "content.js"];

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
  if (msg.target || !["analyze", "maia-analyze"].includes(msg.type)) return; // ignore internal traffic
  askEngine(msg).then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
  return true;
});

// Open the toolbar interface in a normal extension window so it can be minimized or closed.
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({ url: chrome.runtime.getURL("customization/popup.html"), type: "popup", width: 390, height: 690 }, () => void chrome.runtime.lastError);
});

