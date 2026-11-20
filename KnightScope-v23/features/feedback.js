// Suggestion form shared by the toolbar popup and the in-page review card.
//
// What is sent (and nothing else): the name and message the person typed, the category they picked,
// the extension version and which screen the form was opened from. No game data, no moves, no page URL.
// The network request is made by the background service worker (see background.js, "bm-suggestion"),
// which also keeps a small offline queue so a suggestion is never lost if the server is unreachable.
(() => {
  const LIMITS = { name: 40, message: 2000, minMessage: 5 };
  const CATEGORIES = [
    ["feature", "Idea"],
    ["bug", "Problem"],
    ["boards", "Boards & pieces"],
    ["analysis", "Analysis"],
    ["other", "Other"]
  ];
  const NAME_KEY = "bmFeedbackName", DRAFT_KEY = "bmFeedbackDraft";

  const clean = (value, max) => String(value == null ? "" : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

  // Builds the request body. Pure, so it can be tested without a browser.
  function buildPayload({ name, message, category, page, version, selectedStyle }) {
    const msg = clean(message, LIMITS.message);
    if (msg.length < LIMITS.minMessage) return { error: "Please write a few words so we know what you mean." };
    const cat = CATEGORIES.some((c) => c[0] === category) ? category : "other";
    const data = { category: cat };
    if (selectedStyle) data.selectedStyle = clean(selectedStyle, 60);
    return {
      body: {
        user: clean(name, LIMITS.name) || "anonymous",
        message: msg,
        data,
        info: { extensionVersion: String(version || ""), page: clean(page || "unknown", 30) }
      }
    };
  }

  const version = () => { try { return chrome.runtime.getManifest().version; } catch (_) { return ""; } };

  function send(fields) {
    const built = buildPayload({ ...fields, version: version() });
    if (built.error) return Promise.resolve({ ok: false, error: built.error });
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "bm-suggestion", body: built.body }, (res) => {
          if (chrome.runtime.lastError || !res) resolve({ ok: false, error: "Couldn't reach the extension. Reload the page and try again." });
          else resolve(res);
        });
      } catch (_) { resolve({ ok: false, error: "Couldn't reach the extension. Reload the page and try again." }); }
    });
  }

  const STYLE = `
.bmf{display:grid;gap:10px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:var(--tx,#f5f6f9)}
.bmf *{box-sizing:border-box}
.bmf .chips{display:flex;flex-wrap:wrap;gap:6px}
.bmf .chip{padding:5px 11px;border-radius:999px;font-size:12px;font-weight:600;color:inherit;cursor:pointer;border:0;
  background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);transition:background .2s,transform .2s}
.bmf .chip:hover{background:rgba(255,255,255,.14)}
.bmf .chip[aria-pressed=true]{background:rgba(var(--acc,10,132,255),.85);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.bmf input,.bmf textarea{width:100%;font:inherit;color:inherit;background:rgba(0,0,0,.28);border:0;border-radius:12px;padding:9px 12px;outline:none;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.bmf textarea{min-height:92px;resize:vertical}
.bmf input:focus,.bmf textarea:focus{box-shadow:inset 0 0 0 1.5px rgba(var(--acc,10,132,255),.95),0 0 0 3px rgba(var(--acc,10,132,255),.22)}
.bmf label{display:grid;gap:5px;font-size:11.5px;font-weight:600;color:rgba(235,238,248,.7)}
.bmf .row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.bmf .count{font-size:11px;color:rgba(235,238,248,.5);font-variant-numeric:tabular-nums}
.bmf .count.warn{color:#ffb454}
.bmf .go{height:34px;padding:0 18px;border-radius:999px;font:inherit;font-weight:650;font-size:13px;color:#fff;cursor:pointer;border:0;
  background:linear-gradient(180deg,rgba(var(--acc,10,132,255),.98),rgba(var(--acc,10,132,255),.7));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.55),0 6px 18px -6px rgba(var(--acc,10,132,255),.7)}
.bmf .go:disabled{opacity:.5;cursor:default}
.bmf .ghost{height:34px;padding:0 14px;border-radius:999px;font:inherit;font-weight:600;font-size:12.5px;color:inherit;cursor:pointer;border:0;
  background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
.bmf .note{font-size:11px;color:rgba(235,238,248,.5)}
.bmf .out{min-height:16px;font-size:12px;font-weight:600}
.bmf .out.ok{color:#7ed957}.bmf .out.err{color:#ff7a6e}.bmf .out.wait{color:#ffb454}
.bmf button:focus-visible,.bmf input:focus-visible,.bmf textarea:focus-visible{outline:2px solid rgba(var(--acc,10,132,255),.95);outline-offset:2px}
.bmf .done{display:grid;gap:8px;justify-items:center;text-align:center;padding:14px 4px}
.bmf .done b{font-size:15px}.bmf .done span{color:rgba(235,238,248,.7);font-size:12.5px}
`;

  // Renders the form into `root` (an element or shadow root).
  // options: { page, onDone(result), onCancel(), compact, selectedStyle, autofocus }
  function mount(root, options = {}) {
    const opts = options;
    const el = (tag, attrs, ...kids) => {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") node.textContent = v; else node.setAttribute(k, v); }
      kids.forEach((kid) => kid && node.appendChild(kid));
      return node;
    };
    const style = el("style"); style.textContent = STYLE;
    const wrap = el("div", { class: "bmf" });
    let category = "feature", busy = false;

    const chips = el("div", { class: "chips", role: "group", "aria-label": "Category" });
    const chipButtons = CATEGORIES.map(([value, label]) => {
      const b = el("button", { type: "button", class: "chip", "aria-pressed": String(value === category), text: label });
      b.onclick = () => { category = value; chipButtons.forEach((x, i) => x.setAttribute("aria-pressed", String(CATEGORIES[i][0] === value))); };
      chips.appendChild(b); return b;
    });

    const message = el("textarea", { maxlength: String(LIMITS.message), placeholder: "What would make Best Move better for you?", "aria-label": "Your suggestion" });
    const name = el("input", { type: "text", maxlength: String(LIMITS.name), placeholder: "Optional", autocomplete: "off", spellcheck: "false" });
    const count = el("span", { class: "count", text: `0 / ${LIMITS.message}` });
    const out = el("div", { class: "out", "aria-live": "polite" });
    const submit = el("button", { type: "button", class: "go", text: "Send" });
    const cancel = opts.onCancel ? el("button", { type: "button", class: "ghost", text: "Back" }) : null;

    wrap.append(
      chips,
      el("label", {}, el("span", { text: "Your suggestion" }), message),
      el("div", { class: "row" }, count),
      el("label", {}, el("span", { text: "Name or Chess.com username" }), name),
      el("div", { class: "row" }, cancel || el("span"), submit),
      out,
      el("div", { class: "note", text: "Only what you type here is sent, plus the extension version. No games, moves or page data." })
    );
    root.append(style, wrap);

    try { chrome.storage.local.get(NAME_KEY, (r) => { if (r && r[NAME_KEY] && !name.value) name.value = String(r[NAME_KEY]).slice(0, LIMITS.name); }); } catch (_) {}

    // A toolbar popup closes the moment you click away, so keep what was typed until it is sent.
    let draftTimer = 0;
    try { chrome.storage.local.get(DRAFT_KEY, (r) => { const d = r && r[DRAFT_KEY]; if (d && d.message && !message.value) { message.value = String(d.message).slice(0, LIMITS.message); count.textContent = `${message.value.length} / ${LIMITS.message}`; if (CATEGORIES.some((c) => c[0] === d.category)) chipButtons[CATEGORIES.findIndex((c) => c[0] === d.category)].click(); } }); } catch (_) {}
    const saveDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => { try { chrome.storage.local.set({ [DRAFT_KEY]: { message: message.value, category } }); } catch (_) {} }, 300); };
    chips.addEventListener("click", saveDraft);
    message.addEventListener("input", () => {
      saveDraft();
      const n = message.value.length; count.textContent = `${n} / ${LIMITS.message}`;
      count.classList.toggle("warn", n > LIMITS.message - 100); out.textContent = ""; out.className = "out";
    });
    // Keep the page's own shortcuts (Chess.com hotkeys) from firing while typing in the page.
    for (const node of [message, name]) for (const type of ["keydown", "keyup", "keypress"]) node.addEventListener(type, (e) => e.stopPropagation());
    message.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit.click(); });
    if (cancel) cancel.onclick = () => opts.onCancel();

    submit.onclick = async () => {
      if (busy) return;
      busy = true; submit.disabled = true; out.className = "out"; out.textContent = "Sending…";
      const style = opts.selectedStyle || await new Promise((ok) => { try { chrome.storage.local.get("bmCustomization", (r) => { const c = (r && r.bmCustomization) || {}; ok(c.pieceStyle || c.boardStyle || ""); }); } catch (_) { ok(""); } });
      const fields = { name: name.value, message: message.value, category, page: opts.page, selectedStyle: style };
      const res = await send(fields);
      busy = false; submit.disabled = false;
      if (res.ok) {
        try { chrome.storage.local.remove(DRAFT_KEY); clearTimeout(draftTimer); } catch (_) {}
        try { if (name.value.trim()) chrome.storage.local.set({ [NAME_KEY]: name.value.trim().slice(0, LIMITS.name) }); } catch (_) {}
        wrap.replaceChildren(el("div", { class: "done" },
          el("b", { text: res.queued ? "Saved. We'll send it shortly." : "Thank you!" }),
          el("span", { text: res.queued ? "The suggestion server isn't reachable right now, so Best Move kept your message and will send it automatically." : "Your suggestion was sent. Every one gets read." }),
          opts.onDone ? Object.assign(el("button", { type: "button", class: "ghost", text: "Done" }), { onclick: () => opts.onDone(res) }) : null));
        if (opts.onSent) opts.onSent(res);
      } else { out.className = "out err"; out.textContent = res.error || "Could not send. Please try again."; }
    };
    if (opts.autofocus !== false) setTimeout(() => message.focus(), 30);
    return { destroy() { style.remove(); wrap.remove(); } };
  }

  self.BMFeedback = { mount, send, buildPayload, LIMITS, CATEGORIES, STYLE };
})();
