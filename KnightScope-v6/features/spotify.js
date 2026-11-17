// Runs on open.spotify.com. Reads what's playing and performs back / play-pause / next.
// It only clicks Spotify's own buttons and reports state to the extension; nothing leaves the browser.
(() => {
  if (window.__bmSpotify) return; window.__bmSpotify = true;
  const KEY = "bmSpotify", $ = (s) => document.querySelector(s);
  const BTN = { prev: '[data-testid="control-button-skip-back"]', toggle: '[data-testid="control-button-playpause"]', next: '[data-testid="control-button-skip-forward"]' };
  let lastJson = "", lastWrite = 0, artFor = "";
  // Spotify serves covers as 64 / 300 / 640 px variants that differ only in a hash prefix; the 300 px one is sharp enough and light.
  const bigCover = (u) => (u ? u.replace(/(ab67616d0000|ab67616d)(4851|1e02)/, "ab67616d00001e02").replace(/(ab6761610000|ab67706c0000)(f1[0-9a-f]{2}|4851)/, "$1$2") : "");
  // The cover is converted to a small JPEG data URL right here (this page is allowed to read Spotify's image CDN),
  // so the Chess.com mini player never has to fetch from Spotify itself.
  async function saveArt(url) {
    if (!url || url === artFor) return; artFor = url;
    let data = "";
    try {
      const blob = await (await fetch(url, { credentials: "omit" })).blob();
      const bmp = await createImageBitmap(blob), size = 360, c = document.createElement("canvas"); c.width = c.height = size;
      c.getContext("2d").drawImage(bmp, 0, 0, size, size); data = c.toDataURL("image/jpeg", 0.88);
    } catch (_) { data = ""; }
    try { chrome.storage.local.set({ bmSpotifyArt: { url, data, ts: Date.now() } }); } catch (_) {}
  }

  function read() {
    const toggle = $(BTN.toggle), label = ((toggle && (toggle.getAttribute("aria-label") || toggle.title)) || "").toLowerCase();
    const ms = navigator.mediaSession, md = ms && ms.metadata;
    const txt = (sel) => { const e = $(sel); return e ? e.textContent.trim() : ""; };
    let title = txt('[data-testid="context-item-link"]') || (md && md.title) || "";
    let artist = txt('[data-testid="context-item-info-artist"]') || txt('[data-testid="now-playing-widget"] a[href*="/artist/"]') || (md && md.artist) || "";
    if (!title && / • /.test(document.title)) { const [t, a] = document.title.split(" • "); title = t; artist = artist || a; }
    const imgs = [...document.querySelectorAll('[data-testid="cover-art-image"], [data-testid="now-playing-widget"] img, footer img, [data-testid="now-playing-bar"] img')];
    const domArt = (imgs.find((i) => /scdn\.co|spotifycdn\.com/.test(i.currentSrc || i.src)) || {}).currentSrc || "";
    const mediaArt = md && md.artwork && md.artwork.length ? [...md.artwork].sort((a, b) => parseInt(b.sizes || 0) - parseInt(a.sizes || 0))[0].src : "";
    const art = bigCover(mediaArt || domArt);
    const playing = label ? /pause/.test(label) : !!(ms && ms.playbackState === "playing");
    return { active: true, title, artist, art, playing, canSkip: !!($(BTN.next) || $(BTN.prev)) };
  }
  function push(force) {
    let s; try { s = read(); } catch (_) { return; }
    const json = JSON.stringify(s), now = Date.now();
    if (!force && json === lastJson && now - lastWrite < 4000) return;     // only write on change, plus a heartbeat
    lastJson = json; lastWrite = now; if (s.art) saveArt(s.art);
    try { chrome.storage.local.set({ [KEY]: { ...s, ts: now } }); } catch (_) {}
  }
  function command(cmd) {
    const el = $(BTN[cmd]); if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    el.click(); setTimeout(() => push(true), 150); return true;
  }
  try { chrome.runtime.onMessage.addListener((m, _s, respond) => { if (m && m.type === "bm-spotify-cmd") { respond({ ok: command(m.cmd) }); } }); } catch (_) {}
  setInterval(() => { if (!chrome.runtime || !chrome.runtime.id) return; push(false); }, 1000);
  addEventListener("pagehide", () => { try { chrome.storage.local.set({ [KEY]: { active: false, ts: 0 } }); } catch (_) {} });
  push(true);
})();
