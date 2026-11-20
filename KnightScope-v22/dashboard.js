"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll(".tab")];
  const views = { review: $("review-view"), analysis: $("analysis-view") };
  const status = (id, message) => { const el = $(id); if (el) el.textContent = message; };
  function activateTab(tab, focus = false) {
    const name = tab.dataset.view;
    tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
    });
    Object.entries(views).forEach(([key, view]) => {
      view.hidden = key !== name;
      view.classList.toggle("active", key === name);
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = tabs.indexOf(tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
        (current + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      activateTab(tabs[next], true);
    });
  });
  async function activeTab() {
    try { return (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null; }
    catch (_) { return null; }
  }
  async function send(type) {
    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/www\.chess\.com\//.test(tab.url || ""))
      return { ok: false, message: "Open a Chess.com page first." };
    try { return await chrome.tabs.sendMessage(tab.id, { type }); }
    catch (_) { return { ok: false, message: "Refresh the Chess.com tab, then try again." }; }
  }
  async function checkGame() {
    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/www\.chess\.com\//.test(tab.url || "")) {
      $("review-btn").disabled = true;
      $("game-dot").classList.remove("ready");
      status("review-status", "Navigate to Chess.com to begin.");
      return;
    }
    const result = await send("wtp:find");
    if (result?.ok && result.game) {
      $("game-title").textContent = [result.game.white, "vs", result.game.black].filter(Boolean).join(" ");
      $("game-subtitle").textContent = result.game.message || result.game.result || "Finished game found.";
      $("game-dot").classList.add("ready");
      $("review-btn").disabled = false;
      status("review-status", "Game found. Ready to review.");
    } else {
      $("game-dot").classList.remove("ready");
      $("review-btn").disabled = true;
      status("review-status", result?.message || "No finished game found on this page.");
    }
  }
  $("review-btn").addEventListener("click", async () => {
    const button = $("review-btn");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    status("review-status", "Loading game review…");
    try {
      const result = await send("wtp:find");
      if (!result?.ok || !result.game?.pgn) {
        status("review-status", result?.message || "Could not load the finished game.");
        return;
      }
      chrome.runtime.sendMessage({ type: "openAnalysis", payload: { pgn: result.game.pgn } }, () => {
        if (chrome.runtime.lastError) status("review-status", "Could not open Analysis Board. Try again.");
        else window.close();
      });
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = false;
    }
  });
  $("analysis-btn").addEventListener("click", () => {
    status("analysis-status", "Opening Analysis Board…");
    chrome.runtime.sendMessage({ type: "openAnalysis" }, () => {
      if (chrome.runtime.lastError) status("analysis-status", "Could not open Analysis Board. Try again.");
      else window.close();
    });
  });
  $("panel-btn").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab?.id) { status("analysis-status", "No active tab found."); return; }
    status("analysis-status", "Refreshing Chess.com tools…");
    chrome.runtime.sendMessage({ type: "showPanel", tabId: tab.id }, (response) => {
      if (chrome.runtime.lastError || response?.error) status("analysis-status", response?.error || "Could not refresh tools.");
      else window.close();
    });
  });
  checkGame().catch(() => status("review-status", "Could not check this tab. Refresh the popup and retry."));
})();