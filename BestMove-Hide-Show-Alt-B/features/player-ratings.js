// Opponent identity + rating detection.
//
// How Chess.com shows ratings (researched):
//   * Each player strip is #board-layout-player-top / #board-layout-player-bottom. The username and the
//     rating shown for THIS game (e.g. "(1523)", with the parentheses) are inside it. That number is the rating the
//     player had when the game started, which is the one that matters for matching an opponent.
//   * https://www.chess.com/callback/{live|daily}/game/{id} is a same-origin JSON endpoint. Its game.pgnHeaders carry
//     White, Black, WhiteElo, BlackElo and TimeControl for the game in progress.
//   * https://api.chess.com/pub/player/{user}/stats is the public API: the player's CURRENT rating per time class.
// Order used here: on-screen rating -> game record -> public API (matching the game's time class) -> bot table.
(() => {
  const MODE_KEYS = { bullet: "chess_bullet", blitz: "chess_blitz", rapid: "chess_rapid", classical: "chess_rapid", daily: "chess_daily" };
  const BOT_DATABASE_PATH = "features/bot-ratings.json";
  let botDatabase = {}, botDatabasePromise = null;

  const normalizeUsername = (value) => {
    const username = String(value || "").trim().replace(/^@/, "").toLowerCase();
    return /^[a-z0-9_-]{1,25}$/.test(username) ? username : "";
  };
  const isBotUsername = (username) => { const n = normalizeUsername(username); return /-bot$/i.test(n) || botDatabase[n]?.isBot === true; };
  function loadBotDatabase() {
    if (!botDatabasePromise) {
      botDatabasePromise = (async () => {
        const response = await fetch(chrome.runtime.getURL(BOT_DATABASE_PATH));
        if (!response.ok) throw new Error(`Could not load bot rating database (${response.status})`);
        const database = await response.json();
        botDatabase = database && typeof database === "object" ? database : {};
        return botDatabase;
      })().catch((error) => { botDatabasePromise = null; throw error; });
    }
    return botDatabasePromise;
  }

  // "(1523)", "1,523", "Rating: 1523", "1523?" -> 1523
  function parseRating(text) {
    const m = String(text || "").replace(/,/g, "").match(/(?:^|[^\d])(\d{2,4})(?:[^\d]|$)/);
    const n = m ? +m[1] : NaN;
    return Number.isInteger(n) && n >= 100 && n <= 4000 ? n : null;
  }
  // "180+2" -> bullet/blitz/rapid by base time; "1/86400" (days per move) -> daily
  function classifyTimeControl(tc) {
    const s = String(tc || "").trim(); if (!s) return null;
    if (s.includes("/")) return "daily";
    const base = parseInt(s, 10); if (!Number.isFinite(base)) return null;
    return base < 180 ? "bullet" : base < 600 ? "blitz" : "rapid";
  }
  const ratingForMode = (ratings, mode) => {
    const key = MODE_KEYS[mode], r = key && ratings && ratings[key] && ratings[key].last && ratings[key].last.rating;
    return Number.isInteger(r) && r >= 0 ? r : null;
  };

  // ---------- reading the page ----------
  const USER_SEL = ['[data-test-element="user-tagline-username"]', ".user-tagline-username", ".user-username-component", 'a[href*="/member/"]', "[data-username]", ".bot-name", '[data-cy*="username"]'];
  const RATING_SEL = ['[data-test-element="user-tagline-rating"]', ".user-tagline-rating", ".rating-component", '[data-cy="user-tagline-rating"]', '[class*="rating"]'];
  function nameFrom(el) {
    const data = el.getAttribute && (el.getAttribute("data-username") || el.dataset?.username); if (data) return normalizeUsername(data);
    const link = el.matches?.("a[href]") ? el : el.closest?.("a[href]") || el.querySelector?.("a[href*='/member/']");
    if (link) { const m = String(link.getAttribute("href") || "").match(/\/member\/([^/?#]+)/i); if (m) { try { return normalizeUsername(decodeURIComponent(m[1])); } catch (_) {} } }
    const text = (el.textContent || "").trim().split(/\s+/).pop();       // "GM hikaru" -> "hikaru"
    return normalizeUsername(text);
  }
  function readStrip(container) {
    if (!container) return null;
    let username = "", display = "";
    for (const sel of USER_SEL) { const el = container.querySelector(sel); if (!el) continue; display = display || (el.textContent || "").trim(); username = nameFrom(el); if (username) break; }
    let rating = null;
    for (const sel of RATING_SEL) { const el = container.querySelector(sel); if (!el) continue; rating = parseRating(el.textContent || el.getAttribute("data-rating") || el.getAttribute("aria-label")); if (rating != null) break; }
    if (!username && rating == null) return null;
    return { username, display, rating };
  }
  function readPlayers() {
    let top = document.querySelector("#board-layout-player-top"), bottom = document.querySelector("#board-layout-player-bottom");
    if (!top || !bottom) {                                             // layout without the ids: order the strips by position (rare, so the layout read is fine)
      const strips = [...document.querySelectorAll(".player-component, .user-tagline-component, .player-tagline")].filter((e, i, a) => !a.some((o) => o !== e && o.contains(e)));
      if (strips.length >= 2) { strips.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); top = top || strips[0]; bottom = bottom || strips[strips.length - 1]; }
    }
    return { top: readStrip(top), bottom: readStrip(bottom) };
  }
  function gameRef() {
    const p = location.pathname, h = location.hash;
    let m = p.match(/\/game\/(live|daily)\/(\d+)/) || p.match(/\/(live|daily)\/game\/(\d+)/);
    if (m) return { type: m[1], id: m[2] };
    m = h.match(/g=(\d+)/); if (m && /\/live/.test(p)) return { type: "live", id: m[1] };
    m = p.match(/\/game\/(\d+)/); if (m) return { type: /daily/.test(p) ? "daily" : "live", id: m[1] };
    return null;
  }

  function create({ request, onChange, onGame } = {}) {
    let revision = 0, activeKey = "", lastRead = 0, game = null, gameKey = "";
    let current = { username: "", kind: "unknown", mode: "unknown", rating: null, source: "", status: "waiting" };
    const publish = (next) => { current = next; revision++; if (typeof onChange === "function") onChange(current); };

    async function fetchGame(ref) {
      const key = ref.type + ref.id; if (key === gameKey) return game;
      gameKey = key; game = null;
      try {
        const response = await fetch(`https://www.chess.com/callback/${ref.type}/game/${ref.id}`, { credentials: "include", headers: { Accept: "application/json" } });
        if (!response.ok) return null;
        const json = await response.json(), g = json.game || json, h = g.pgnHeaders || g.pgn_headers || {};
        game = {
          white: normalizeUsername(h.White), black: normalizeUsername(h.Black),
          whiteElo: parseRating(h.WhiteElo), blackElo: parseRating(h.BlackElo),
          timeClass: (g.timeClass || g.time_class || "").toString().toLowerCase() || classifyTimeControl(h.TimeControl),
          timeControl: h.TimeControl || null
        };
        if (typeof onGame === "function") onGame(game);
      } catch (_) { game = null; gameKey = ""; }
      return game;
    }

    function update(board, state, mode) {
      const now = Date.now();
      if (now - lastRead < (current.status === "ready" ? 1500 : 450)) return current;     // light throttle; reading by id is cheap
      lastRead = now;
      const players = readPlayers();
      const bottomColor = state.flipped ? "b" : "w", oppSide = state.me === bottomColor ? "top" : "bottom";
      const strip = players[oppSide] || {};
      const ref = gameRef(), oppColor = state.me === "w" ? "b" : "w";
      const key = [strip.username || "", strip.rating ?? "", mode.cls, oppColor, ref ? ref.type + ref.id : "", game && game.timeClass || ""].join("|");
      if (key === activeKey) return current;
      activeKey = key;

      const base = { username: strip.username || "", visibleRating: strip.rating ?? null, kind: mode.cls === "bot" ? "bot" : strip.username ? "human" : "unknown", mode: mode.cls, rating: null, source: "", status: "loading" };
      // 1) the rating on screen is the rating for this game
      if (strip.rating != null) {
        publish({ ...base, rating: strip.rating, source: "shown on Chess.com", status: "ready" });
        if (ref && !game) fetchGame(ref).then((g) => { if (g) activeKey = ""; });                    // time class only
        return current;
      }
      publish({ ...base, status: base.username || mode.cls === "bot" || ref ? "loading" : "username-unavailable" });
      resolveSlow(key, base, ref, oppColor, mode);
      return current;
    }

    async function resolveSlow(key, base, ref, oppColor, mode) {
      const stale = () => key !== activeKey;
      try {
        let username = base.username, rating = null, source = "", kind = base.kind;
        try { await loadBotDatabase(); } catch (_) { /* bot table is optional */ }
        // 2) game record (also reveals the opponent's name when the page didn't)
        if (ref) {
          const g = await fetchGame(ref); if (stale()) return;
          if (g) {
            const name = oppColor === "w" ? g.white : g.black, elo = oppColor === "w" ? g.whiteElo : g.blackElo;
            username = username || name;
            if (elo != null) rating = elo, source = "game record";
          }
        }
        if (username && isBotUsername(username)) kind = "bot";
        if (rating == null && kind === "bot" && username && botDatabase[username] && Number.isInteger(botDatabase[username].rating)) {
          rating = botDatabase[username].rating; source = botDatabase[username].source || "bot table";
        }
        // 3) public API, matching the game's time class (never another class)
        const cls = MODE_KEYS[mode.cls] ? mode.cls : game && MODE_KEYS[game.timeClass] ? game.timeClass : null;
        if (rating == null && username && kind !== "bot" && cls && typeof request === "function") {
          const response = await request(username); if (stale()) return;
          if (response && response.error) { publish({ ...base, username, kind, status: "error", error: response.error }); return; }
          rating = ratingForMode(response && response.ratings, cls); if (rating != null) source = "Chess.com stats";
        }
        publish({ ...base, username, kind, rating, source, status: rating != null ? "ready" : username || kind === "bot" ? "missing" : "username-unavailable" });
      } catch (error) { if (!stale()) publish({ ...base, status: "error", error: error.message || String(error) }); }
    }

    return {
      update,
      get current() { return current; },
      get revision() { return revision; },
      get game() { return game; },
      reset() { activeKey = ""; game = null; gameKey = ""; }
    };
  }

  self.BMPlayerRatings = { create, normalizeUsername, isBotUsername, ratingForMode, parseRating, classifyTimeControl };
})();
