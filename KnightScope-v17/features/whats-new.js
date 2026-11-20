// "What's new" screen: shown once per version, on the first Chess.com page after an update, and never during a game.
// Closing it (or using a link or the stars) marks this version as seen. If a game starts while it is open, it simply
// hides and comes back next time.
(() => {
  const SEEN_KEY = "bmSeenVersion";
  const STORE_URL = "https://chromewebstore.google.com/detail/chess-assistant/ohkbpmebalniinbedliepdnpencmaldp";
  const REVIEW_URL = STORE_URL + "/reviews";
  const shouldShow = (seen, current) => !!current && seen !== current;

  const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const FEATURES = [
    { icon: I('<path d="M5 19 19 5m0 0h-8m8 0v8"/>'), title: "Best move arrows", text: "See the engine's best moves on the board as you play.", link: ["How it works", STORE_URL] },
    { icon: I('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>'), title: "Human-like moves (Maia)", text: "Suggestions at the level of a real player, not always the engine's top line. Match the bot's level in bot games.", link: ["Open settings", "panel"] },
    { icon: I('<path d="M12 3 4 7.5l8 4.5 8-4.5zM4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5"/>'), title: "Studio", text: "Chess.com piece templates, flames, ice and wings on top, board colours, textures and live effects.", link: ["Open Studio", "studio"] },
    { icon: I('<path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/>'), title: "Game Review", text: "Review any game with a choice of engine profiles, move ratings and Chess.com move sounds.", link: ["Open Review", "review"] },
    { icon: I('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'), title: "Spotify mini player", text: "Control music without leaving the board." },
    { icon: I('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'), title: "Suggestions", text: "Tell us what to build next from the toolbar popup (Suggest)." }
  ];
  const CSS = `
:host{all:initial}
.bk{position:fixed;inset:0;z-index:2147483300;display:grid;place-items:center;background:rgba(6,8,16,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:f .3s ease both;
  font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#f5f6f9;--acc:10,132,255}
.card{width:min(520px,calc(100vw - 28px));max-height:calc(100vh - 40px);overflow:auto;padding:22px 22px 18px;border-radius:28px;
  background:linear-gradient(150deg,rgba(255,255,255,.2),rgba(255,255,255,.05) 40%,rgba(255,255,255,.1)),rgba(20,23,36,.9);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 1px 0 rgba(255,255,255,.5),0 30px 80px -20px rgba(0,0,0,.8);animation:u .5s cubic-bezier(.34,1.45,.5,1) both}
@keyframes f{from{opacity:0}}@keyframes u{from{opacity:0;transform:translateY(18px) scale(.96)}}
@media (prefers-reduced-motion:reduce){.bk,.card{animation:none}}
.hd{display:flex;align-items:center;gap:12px}.hd .tag{font-size:11px;font-weight:700;letter-spacing:.4px;padding:3px 9px;border-radius:999px;background:rgba(var(--acc),.25);box-shadow:inset 0 0 0 1px rgba(var(--acc),.6)}
h2{all:unset;display:block;font-size:20px;font-weight:750;letter-spacing:-.3px;margin-top:2px}
.sub{color:rgba(235,238,248,.7);margin:4px 0 12px}
.x{all:unset;margin-left:auto;cursor:pointer;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:rgba(235,238,248,.65)}.x:hover{background:rgba(255,255,255,.12);color:#fff}
.ls{display:grid;gap:8px}
.f{display:flex;gap:12px;padding:11px 12px;border-radius:18px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.f .ic{flex:none;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(160deg,rgb(var(--acc)),rgba(var(--acc),.55))}.f .ic svg{width:19px;height:19px;color:#fff}
.f b{display:block;font-size:13.5px}.f p{margin:2px 0 0;color:rgba(235,238,248,.72);font-size:12.5px}
.lk{all:unset;cursor:pointer;margin-top:5px;display:inline-block;font-size:12px;font-weight:650;color:#7db8ff;text-decoration:underline;text-underline-offset:2px}.lk:hover{color:#fff}
.rate{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);display:grid;justify-items:center;gap:6px;text-align:center}
.rate span{color:rgba(235,238,248,.75);font-size:12.5px}
.stars{display:flex;gap:4px}
.st{all:unset;cursor:pointer;width:34px;height:34px;display:grid;place-items:center;color:rgba(255,255,255,.4);transition:transform .2s cubic-bezier(.34,1.6,.5,1),color .15s}
.st svg{width:30px;height:30px;fill:transparent;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;transition:fill .15s}
.st.on{color:#ffc94d;transform:scale(1.12)}.st.on svg{fill:#ffc94d}
.st:focus-visible,.lk:focus-visible,.x:focus-visible,.done:focus-visible{outline:2px solid rgba(var(--acc),.95);outline-offset:2px}
.done{all:unset;cursor:pointer;margin-top:4px;font-size:12px;color:rgba(235,238,248,.55);text-decoration:underline;text-underline-offset:2px}.done:hover{color:#fff}
`;
  const STAR = '<svg viewBox="0 0 24 24"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';

  // actions: { openStudio(), openReview(), openPanel(), openUrl(url) }
  function build(version, actions, onClose) {
    const host = document.createElement("div"); host.setAttribute("data-bm-whatsnew", "1"); host.style.cssText = "all:initial";
    const root = host.attachShadow({ mode: "open" }), style = document.createElement("style"); style.textContent = CSS; root.appendChild(style);
    const bk = document.createElement("div"); bk.className = "bk";
    bk.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-label="What's new in Best Move ${version}">
      <div class="hd"><div><span class="tag">UPDATE ${version}</span><h2>What's new in Best Move</h2></div><button class="x" aria-label="Close">✕</button></div>
      <p class="sub">Best Move now does a lot more than best-move arrows. Here is everything, with links to try each part.</p>
      <div class="ls">${FEATURES.map((f, i) => `<div class="f"><div class="ic">${f.icon}</div><div><b>${f.title}</b><p>${f.text}</p>${f.link ? `<button class="lk" data-i="${i}">${f.link[0]}</button>` : ""}</div></div>`).join("")}</div>
      <div class="rate"><span>Enjoying Best Move? Tap a star to leave a review.</span><div class="stars" role="group" aria-label="Rate Best Move">${[1, 2, 3, 4, 5].map((n) => `<button class="st" data-n="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">${STAR}</button>`).join("")}</div>
        <button class="done">Got it</button></div></div>`;
    root.appendChild(bk);
    const stars = [...root.querySelectorAll(".st")], fill = (n) => stars.forEach((s, i) => s.classList.toggle("on", i < n));
    stars.forEach((s) => {
      const n = +s.dataset.n;
      s.addEventListener("mouseenter", () => fill(n)); s.addEventListener("focus", () => fill(n));
      s.addEventListener("click", () => { actions.openUrl(REVIEW_URL); onClose("reviewed"); });
    });
    root.querySelector(".stars").addEventListener("mouseleave", () => fill(0));
    root.addEventListener("click", (e) => {
      const lk = e.target.closest(".lk");
      if (lk) { const [, target] = FEATURES[+lk.dataset.i].link; if (target === "studio") actions.openStudio(); else if (target === "review") actions.openReview(); else if (target === "panel") actions.openPanel(); else actions.openUrl(target); return; }
      if (e.target.closest(".x") || e.target.closest(".done") || e.target === bk) onClose("closed");
    });
    root.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") onClose("closed"); });
    document.documentElement.appendChild(host);
    setTimeout(() => { const x = root.querySelector(".done"); if (x) x.focus({ preventScroll: true }); }, 60);
    return host;
  }

  function create({ actions, version } = {}) {
    let host = null, playing = false, seen = null, timer = 0, finished = false;
    const current = version || (() => { try { return chrome.runtime.getManifest().version; } catch (_) { return ""; } })();
    const load = new Promise((res) => { try { chrome.storage.local.get(SEEN_KEY, (r) => res(r ? r[SEEN_KEY] : undefined)); } catch (_) { res(current); } });
    const hide = () => { if (host) { host.remove(); host = null; } };
    const markSeen = () => { finished = true; try { chrome.storage.local.set({ [SEEN_KEY]: current }); } catch (_) {} };
    function tryShow() {
      if (finished || host || playing || document.hidden || !shouldShow(seen, current)) return;
      host = build(current, actions, (why) => { markSeen(); hide(); });
    }
    load.then((v) => { seen = v; timer = setTimeout(tryShow, 2500); });
    return {
      // Called every tick by the live panel. A game in progress always wins.
      setPlaying(p) { playing = !!p; if (playing && host) hide(); else if (!playing && !host && !finished && seen !== null) { clearTimeout(timer); timer = setTimeout(tryShow, 2500); } },
      destroy() { clearTimeout(timer); hide(); }
    };
  }
  self.BMWhatsNew = { create, shouldShow, FEATURES, REVIEW_URL, STORE_URL, SEEN_KEY };
})();
