// Asks for a Chrome Web Store review, politely and only at a good moment.
//
// Rules (all enforced here, tested in test/review-prompt-smoke.mjs):
//   * Never while a game is being played. The card is only scheduled after a real game (at least MIN_PLIES moves)
//     has ended, waits SETTLE_MS so it never competes with the result screen, and is cancelled / hidden
//     the moment another game starts.
//   * Only after the person has finished a game with the extension (MIN_GAMES).
//   * "Maybe later" snoozes for a week, then a month; three asks in total, at least a day apart.
//   * Reviewing, or "Don't ask again", ends it for good.
//   * It is a small non-blocking card in the corner, not a modal. Nothing is sent anywhere.
(() => {
  const REVIEW_URL = "https://chromewebstore.google.com/detail/chess-assistant/ohkbpmebalniinbedliepdnpencmaldp/reviews";
  const KEY = "bmReview";
  const DAY = 24 * 60 * 60 * 1000;
  const RULES = { minGames: 1, minAgeMs: 0, snoozeMs: [7 * DAY, 30 * DAY, 90 * DAY], maxShows: 3, minGapMs: DAY, minPlies: 8, settleMs: 3500 };
  const LIVE_MODES = { bot: 1, bullet: 1, blitz: 1, rapid: 1, classical: 1, daily: 1 };

  const pliesOf = (full, turn) => Math.max(0, (full - 1) * 2 + (turn === "b" ? 1 : 0));

  function eligible(s, now, rules = RULES) {
    if (!s || s.done) return false;
    if ((s.games || 0) < rules.minGames) return false;
    if (now - (s.installedAt || now) < rules.minAgeMs) return false;
    if ((s.shown || 0) >= rules.maxShows) return false;
    if (s.snoozeUntil && now < s.snoozeUntil) return false;
    if (s.lastShown && now - s.lastShown < rules.minGapMs) return false;
    return true;
  }

  // The tracker turns "what the page looks like right now" into "a game just finished".
  // deps: { load(): Promise<state>, save(state), now(), show(), setTimeout, clearTimeout }
  function createTracker(deps) {
    const rules = deps.rules || RULES;
    let state = null, ready = false, timer = 0;
    let sawGame = false, counted = false, playing = false, shownThisSession = false, endFen = null;

    const persist = () => { try { deps.save(state); } catch (_) {} };
    deps.load().then((s) => {
      state = { games: 0, shown: 0, installedAt: 0, done: false, snoozeUntil: 0, lastShown: 0, ...(s || {}) };
      if (!state.installedAt) { state.installedAt = deps.now(); persist(); }
      ready = true;
    }).catch(() => {});

    const cancel = () => { if (timer) { deps.clearTimeout(timer); timer = 0; } };

    function schedule() {
      cancel();
      if (!ready || shownThisSession || !eligible(state, deps.now(), rules)) return;
      timer = deps.setTimeout(() => {
        timer = 0;
        // Re-check at the last moment: a new game must never be interrupted.
        if (playing || !ready || shownThisSession || !eligible(state, deps.now(), rules)) return;
        if (deps.canShow && !deps.canShow()) return;
        shownThisSession = true; state.shown = (state.shown || 0) + 1; state.lastShown = deps.now(); persist();
        deps.show();
      }, rules.settleMs);
    }

    // live: a playable game page (not analysis / puzzles). plies: moves played so far. over: the game has ended.
    function observe({ live, plies, over, fen }) {
      if (!live) { playing = false; sawGame = false; counted = false; endFen = null; cancel(); return; }
      // Once a game has ended, the position stays "over" even if the result dialog is closed, until the board changes.
      if (over && fen) endFen = fen;
      else if (endFen && fen && fen === endFen) over = true;
      else if (endFen && fen !== endFen) endFen = null;
      if (over) {
        playing = false;
        if (sawGame && !counted) {
          counted = true;
          if (ready) { state.games = (state.games || 0) + 1; persist(); }
          schedule();
        }
        return;
      }
      // Game in progress (or a fresh board).
      if (plies >= 1) playing = true;
      if (plies >= rules.minPlies) sawGame = true;
      if (counted && plies < rules.minPlies) { counted = false; sawGame = false; }   // a new game began after the old one
      if (playing) cancel();
    }

    return {
      observe, cancel,
      get state() { return state; },
      get pending() { return !!timer; },
      reviewed() { if (state) { state.done = true; state.reviewed = true; persist(); } },
      later() { if (state) { state.snoozeUntil = deps.now() + rules.snoozeMs[Math.min((state.shown || 1) - 1, rules.snoozeMs.length - 1)]; persist(); } },
      never() { if (state) { state.done = true; persist(); } },
      // Hidden because a game started: counts as a short snooze, not as a refusal.
      interrupted() { if (state) { state.shown = Math.max(0, (state.shown || 1) - 1); state.snoozeUntil = deps.now() + 3 * 60 * 60 * 1000; persist(); } shownThisSession = false; }
    };
  }

  // ---- Game-over detection (DOM + rules) ----
  const OVER_SELECTOR = [
    '[class*="game-over-modal"]', '[class*="game-over-header"]', '[class*="game-over-buttons"]', '[class*="game-over-controls"]',
    '[data-cy="game-over-modal"]', '[class*="game-result"]', '[class*="gameover"]'
  ].join(",");
  const visible = (el) => {
    try { return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"; } catch (_) { return false; }
  };
  // Buttons that only exist once a game is over (works even if Chess.com renames its CSS classes).
  const AFTER_GAME_TEXT = /^\s*(rematch|game review|review game|new \d+\s*min)/i;
  function domGameOver(doc = document) {
    try { for (const el of doc.querySelectorAll(OVER_SELECTOR)) if (visible(el)) return true; } catch (_) {}
    try { for (const el of doc.querySelectorAll("button,a")) if (AFTER_GAME_TEXT.test(el.textContent || "") && visible(el)) return true; } catch (_) {}
    return false;
  }

  // ---- The card ----
  const CSS = `
:host{all:initial}
.card{position:fixed;left:18px;bottom:18px;width:316px;max-width:calc(100vw - 36px);z-index:2147483200;color:#f5f6f9;
  font:13px/1.42 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;padding:16px 16px 14px;border-radius:24px;
  background:linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.05) 40%,rgba(255,255,255,.1)),rgba(20,23,36,.82);
  backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 1px 0 rgba(255,255,255,.5),0 26px 60px -20px rgba(0,0,0,.75),0 3px 12px rgba(0,0,0,.3);
  animation:in .5s cubic-bezier(.34,1.45,.5,1) both;--acc:10,132,255}
.card.out{animation:out .25s ease forwards}
@keyframes in{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:none}}
@keyframes out{to{opacity:0;transform:translateY(12px) scale(.97)}}
@media (prefers-reduced-motion:reduce){.card,.card.out{animation-duration:.01s}}
.top{display:flex;gap:11px;align-items:flex-start}
.ic{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:linear-gradient(160deg,rgb(var(--acc)),rgba(var(--acc),.6))}
.ic svg{width:20px;height:20px}
h2{all:unset;display:block;font-size:15px;font-weight:700;letter-spacing:-.2px}
p{margin:3px 0 0;color:rgba(235,238,248,.74);font-size:12.5px}
.x{all:unset;margin-left:auto;cursor:pointer;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:rgba(235,238,248,.6);flex:none}
.x:hover{background:rgba(255,255,255,.1);color:#fff}
.stars{display:flex;gap:2px;margin:10px 0 2px;color:#ffc94d}
.stars svg{width:15px;height:15px}
.btns{display:flex;gap:8px;margin-top:12px}
.btn{all:unset;box-sizing:border-box;cursor:pointer;height:34px;padding:0 14px;border-radius:999px;font-weight:650;font-size:12.5px;display:inline-flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);color:#f5f6f9;transition:filter .2s,transform .3s cubic-bezier(.34,1.45,.5,1)}
.btn:hover{filter:brightness(1.2)}.btn:active{transform:scale(.95)}
.btn.primary{flex:1;background:linear-gradient(180deg,rgba(var(--acc),.98),rgba(var(--acc),.7));box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.55),0 6px 18px -6px rgba(var(--acc),.7);color:#fff}
.links{display:flex;gap:14px;margin-top:10px;font-size:11.5px}
.lnk{all:unset;cursor:pointer;color:rgba(235,238,248,.55);text-decoration:underline;text-underline-offset:2px}
.lnk:hover{color:#fff}
.btn:focus-visible,.lnk:focus-visible,.x:focus-visible{outline:2px solid rgba(var(--acc),.95);outline-offset:2px}
`;
  const STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';
  const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 17 7m0 0H9.5M17 7v7.5"/></svg>';

  function createCard({ tracker, openUrl, accent }) {
    const host = document.createElement("div");
    host.setAttribute("data-bm-review", "1");
    host.style.cssText = "all:initial";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style"); style.textContent = CSS; root.appendChild(style);
    const card = document.createElement("div"); card.className = "card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Review Best Move");
    if (accent) card.style.setProperty("--acc", accent);
    card.innerHTML = `
      <div class="top"><div class="ic">${LOGO}</div>
        <div><h2>Nice game! Enjoying Best Move?</h2><p>A quick review on the Chrome Web Store helps other chess players find it. Takes 20 seconds.</p></div>
        <button class="x" aria-label="Close (ask me later)">✕</button></div>
      <div class="stars" aria-hidden="true">${STAR.repeat(5)}</div>
      <div class="btns"><button class="btn primary" data-a="review">Leave a review</button><button class="btn" data-a="later">Maybe later</button></div>
      <div class="links"><button class="lnk" data-a="feedback">Send a suggestion</button><button class="lnk" data-a="never">Don't ask again</button></div>`;
    root.appendChild(card);
    let feedbackView = null, closed = false;

    function close(animated = true) {
      if (closed) return; closed = true;
      if (feedbackView) feedbackView.destroy();
      if (!animated) { host.remove(); return; }
      card.classList.add("out"); setTimeout(() => host.remove(), 260);
    }
    card.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("[data-a]"); if (!a) { if (e.target.closest && e.target.closest(".x")) { tracker.later(); close(); } return; }
      const act = a.dataset.a;
      if (act === "review") { tracker.reviewed(); openUrl(REVIEW_URL); close(); }
      else if (act === "later") { tracker.later(); close(); }
      else if (act === "never") { tracker.never(); close(); }
      else if (act === "feedback" && self.BMFeedback) {
        tracker.later();   // they are giving feedback now: do not ask again soon
        card.innerHTML = '<div class="top"><div class="ic">' + LOGO + '</div><div><h2>Send a suggestion</h2><p>Tell us what to improve.</p></div><button class="x" aria-label="Close">✕</button></div><div id="f" style="margin-top:10px"></div>';
        feedbackView = self.BMFeedback.mount(card.querySelector("#f"), { page: "review-card", onDone: () => close(), onCancel: () => close() });
      }
    });
    card.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { tracker.later(); close(); } });
    document.documentElement.appendChild(host);
    return { close, host, get closed() { return closed; } };
  }

  // Wires the tracker to chrome.storage and the page. `api` is used by the live panel each tick.
  function create({ getAccent } = {}) {
    let card = null;
    const tracker = createTracker({
      load: () => new Promise((resolve) => { try { chrome.storage.local.get(KEY, (r) => resolve((r && r[KEY]) || {})); } catch (_) { resolve({}); } }),
      save: (s) => { try { chrome.storage.local.set({ [KEY]: s }); } catch (_) {} },
      now: () => Date.now(),
      setTimeout: (f, ms) => setTimeout(f, ms),
      clearTimeout: (t) => clearTimeout(t),
      canShow: () => !document.hidden && !card,
      show: () => {
        card = createCard({ tracker, accent: getAccent && getAccent(), openUrl: (url) => { try { window.open(url, "_blank", "noopener,noreferrer"); } catch (_) {} } });
        // Safety net: if the person ignores it, it quietly goes away after a while and counts as "maybe later".
        setTimeout(() => { if (card && !card.closed) { tracker.later(); card.close(); } }, 45000);
        const watch = setInterval(() => { if (!card || card.closed) { clearInterval(watch); card = null; } }, 500);
      }
    });
    return {
      tracker,
      // Called from the live panel tick.
      update({ mode, st, over }) {
        const live = !!LIVE_MODES[mode && mode.cls];
        const plies = st ? pliesOf(st.full, st.turn) : 0;
        tracker.observe({ live, plies, over: !!over, fen: st ? st.fen : null });
        // A game started while the card is open: get out of the way immediately.
        if (card && !card.closed && live && !over && plies >= 1) { tracker.interrupted(); card.close(); }
      },
      destroy() { tracker.cancel(); if (card) card.close(false); card = null; }
    };
  }

  self.BMReview = { create, createTracker, createCard, eligible, domGameOver, pliesOf, REVIEW_URL, RULES, KEY };
})();
