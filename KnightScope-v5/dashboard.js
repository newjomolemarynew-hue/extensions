"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll(".tab")];
  const views = { review: $("review-view"), analysis: $("analysis-view"), chat: $("chat-view") };
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


  const chatForm = $("chat-form"), chatInput = $("chat-input"), chatLog = $("chat-log");
  function addChat(text, who) {
    const item = document.createElement("div");
    item.className = "chat-message " + who;
    item.textContent = text;
    chatLog.append(item);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function chessAnswer(raw) {
    const q = raw.toLowerCase();
    if (q.includes("castl")) return "Castling is a special king move. The king moves two squares toward a rook, and that rook moves next to the king. You can only castle if neither piece has moved, the path is clear, the king is not in check, and it does not cross an attacked square.";
    if (q.includes("en passant")) return "En passant is a special pawn capture. If an enemy pawn moves two squares from its starting square and lands beside your pawn, you may capture it as though it moved one square. You must do this immediately on your next move.";
    if (q.includes("checkmate") || q.includes("mate")) return "Checkmate means the king is in check and there is no legal move to escape. The game ends immediately.";
    if (q.includes("stalemate") || q.includes("draw")) return "Stalemate is a draw: the player to move is not in check but has no legal moves. Other draws include agreement, repetition and the fifty-move rule.";
    if (q.includes("fork")) return "A fork is a double attack: one piece attacks two or more enemy pieces at once. Knights are especially good at forks.";
    if (q.includes("pin")) return "A pin happens when moving a piece would expose a more valuable piece behind it, often the king. A piece pinned to its king cannot legally move if that exposes check.";
    if (q.includes("skewer")) return "A skewer attacks a valuable piece first. When it moves, a less valuable piece behind it can be won.";
    if (q.includes("opening")) return "A good opening usually follows three ideas: control the centre, develop your knights and bishops, and get your king safe by castling.";
    if (q.includes("stockfish") || q.includes("engine")) return "Stockfish is a chess engine that calculates strong candidate moves. Use the analysis board after a game or in a practice position to compare lines.";
    if (q.includes("accuracy") || q.includes("mistake") || q.includes("blunder") || q.includes("review")) return "The game review compares moves played with engine analysis and groups them into categories. Select a move in the review to inspect the position and compare alternatives.";
    if (q.includes("maia")) return "Maia is a chess model trained to predict human-like moves at different playing strengths. The Maia model files are included, but that does not prove every level is connected to the interface.";
    if (q.includes("hello") || q === "hi" || q.includes("hey")) return "Hello! Ask me about chess rules, tactics, openings, engines or how to read a game review.";
    return "I can help with castling, en passant, forks, pins, skewers, openings, checkmate, draws, Stockfish and reading your completed-game review. Try one of those topics.";
  }
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;
    addChat(message, "user");
    addChat(chessAnswer(message), "bot");
    chatInput.value = "";
    chatInput.focus();
  });
\n  checkGame().catch(() => status("review-status", "Could not check this tab."));
})();
