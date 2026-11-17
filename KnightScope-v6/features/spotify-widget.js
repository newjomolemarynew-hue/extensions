// Spotify mini player in the Liquid Glass style: audio EQ on top, back / play-pause / next below.
// Shows only while a Spotify web tab is open. The EQ is a motion visual driven by play state
// (browsers don't expose the audio of another tab to extensions without a capture prompt).
(() => {
  const KEY = "bmSpotify", POS = "bmSpotifyPos", FRESH = 12000;
  const CSS = `
  :host{all:initial}*{box-sizing:border-box;margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Inter,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  button{all:unset;box-sizing:border-box;cursor:pointer}button:focus-visible{outline:2px solid rgba(255,255,255,.8);outline-offset:2px}
  .w{position:relative;width:248px;padding:12px 12px 12px;border-radius:30px;color:#fff;user-select:none;isolation:isolate;
    background:linear-gradient(150deg,rgba(255,255,255,.22),rgba(255,255,255,.05) 36%,rgba(255,255,255,.015) 62%,rgba(255,255,255,.1)),rgba(22,25,36,.5);
    backdrop-filter:blur(24px) saturate(190%) brightness(1.06);-webkit-backdrop-filter:blur(24px) saturate(190%) brightness(1.06);
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),inset 1.5px 2px 1px -1px rgba(255,255,255,.8),inset -1.5px -2px 1px -1px rgba(255,255,255,.28),inset 0 -22px 34px -26px rgba(30,215,96,.35),0 22px 50px -16px rgba(0,0,0,.65),0 3px 10px rgba(0,0,0,.25);
    animation:in .5s cubic-bezier(.34,1.45,.5,1);transition:width .5s cubic-bezier(.32,.72,0,1),border-radius .5s}
  .w::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.2px;pointer-events:none;z-index:2;
    background:conic-gradient(from 200deg,rgba(255,255,255,.85),rgba(255,255,255,.04) 18%,rgba(255,255,255,0) 38%,rgba(255,255,255,.4) 52%,rgba(255,255,255,.04) 68%,rgba(255,255,255,0) 84%,rgba(255,255,255,.85));
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);mask-composite:exclude}
  .w::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,rgba(255,255,255,.12),rgba(255,255,255,0) 30%)}
  @keyframes in{from{opacity:0;transform:translateY(14px) scale(.94)}}
  .w>*{position:relative;z-index:1}
  .poster{position:relative;display:block;width:100%;aspect-ratio:1;border-radius:20px;display:grid;place-items:center;cursor:grab;overflow:hidden;
    background:radial-gradient(circle at 30% 25%,#3df07f,#12a346 70%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 14px 30px -12px rgba(0,0,0,.7),0 3px 8px rgba(0,0,0,.3)}
  .poster>svg{width:46%;height:46%}.poster>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none}
  .poster::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);background:linear-gradient(160deg,rgba(255,255,255,.2),rgba(255,255,255,0) 40%)}
  .tog{position:absolute;right:8px;top:8px;z-index:2;width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:rgba(10,12,20,.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);opacity:.0;transition:opacity .2s}
  .poster:hover .tog,.tog:focus-visible{opacity:1}.tog svg{width:13px;height:13px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .eq{display:block;width:100%;height:34px;margin:10px 0 8px;cursor:grab}
  .info{display:flex;align-items:center;gap:10px;margin-bottom:10px;min-height:36px}
  .tx{min-width:0;flex:1;overflow:hidden}
  .t{font-size:13px;font-weight:650;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .a{margin-top:1px;font-size:11.5px;color:rgba(235,238,248,.66);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ctl{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:8px}
  .b{height:42px;border-radius:999px;display:grid;place-items:center;position:relative;overflow:hidden;
    background:linear-gradient(180deg,rgba(255,255,255,.26),rgba(255,255,255,.08));box-shadow:inset 0 0 0 1px rgba(255,255,255,.17),inset 0 1px 0 rgba(255,255,255,.55),inset 0 -8px 12px -8px rgba(255,255,255,.2),0 4px 12px rgba(0,0,0,.28);
    transition:transform .4s cubic-bezier(.34,1.56,.64,1),filter .2s}
  .b:hover{filter:brightness(1.18)}.b:active{transform:scale(.9)}
  .b.main{background:linear-gradient(180deg,#3df07f,#17b94f);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),inset 0 1px 0 rgba(255,255,255,.7),0 8px 20px -6px rgba(30,215,96,.75)}
  .b svg{width:20px;height:20px;fill:#fff}.b.main svg{fill:#05230f}
  .w.mini{width:164px}.w.mini .info{display:none}.w.mini .poster{aspect-ratio:auto;height:92px}.w.mini .poster>svg{width:36px;height:36px}.w.mini .eq{height:24px;margin:8px 0}
  .w.off{display:none}
  @media (prefers-reduced-motion:reduce){.w{animation:none}}`;
  const ICON = {
    spot: '<svg viewBox="0 0 24 24"><path fill="#05230f" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.62.62 0 0 1-.86.2c-2.35-1.44-5.3-1.76-8.78-.97a.62.62 0 1 1-.28-1.21c3.8-.87 7.07-.5 9.7 1.1.3.18.4.57.22.88Zm1.23-2.73a.78.78 0 0 1-1.07.26c-2.69-1.65-6.79-2.13-9.97-1.17a.78.78 0 1 1-.45-1.5c3.63-1.1 8.15-.57 11.23 1.32.37.22.49.7.26 1.09Zm.1-2.84C14.7 8.9 9.4 8.73 6.33 9.66a.93.93 0 1 1-.54-1.78c3.52-1.07 9.38-.86 13.08 1.34a.93.93 0 0 1-.94 1.6Z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 5v14L9.5 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 5l10.5 7L4 19z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>'
  };

  function create(options) {
    const root = options.root, floating = !!options.floating, cmd = options.command || ((c) => chrome.runtime.sendMessage({ type: "bm-spotify-cmd", cmd: c }, () => void chrome.runtime.lastError));
    const style = document.createElement("style"); style.textContent = CSS;
    const w = document.createElement("div"); w.className = "w off"; w.setAttribute("role", "group"); w.setAttribute("aria-label", "Spotify");
    w.innerHTML = `<div class="poster" title="Drag to move">${ICON.spot}<button class="tog" title="Compact / full" aria-label="Compact or full size"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button></div>
      <canvas class="eq" width="448" height="68"></canvas>
      <div class="info"><div class="tx"><div class="t">Spotify</div><div class="a"></div></div></div>
      <div class="ctl"><button class="b" data-c="prev" aria-label="Back">${ICON.prev}</button><button class="b main" data-c="toggle" aria-label="Play or pause">${ICON.pause}</button><button class="b" data-c="next" aria-label="Next">${ICON.next}</button></div>`;
    root.append(style, w);
    const eq = w.querySelector(".eq"), ctx = eq.getContext("2d"), poster = w.querySelector(".poster"), tog = w.querySelector(".tog"), tEl = w.querySelector(".t"), aEl = w.querySelector(".a"), main = w.querySelector(".main");
    let state = { active: false }, playing = false, raf = 0, lastT = 0, bars = [], targets = [], beat = 0, nextBeat = 0, artFor = "", destroyed = false;
    const N = 28; bars = new Array(N).fill(0.05); targets = new Array(N).fill(0.05);
    const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };

    function drawEq(now) {
      raf = 0; if (destroyed) return;
      const dt = Math.min(0.1, (now - lastT) / 1000 || 0.033);
      if (now - lastT < 33) { raf = requestAnimationFrame(drawEq); return; }
      lastT = now;
      if (playing && !reduce()) {
        if (now > nextBeat) { beat = 1; nextBeat = now + 380 + Math.random() * 260; }
        beat *= 0.9;
        for (let i = 0; i < N; i++) {
          const env = 0.35 + 0.55 * Math.exp(-Math.pow((i - N * 0.28) / (N * 0.42), 2));       // bass-heavy shape
          if (Math.random() < 0.28 + beat * 0.5) targets[i] = Math.min(1, env * (0.25 + Math.random() * 0.75) + beat * 0.25 * (1 - i / N));
          targets[i] *= 0.93;
        }
      } else for (let i = 0; i < N; i++) targets[i] = 0.05 + (reduce() && playing ? 0.15 * Math.abs(Math.sin(i * 0.6)) : 0);
      const W = eq.width, H = eq.height, gap = 6, bw = (W - gap * (N - 1)) / N;
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, H, 0, 0); g.addColorStop(0, "rgba(30,215,96,.95)"); g.addColorStop(1, "rgba(190,255,215,.95)");
      ctx.fillStyle = g; let still = true;
      for (let i = 0; i < N; i++) {
        bars[i] += (targets[i] - bars[i]) * Math.min(1, dt * (targets[i] > bars[i] ? 22 : 9));
        if (Math.abs(targets[i] - bars[i]) > 0.01) still = false;
        const h = Math.max(6, bars[i] * H), x = i * (bw + gap), r = Math.min(bw / 2, 6);
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, H - h, bw, h, r) : ctx.rect(x, H - h, bw, h); ctx.fill();
      }
      if (!(still && !playing)) raf = requestAnimationFrame(drawEq);
    }
    const kick = () => { if (!raf && !destroyed && !document.hidden && !w.classList.contains("off")) raf = requestAnimationFrame(drawEq); };

    // Cover art: the Spotify tab already converts it to a data URL (bmSpotifyArt); if that is missing, ask the service worker.
    let artStore = null;
    const showArt = (data) => { const old = poster.querySelector("img"); if (!data) { if (old) old.remove(); poster.firstElementChild && poster.firstElementChild.tagName === "svg" && (poster.firstElementChild.style.display = ""); return; }
      const img = old || document.createElement("img"); img.alt = ""; img.draggable = false; img.src = data; if (!old) poster.prepend(img); const sv = poster.querySelector(":scope>svg"); if (sv) sv.style.display = "none"; };
    function setArt(url) {
      if (!url) return;
      if (artStore && artStore.url === url && artStore.data) { artFor = url; showArt(artStore.data); return; }
      if (url === artFor) return; artFor = url;
      try { chrome.runtime.sendMessage({ type: "bm-spotify-art", url }, (r) => { if (chrome.runtime.lastError || !r || !r.dataUrl || artFor !== url) return; showArt(r.dataUrl); }); } catch (_) {}
    }
    function paint() {
      const live = state && state.active !== false && Date.now() - (state.ts || 0) < FRESH && options.enabled();
      w.classList.toggle("off", !live);
      if (!live) { playing = false; return; }
      playing = !!state.playing;
      tEl.textContent = state.title || "Spotify"; aEl.textContent = state.artist || (playing ? "Playing" : "Paused");
      main.innerHTML = playing ? ICON.pause : ICON.play; main.setAttribute("aria-label", playing ? "Pause" : "Play");
      if (state.art) setArt(state.art); else { artFor = ""; showArt(""); }
      kick();
    }
    w.addEventListener("click", (e) => {
      const b = e.target.closest("[data-c]"); if (!b) return;
      cmd(b.dataset.c);
      if (b.dataset.c === "toggle") { state = { ...state, playing: !playing }; paint(); }
    });
    tog.addEventListener("click", (e) => { e.stopPropagation();  w.classList.toggle("mini"); try { chrome.storage.local.set({ bmSpotifyMini: w.classList.contains("mini") }); } catch (_) {} });
    try { chrome.storage.local.get("bmSpotifyMini", (r) => { if (r && r.bmSpotifyMini) w.classList.add("mini"); }); } catch (_) {}

    // drag (floating mode): grab the EQ strip
    if (floating) {
      const host = options.host; let sx, sy, ox, oy, drag = false;
      const place = (x, y) => { host.style.left = Math.max(4, Math.min(innerWidth - 60, x)) + "px"; host.style.top = Math.max(4, Math.min(innerHeight - 60, y)) + "px"; host.style.right = host.style.bottom = "auto"; };
      for (const h of [poster, eq]) {
        h.addEventListener("pointerdown", (e) => { if (e.target.closest(".tog")) return; const r = host.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; drag = true; h.setPointerCapture(e.pointerId); h.style.cursor = "grabbing"; });
        h.addEventListener("pointermove", (e) => { if (drag) place(ox + e.clientX - sx, oy + e.clientY - sy); });
        h.addEventListener("pointerup", () => { if (!drag) return; drag = false; h.style.cursor = ""; const r = host.getBoundingClientRect(); try { chrome.storage.local.set({ [POS]: { x: r.left, y: r.top } }); } catch (_) {} });
      }
      try { chrome.storage.local.get(POS, (r) => { const p = r && r[POS]; if (p) place(p.x, p.y); }); } catch (_) {}
    }
    const onChange = (changes, area) => {
      if (area !== "local") return;
      if (changes.bmSpotifyArt) { artStore = changes.bmSpotifyArt.newValue || null; if (state.art && artStore && artStore.url === state.art && artStore.data) { artFor = state.art; showArt(artStore.data); } }
      if (changes[KEY]) { state = changes[KEY].newValue || { active: false }; paint(); }
    };
    chrome.storage.onChanged.addListener(onChange);
    const tick = setInterval(paint, 3000), vis = () => { if (!document.hidden) { kick(); paint(); } };
    document.addEventListener("visibilitychange", vis);
    try { chrome.storage.local.get([KEY, "bmSpotifyArt"], (r) => { artStore = (r && r.bmSpotifyArt) || null; state = (r && r[KEY]) || { active: false }; paint(); }); } catch (_) {}
    return { refresh: paint, destroy() { destroyed = true; clearInterval(tick); cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); try { chrome.storage.onChanged.removeListener(onChange); } catch (_) {} style.remove(); w.remove(); } };
  }
  self.BMSpotifyWidget = { create };
})();
