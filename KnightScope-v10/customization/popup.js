(() => {
  const $ = (id) => document.getElementById(id), msg = (t) => ($("msg").textContent = t || "");
  const isChess = (tab) => tab && /^https:\/\/www\.chess\.com\//.test(tab.url || "");
  let tabPromise = chrome.tabs.query({ active: true, currentWindow: true }).then((t) => t[0]).catch(() => null);
  tabPromise.then((tab) => { $("where").textContent = isChess(tab) ? "Connected to this Chess.com tab" : "Open a Chess.com tab to use the panel"; $("show").disabled = !isChess(tab); });
  $("studio").onclick = () => chrome.runtime.sendMessage({ type: "openCustomization" }, () => window.close());
  $("analysis").onclick = () => chrome.runtime.sendMessage({ type: "openAnalysis" }, () => window.close());
  $("show").onclick = async () => {
    const tab = await tabPromise; if (!isChess(tab)) return msg("Open a chess.com tab first.");
    chrome.runtime.sendMessage({ type: "showPanel", tabId: tab.id }, (r) => msg(chrome.runtime.lastError || (r && r.error) ? "Couldn't reset the panel. Reload the page." : "Panel reset."));
  };
  // ---- Assist on/off, straight from the toolbar ----
  const REVIEW_URL = self.BMFeedback && "https://chromewebstore.google.com/detail/chess-assistant/ohkbpmebalniinbedliepdnpencmaldp/reviews";
  const assist = $("assist"), assistState = (on) => { $("assistState").textContent = on ? "Arrows and suggestions" : "Paused. Nothing is shown or played"; };
  chrome.storage.local.get("bmSettings", (r) => { const on = !(r && r.bmSettings && r.bmSettings.enabled === false); assist.checked = on; assistState(on); });
  assist.onchange = () => chrome.storage.local.get("bmSettings", (r) => { chrome.storage.local.set({ bmSettings: { ...((r && r.bmSettings) || {}), enabled: assist.checked } }); assistState(assist.checked); });
  try { $("ver").textContent = "Best Move v" + chrome.runtime.getManifest().version + " · Alt+B hide/show"; } catch (_) {}

  // ---- Small stats line + pending suggestions ----
  chrome.storage.local.get(["bmReview", "bmSuggestionQueue"], (r) => {
    const g = r && r.bmReview && r.bmReview.games | 0, q = Array.isArray(r && r.bmSuggestionQueue) ? r.bmSuggestionQueue.length : 0;
    const parts = []; if (g) parts.push(g + (g === 1 ? " game" : " games") + " finished with Best Move");
    if (q) parts.push(q + (q === 1 ? " suggestion" : " suggestions") + " waiting to send");
    if (parts.length) msg(parts.join(" · "));
    if (q) chrome.runtime.sendMessage({ type: "bm-flush-suggestions" }, () => void chrome.runtime.lastError);
  });

  // ---- Rate + suggestion form ----
  $("rate").onclick = () => chrome.tabs.create({ url: REVIEW_URL }, () => window.close());
  let form = null; const main = document.querySelector(".pop"), fb = $("fbView");
  $("suggest").onclick = () => {
    main.hidden = true; fb.hidden = false;
    if (!form) form = self.BMFeedback.mount($("fbMount"), { page: "popup", onCancel: back, onDone: back });
    chrome.runtime.sendMessage({ type: "bm-flush-suggestions" }, () => void chrome.runtime.lastError);
  };
  function back() { if (form) { form.destroy(); form = null; } fb.hidden = true; main.hidden = false; }
  $("fbBack").onclick = back;

  // ---- Back up / restore settings (panel settings + Studio look) ----
  $("exp").onclick = () => chrome.storage.local.get(["bmSettings", "bmCustomization"], (r) => {
    const blob = new Blob([JSON.stringify({ bestMove: chrome.runtime.getManifest().version, bmSettings: r.bmSettings || {}, bmCustomization: r.bmCustomization || {} }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "best-move-settings.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    msg("Settings exported.");
  });
  $("imp").onclick = () => $("impFile").click();
  $("impFile").onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = ""; if (!file) return;
    try {
      if (file.size > 2e6) throw new Error("big");
      const data = JSON.parse(await file.text()), plain = (o) => o && typeof o === "object" && !Array.isArray(o);
      if (!plain(data) || !("bestMove" in data) || !plain(data.bmSettings) || !plain(data.bmCustomization)) throw new Error("shape");
      chrome.storage.local.set({ bmSettings: data.bmSettings, bmCustomization: data.bmCustomization }, () => { msg("Settings imported. Reload chess.com to apply."); assist.checked = data.bmSettings.enabled !== false; assistState(assist.checked); });
    } catch (_) { msg("That file isn't a Best Move settings export."); }
  };

  // Spotify mini player (only appears while a Spotify web tab is open)
  chrome.storage.local.get("bmCustomization", (r) => {
    const on = !(r && r.bmCustomization && r.bmCustomization.spotify === false);
    self.BMSpotifyWidget.create({ root: $("sp").attachShadow({ mode: "open" }), floating: false, enabled: () => on });
  });
})();
