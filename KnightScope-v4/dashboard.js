"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll(".tab")];
  const views = { review: $("review-view"), analysis: $("analysis-view") };
  const status = (id, message) => { $(id).textContent = message; };

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    const name = tab.dataset.view;
    tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    Object.entries(views).forEach(([key, view]) => {
      view.hidden = key !== name;
      view.classList.toggle("active", key === name);
    });
  }));

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }
  async function sendToChessTab(type) {
    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/www\.chess\.com\//.test(tab.url || "")) {
      return { ok: false, message: "Open a Chess.com game first, then try again." };
    }
    try {
      return await chrome.tabs.sendMessage(tab.id, { type });
    } catch {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        return await chrome.tabs.sendMessage(tab.id, { type });
      } catch {
        return { ok: false, message: "Refresh the Chess.com tab and try again." };
      }
    }
  }

  const auto = $("auto-review");
  chrome.storage.local.get({ auto: true }).then((data) => { auto.checked = data.auto !== false; });
  auto.addEventListener("change", () => chrome.storage.local.set({ auto: auto.checked }));

  async function checkGame() {
    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/www\.chess\.com\//.test(tab.url || "")) {
      $("game-title").textContent = "No Chess.com game detected";
      $("game-subtitle").textContent = "Open a completed game to review it.";
      $("game-dot").classList.remove("ready");
      $("review-btn").disabled = true;
      status("review-status", "Navigate to Chess.com to begin.");
      return;
    }
    const result = await sendToChessTab("wtp:find");
    if (result?.ok) {
      $("game-title").textContent = result.game.white + " vs " + result.game.black;
      $("game-subtitle").textContent = result.game.message || result.game.result || "Game found and ready to review.";
      $("game-dot").classList.add("ready");
      $("review-btn").disabled = false;
      status("review-status", "Ready when you are.");
    } else {
      $("game-title").textContent = "Chess.com tab detected";
      $("game-subtitle").textContent = "Open a finished game to start a review.";
      $("game-dot").classList.remove("ready");
      $("review-btn").disabled = true;
      status("review-status", result?.message || "No finished game found on this page.");
    }
  }

  $("review-btn").addEventListener("click", async () => {
    const button = $("review-btn");
    button.disabled = true;
    button.firstChild.textContent = "Opening review ";
    const result = await sendToChessTab("wtp:open");
    if (result?.ok) window.close();
    else {
      status("review-status", result?.message || "Could not open the review.");
      button.disabled = false;
      button.firstChild.textContent = "Review this game ";
    }
  });

  $("analysis-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "openAnalysis" }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        status("analysis-status", response?.error || "Could not open the analysis board.");
      } else window.close();
    });
  });

  $("panel-btn").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab?.id || !/^https:\/\/www\.chess\.com\//.test(tab.url || "")) {
      status("analysis-status", "Open Chess.com first to show the live panel.");
      return;
    }
    chrome.runtime.sendMessage({ type: "showPanel", tabId: tab.id }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        status("analysis-status", response?.error || "Could not show the Best Move panel.");
      } else {
        status("analysis-status", "Best Move panel opened on your Chess.com tab.");
        window.close();
      }
    });
  });

  checkGame().catch(() => status("review-status", "Could not check this tab."));
})();
