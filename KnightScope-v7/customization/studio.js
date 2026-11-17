(() => {
  const C = self.BMCustomization, Pc = self.BMPieces, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let S = C.normalize({}), flip = false, loaded = false;

  // ---------- suggestion form (Studio) ----------
  (() => {
    const btn = $("sugg"), box = $("suggBox"); if (!btn || !box || !self.BMFeedback) return; let form = null;
    const close = () => { if (form) form.destroy(); form = null; box.hidden = true; btn.textContent = "Suggest"; };
    btn.onclick = () => { if (form) return close(); box.hidden = false; btn.textContent = "Close"; form = self.BMFeedback.mount(box, { page: "studio", onDone: close }); };
  })();

  // ---------- saving (instant preview, debounced write) ----------
  let pending = {}, timer = 0, savedTimer = 0;
  const merge = (cur, p) => {
    const board = p.boardStyle && !p.squareColors ? C.boardStyleInfo(p.boardStyle) : null;
    return C.normalize({ ...cur, ...p, piece: p.piece ? { ...cur.piece, ...p.piece } : cur.piece, fx: p.fx ? { ...cur.fx, ...p.fx } : cur.fx,
      squareColors: board && board.light ? { light: board.light, dark: board.dark } : { ...cur.squareColors, ...p.squareColors } });
  };
  function change(patch) {
    S = merge(S, patch);
    pending = { ...pending, ...patch, piece: patch.piece ? { ...(pending.piece || {}), ...patch.piece } : pending.piece, fx: patch.fx ? { ...(pending.fx || {}), ...patch.fx } : pending.fx,
      squareColors: patch.squareColors ? { ...(pending.squareColors || {}), ...patch.squareColors } : pending.squareColors };
    for (const k of Object.keys(pending)) if (pending[k] === undefined) delete pending[k];
    scheduleRender(); clearTimeout(timer);
    timer = setTimeout(flush, 220);
  }
  async function flush() {
    const p = pending; pending = {}; if (!Object.keys(p).length) return;
    try { await C.save(p); const el = $("saved"); el.textContent = "Saved"; el.classList.add("on"); clearTimeout(savedTimer); savedTimer = setTimeout(() => el.classList.remove("on"), 1400); }
    catch (error) { const el = $("saved"); el.textContent = "Couldn't save: " + error.message; el.classList.add("on"); }
  }
  addEventListener("pagehide", flush);

  // ---------- preview board ----------
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  const pv = $("pv"), pvStyle = document.createElement("style"); document.head.appendChild(pvStyle);
  let squares = [];
  function buildBoard() {
    const rows = START.split("/"); let html = "";
    rows.forEach((row, r) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) { for (let k = 0; k < +ch; k++, f++) html += `<div class="sq ${(r + f) % 2 ? "d" : ""}" data-r="${r}" data-f="${f}"></div>`; } else { const code = (ch === ch.toLowerCase() ? "b" : "w") + ch.toLowerCase(); html += `<div class="sq ${(r + f) % 2 ? "d" : ""}" data-r="${r}" data-f="${f}"><b class="pp ${code}"></b></div>`; f++; } } });
    pv.insertAdjacentHTML("afterbegin", html); squares = [...pv.querySelectorAll(".sq")];
  }
  const fx = self.BMFx.create($("pvfx"));
  const bfx = self.BMBoardFx.create($("pvbfx"));
  const ro = new ResizeObserver(() => fx.resize($("pvfx").clientWidth, $("pvfx").clientHeight)); ro.observe(pv);
  function paintPreview() {
    pv.style.setProperty("--l", S.boardStyle === "default" ? "#ebecd0" : S.squareColors.light);
    pv.style.setProperty("--d", S.boardStyle === "default" ? "#739552" : S.squareColors.dark);
    pv.classList.toggle("orig", S.pieceSource === "chesscom");
    let view = S;
    if (S.pieceSource === "theme") $("pvnote").textContent = "";
    if (S.pieceSource === "chesscom") view = { ...S, pieceSource: "local", piece: Pc.DEFAULT_PIECE };   // stand-in: Chess.com's own art can't be shown here
    $("pvnote").textContent = S.pieceSource === "chesscom" ? "Chess.com's own pieces are used on the site." : "";
    pvStyle.textContent = C.buildCss(view, { piece: (c) => `.pv .pp.${c},.pvp .pp.${c}`, board: "", important: false });
    $("pvp").style.setProperty("--l", S.boardStyle === "default" ? "#ebecd0" : S.squareColors.light);
    $("pvp").style.setProperty("--d", S.boardStyle === "default" ? "#739552" : S.squareColors.dark);
    const still = S.reducedMotion, tex = C.texUrl(S.boardTexture);
    pv.style.setProperty("--tex", tex && S.boardStyle !== "default" ? `url("${tex}")` : "none");
    bfx.set(S.boardStyle === "default" && S.boardAnim === "none" ? "none" : S.boardAnim, S.boardAnimPower, still);
    fx.setTint(S.pieceSource === "local" ? S.piece.white.fill : null);
    if (still || S.fx.particles === "none") fx.setAmbient("none", 0); else fx.setAmbient(S.fx.particles, S.fx.density);
  }
  function demoMove() {
    const from = squares.find((s) => s.dataset.r === "6" && s.dataset.f === "4"), to = squares.find((s) => s.dataset.r === "4" && s.dataset.f === "4");
    const piece = from && from.querySelector(".pp"); if (!piece || !to) return;
    const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect(), dy = tr.top - fr.top;
    piece.style.transition = "transform .35s cubic-bezier(.3,.9,.3,1)"; piece.style.transform = `translateY(${dy}px)`; piece.style.zIndex = 3;
    setTimeout(() => {
      const pr = pv.getBoundingClientRect();
      if (S.fx.particles !== "none" && S.fx.burst && !S.reducedMotion) fx.burst(S.fx.particles, tr.left - pr.left + tr.width / 2, tr.top - pr.top + tr.height / 2, 18);
      setTimeout(() => { piece.style.transition = "transform .4s ease"; piece.style.transform = ""; }, 900);
    }, 340);
  }
  pv.addEventListener("click", (e) => { const sq = e.target.closest(".sq"); if (!sq || S.fx.particles === "none" || S.reducedMotion) return; const r = pv.getBoundingClientRect(); fx.burst(S.fx.particles, e.clientX - r.left, e.clientY - r.top, 14); });
  $("demo").onclick = demoMove;
  $("pvflip").onclick = () => { flip = !flip; pv.style.transform = flip ? "rotate(180deg)" : ""; pv.querySelectorAll(".pp").forEach((p) => (p.style.rotate = flip ? "180deg" : "")); };

  // ---------- tabs ----------
  const tabsEl = $("tabs");
  tabsEl.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const bs = [...tabsEl.querySelectorAll("button")]; bs.forEach((x) => x.classList.toggle("on", x === b)); tabsEl.style.setProperty("--i", bs.indexOf(b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === "t-" + b.dataset.t));
    $("scroll").scrollTop = 0; autoView(b.dataset.t); scheduleRender();
  });
  function segSync(id, value) {
    const el = $(id), bs = [...el.querySelectorAll("button")]; let i = bs.findIndex((b) => b.dataset.v === String(value)); if (i < 0) i = 0;
    bs.forEach((b, k) => b.classList.toggle("on", k === i)); el.style.setProperty("--i", i);
  }
  function segBind(id, fn) { $(id).addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) fn(b.dataset.v); }); }

  // ---------- left preview: the piece being edited, or the whole board ----------
  let view = "board", userPicked = false;
  function setView(v, picked) {
    view = v; if (picked) userPicked = true;
    $("pvsel").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    $("pv").hidden = v !== "board"; $("pvp").hidden = v === "board";
    if (v !== "board") { $("pvW").className = "pp w" + v; $("pvB").className = "pp b" + v; }
  }
  $("pvsel").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.v, true); });
  function autoView(tab) {
    userPicked = false;
    if (tab === "pieces" || tab === "parts") setView(view === "board" ? "k" : view); else setView("board");
  }

  // ---------- pieces tab ----------
  function renderThemes() {
    const sig = S.pieceSource + S.pieceTheme; if (sig === themeSig) return; themeSig = sig;
    if (!$("themes").children.length) {
      $("themes").innerHTML = `<button class="tile" data-src="chesscom" type="button"><div class="th2 ph">♞</div><b>Chess.com</b><small>Your own set</small></button>` +
        C.THEMES.map(([id, name]) => `<button class="tile" data-th="${id}" type="button"><div class="th2 tp"><i style="background-image:url('${C.themeUrl(id, "wn")}')"></i><i style="background-image:url('${C.themeUrl(id, "bn")}')"></i></div><b>${esc(name)}</b><small>Template</small></button>`).join("");
    }
    $("themes").querySelectorAll(".tile").forEach((t) => t.classList.toggle("on", t.dataset.src ? S.pieceSource === "chesscom" : S.pieceSource === "theme" && S.pieceTheme === t.dataset.th));
  }
  let themeSig = "";
  $("themes").addEventListener("click", (e) => {
    const t = e.target.closest(".tile"); if (!t) return;
    if (t.dataset.src) change({ pieceSource: "chesscom" }); else change({ pieceSource: "theme", pieceTheme: t.dataset.th });
  });
  const thumbPair = (piece) => {
    const l = S.boardStyle === "default" ? "#ebecd0" : S.squareColors.light, d = S.boardStyle === "default" ? "#739552" : S.squareColors.dark;
    return `<div class="th2"><i style="background-color:${l};background-image:url('${Pc.dataUri("wn", piece)}')"></i><i style="background-color:${d};background-image:url('${Pc.dataUri("bn", piece)}')"></i></div>`;
  };
  function renderPresets() {
    const groups = {}; Pc.PRESETS.forEach((p) => (groups[p.group] = groups[p.group] || []).push(p));
    let html = "";
    for (const p of Pc.PRESETS) html += `<button class="tile ${S.pieceSource === "local" && S.presetId === p.id ? "on" : ""}" data-p="${p.id}" type="button">${thumbPair(p.piece)}<b>${esc(p.name)}</b><small>${esc(p.group)}${p.fx.particles !== "none" ? " · " + p.fx.particles : ""}</small></button>`;
    $("presets").innerHTML = html;
    $("mineWrap").hidden = !S.myPresets.length;
    $("mine").innerHTML = S.myPresets.map((m) => `<div class="tile ${S.pieceSource === "local" && S.presetId === m.id ? "on" : ""}" data-m="${esc(m.id)}" role="button" tabindex="0">${thumbPair(m.piece)}<b>${esc(m.name)}</b><small><a href="#" data-del="${esc(m.id)}" style="color:inherit">Delete</a></small></div>`).join("");
  }
  $("presets").addEventListener("click", (e) => {
    const t = e.target.closest(".tile"); if (!t) return;
    if (t.dataset.src === "chesscom") return change({ pieceSource: "chesscom" });
    const p = Pc.presetById(t.dataset.p); if (p) change({ pieceSource: "local", presetId: p.id, piece: p.piece, fx: p.fx });
  });
  $("mine").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) { e.preventDefault(); return change({ myPresets: S.myPresets.filter((m) => m.id !== del.dataset.del) }); }
    const t = e.target.closest("[data-m]"); const m = t && S.myPresets.find((x) => x.id === t.dataset.m);
    if (m) change({ pieceSource: "local", presetId: m.id, piece: m.piece, fx: m.fx });
  });
  const editPiece = (patch) => change({ pieceSource: "local", presetId: "custom", piece: patch });
  // Parts sit on top of whatever base is chosen; on Chess.com's own pieces they switch to the Neo template so they have something to sit on.
  const editParts = (patch) => change({ pieceSource: S.pieceSource === "chesscom" ? "theme" : S.pieceSource, piece: patch });
  segBind("family", (v) => editPiece({ family: v })); segBind("style", (v) => editPiece({ style: v }));
  const colorIn = (id, side, key) => $(id).addEventListener("input", (e) => editPiece({ [side]: { ...S.piece[side], [key]: e.target.value } }));
  colorIn("wFill", "white", "fill"); colorIn("wStroke", "white", "stroke"); colorIn("bFill", "black", "fill"); colorIn("bStroke", "black", "stroke");
  for (const k of ["outline", "gloss", "shadow", "glow"]) $(k).addEventListener("input", (e) => editPiece({ [k]: +e.target.value }));
  $("saveMine").onclick = () => {
    const name = $("saveName").value.trim() || "My look", id = "mine-" + Date.now().toString(36);
    change({ myPresets: [...S.myPresets, { id, name, piece: S.piece, fx: S.fx }].slice(-8), presetId: id }); $("saveName").value = "";
  };

  // ---------- board tab ----------
  function renderBoards() {
    $("boards").innerHTML = C.BOARDS.map((b) => `<button class="bsw ${b.id === S.boardStyle ? "on" : ""}" data-id="${b.id}" type="button"><span class="chip" style="${b.light ? `background:conic-gradient(${b.dark} 25%,${b.light} 0 50%,${b.dark} 0 75%,${b.light} 0);background-size:50% 50%` : "background:rgba(255,255,255,.08)"}">${b.light ? "" : "★"}</span>${esc(b.name)}</button>`).join("");
  }
  $("boards").addEventListener("click", (e) => { const b = e.target.closest(".bsw"); if (b) change({ boardStyle: b.dataset.id }); });
  const customBoard = () => change({ boardStyle: S.boardStyle === "default" ? "classic" : S.boardStyle, squareColors: { light: $("cLight").value, dark: $("cDark").value } });
  $("cLight").addEventListener("input", customBoard); $("cDark").addEventListener("input", customBoard);
  $("swap").onclick = () => change({ boardStyle: S.boardStyle === "default" ? "classic" : S.boardStyle, squareColors: { light: S.squareColors.dark, dark: S.squareColors.light } });

  // ---------- effects tab ----------
  const PNAME = { none: "Off", sparkles: "Sparkles", embers: "Embers", snow: "Snow", petals: "Petals", bubbles: "Bubbles", stardust: "Stardust", pixels: "Pixels" };
  $("particles").innerHTML = Pc.PARTICLES.map((k) => `<button class="chp" data-k="${k}" type="button">${PNAME[k]}</button>`).join("");
  $("particles").addEventListener("click", (e) => { const b = e.target.closest(".chp"); if (b) change({ fx: { particles: b.dataset.k }, presetId: S.presetId === "custom" ? "custom" : S.presetId }); });
  $("density").addEventListener("input", (e) => change({ fx: { density: +e.target.value } }));
  $("burst").addEventListener("change", (e) => change({ fx: { burst: e.target.checked } }));
  $("rm").addEventListener("change", (e) => change({ reducedMotion: e.target.checked }));
  $("spotify").addEventListener("change", (e) => change({ spotify: e.target.checked }));


  // ---------- parts tab ----------
  const PT_NAMES = { all: "All pieces", p: "Pawns", n: "Knights", b: "Bishops", r: "Rooks", q: "Queens", k: "Kings" };
  const partThumb = (k) => Pc.dataUri("wk", { ...Pc.DEFAULT_PIECE, parts: [{ k, on: "all", side: "both" }] });
  function renderPartTiles() {
    $("partTiles").innerHTML = Pc.PART_IDS.map((k) => `<button class="tile" data-k="${k}" type="button"><div class="th2 one"><i style="background-image:url('${partThumb(k)}')"></i></div><b>${esc(Pc.PARTS[k].name)}</b><small>Tap to add</small></button>`).join("");
  }
  $("partTiles").addEventListener("click", (e) => {
    const t = e.target.closest(".tile"); if (!t) return;
    if (S.piece.parts.length >= Pc.MAX_PARTS) { $("partCount").textContent = "· limit reached"; return; }
    editParts({ parts: [...S.piece.parts, { k: t.dataset.k, on: "all", side: "both", color: null, size: 100 }] });
  });
  let partSig = "";
  function renderPartList() {
    const list = S.piece.parts, sig = list.map((p) => p.k + p.on + p.side + (p.color ? 1 : 0)).join("|");
    if (sig === partSig && $("partList").children.length === list.length) {         // same structure: update values in place so sliders and colour pickers keep working
      list.forEach((p, i) => { const row = $("partList").children[i], sz = row.querySelector('[data-f="size"]'), co = row.querySelector('[data-f="color"]');
        if (document.activeElement !== sz) sz.value = p.size; row.querySelector("em").textContent = Math.round(p.size) + "%"; if (p.color && document.activeElement !== co) co.value = p.color; });
      return;
    }
    partSig = sig;
    $("partCount").textContent = list.length ? `· ${list.length}/${Pc.MAX_PARTS}` : "";
    $("partEmpty").hidden = !!list.length;
    $("partList").innerHTML = list.map((p, i) => `<div class="prow" data-i="${i}">
      <div class="phead"><i style="background-image:url('${partThumb(p.k)}')"></i><b>${esc(Pc.PARTS[p.k].name)}</b><button class="x" data-act="del" type="button" aria-label="Remove">✕</button></div>
      <div class="pctl">
        <label>On <select data-f="on">${Pc.PART_TARGETS.map((t) => `<option value="${t}" ${p.on === t ? "selected" : ""}>${PT_NAMES[t]}</option>`).join("")}</select></label>
        <label>Side <select data-f="side">${[["both", "Both"], ["w", "White"], ["b", "Black"]].map(([v, n]) => `<option value="${v}" ${p.side === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Colour <input type="color" data-f="color" value="${p.color || Pc.PARTS[p.k].c1}"><button class="x s" data-act="auto" type="button" ${p.color ? "" : "disabled"}>Auto</button></label>
        <label class="wide">Size <input type="range" data-f="size" min="50" max="150" value="${p.size}"><em>${Math.round(p.size)}%</em></label>
      </div></div>`).join("");
  }
  const setPart = (i, patch) => editParts({ parts: S.piece.parts.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  $("partList").addEventListener("click", (e) => {
    const row = e.target.closest(".prow"), b = e.target.closest("[data-act]"); if (!row || !b) return; const i = +row.dataset.i;
    if (b.dataset.act === "del") editParts({ parts: S.piece.parts.filter((_, k) => k !== i) });
    else if (b.dataset.act === "auto") setPart(i, { color: null });
  });
  $("partList").addEventListener("input", (e) => {
    const row = e.target.closest(".prow"), f = e.target.dataset.f; if (!row || !f) return;
    setPart(+row.dataset.i, { [f]: f === "size" ? +e.target.value : e.target.value });
  });

  // ---------- board texture + animation ----------
  $("textures").innerHTML = Object.entries(C.TEXTURES).map(([id, t]) => `<button class="chp" data-k="${id}" type="button">${esc(t.name)}</button>`).join("");
  $("textures").addEventListener("click", (e) => { const b = e.target.closest(".chp"); if (b) change({ boardTexture: b.dataset.k, boardStyle: S.boardStyle === "default" ? "classic" : S.boardStyle }); });
  let animsBuilt = false;
  function renderAnims() {
    if (animsBuilt) { document.querySelectorAll("#boardAnims .tile").forEach((t) => t.classList.toggle("on", t.dataset.k === S.boardAnim)); return; }
    animsBuilt = true;
    $("boardAnims").innerHTML = `<button class="tile ${S.boardAnim === "none" ? "on" : ""}" data-k="none" type="button"><div class="th2 one ph">—</div><b>None</b><small>Static board</small></button>` +
      self.BMBoardFx.STYLES.map((k) => `<button class="tile ${S.boardAnim === k ? "on" : ""}" data-k="${k}" type="button"><div class="th2 one"><canvas class="mini" data-k="${k}" width="96" height="48"></canvas></div><b>${esc(self.BMBoardFx.LABELS[k])}</b><small>Live</small></button>`).join("");
  }
  $("boardAnims").addEventListener("click", (e) => { const t = e.target.closest(".tile"); if (t) change({ boardAnim: t.dataset.k }); });
  // thumbnails: render each style for a moment, then stop so only the preview board keeps animating
  function thumbs() {
    document.querySelectorAll("#boardAnims canvas.mini").forEach((cv, i) => setTimeout(() => {
      const f = self.BMBoardFx.create(cv); f.set(cv.dataset.k, 80, false); cv.style.mixBlendMode = "normal"; cv.style.opacity = "1"; setTimeout(() => f.destroy(), 1400 + i * 60);
    }, i * 90));
  }
  $("animPower").addEventListener("input", (e) => change({ boardAnimPower: +e.target.value }));

  // ---------- backup ----------
  $("export").onclick = async () => { const text = JSON.stringify(S); try { await navigator.clipboard.writeText(text); $("export").textContent = "Copied"; } catch (_) { $("blob").hidden = false; $("blob").value = text; $("export").textContent = "Select & copy"; } setTimeout(() => ($("export").textContent = "Copy"), 1600); };
  $("import").onclick = () => { $("blob").hidden = false; $("apply").hidden = false; $("blob").value = ""; $("blob").focus(); };
  $("apply").onclick = () => { try { const v = JSON.parse($("blob").value); change(C.normalize(v)); $("blob").hidden = true; $("apply").hidden = true; } catch (_) { $("blob").value = "That doesn't look like a backup."; } };
  $("reset").onclick = () => change({ ...C.normalize({}), myPresets: S.myPresets });

  // ---------- render ----------
  let raf = 0;
  function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
  const guard = (name, sig, fn) => { if (guards[name] === sig) return; guards[name] = sig; fn(); };
  const guards = {};
  function render() {
    paintPreview();
    guard("presets", S.pieceSource + S.presetId + S.boardStyle + S.squareColors.light + S.squareColors.dark + JSON.stringify(S.myPresets.map((m) => m.id)), renderPresets);
    guard("boards", S.boardStyle, renderBoards);
    renderThemes(); renderPartList(); renderAnims();
    document.querySelectorAll("#textures .chp").forEach((b) => b.classList.toggle("on", b.dataset.k === S.boardTexture));
    $("animPower").value = S.boardAnimPower; $("animPowerV").textContent = Math.round(S.boardAnimPower); $("animPower").style.setProperty("--p", ((S.boardAnimPower - 10) / 90) * 100 + "%");
    segSync("family", S.piece.family); segSync("style", S.piece.style);
    $("wFill").value = S.piece.white.fill; $("wStroke").value = S.piece.white.stroke; $("bFill").value = S.piece.black.fill; $("bStroke").value = S.piece.black.stroke;
    for (const k of ["outline", "gloss", "shadow", "glow"]) { const el = $(k); el.value = S.piece[k]; $(k + "V").textContent = k === "outline" ? (+S.piece[k]).toFixed(1) : Math.round(S.piece[k]); const max = +el.max, min = +el.min; el.style.setProperty("--p", ((S.piece[k] - min) / (max - min)) * 100 + "%"); }
    $("cLight").value = S.squareColors.light; $("cDark").value = S.squareColors.dark;
    document.querySelectorAll("#particles .chp").forEach((b) => b.classList.toggle("on", b.dataset.k === S.fx.particles));
    $("density").value = S.fx.density; $("densityV").textContent = Math.round(S.fx.density); $("density").style.setProperty("--p", ((S.fx.density - 5) / 95) * 100 + "%");
    $("burst").checked = S.fx.burst;
    $("rm").checked = S.reducedMotion; $("spotify").checked = S.spotify;
  }

  buildBoard(); renderPartTiles(); render(); thumbs(); setView("board");
  C.load().then((s) => { S = s; loaded = true; render(); });
  C.watch((s) => { if (Object.keys(pending).length) return; S = s; render(); });   // another tab changed something
})();
