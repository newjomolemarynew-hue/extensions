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
  const chatStatus = $("chat-status");
  function addChat(text, who) {
    const item = document.createElement("div");
    item.className = "chat-message " + who;
    item.textContent = text;
    chatLog.append(item);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  const boardLooks = {
    classic: { boardStyle: "classic" }, walnut: { boardStyle: "walnut" },
    ice: { boardStyle: "ice" }, slate: { boardStyle: "slate" },
    midnight: { boardStyle: "midnight" }, rose: { boardStyle: "rose" },
    ocean: { boardStyle: "ocean" }, violet: { boardStyle: "violet" },
    sunset: { boardStyle: "sunset" }, mono: { boardStyle: "mono" },
    ember: { boardStyle: "ember" }, chesscom: { boardStyle: "default" }
  };
  const textures = ["wood", "marble", "stone", "linen", "brushed"];
  async function patchLook(patch) {
    const current = await chrome.storage.local.get("bmCustomization");
    const settings = { ...(current.bmCustomization || {}), ...patch };
    await chrome.storage.local.set({ bmCustomization: settings });
  }
  async function designCommand(q) {
    const text = q.toLowerCase();
    const look = Object.keys(boardLooks).find(name =>
      new RegExp("\\b" + name + "\\b").test(text) &&
      /(board|square|theme|look|colour|color|change|make|use|switch|set)/.test(text)
    );
    if (look) {
      await patchLook(boardLooks[look]);
      return "Done — I changed your board to " + look + ". The setting is saved in KnightScope and should update on supported Chess.com views.";
    }
    const texture = textures.find(name => text.includes(name));
    if (texture && /(texture|grain|surface|board|use|turn|enable|change)/.test(text)) {
      await patchLook({ boardTexture: texture });
      return "Done — the " + texture + " board texture is now selected.";
    }
    if (/(remove|disable|turn off|no) .*(texture|grain)/.test(text) || /texture off/.test(text)) {
      await patchLook({ boardTexture: "none" });
      return "Done — board texture is off.";
    }
    if (/(reduce motion|less motion|turn off motion|disable animation|no animation)/.test(text)) {
      await patchLook({ reducedMotion: true, boardAnim: "none" });
      return "Done — motion effects are reduced and board animation is off.";
    }
    if (/(restore motion|enable animation|turn on motion)/.test(text)) {
      await patchLook({ reducedMotion: false });
      return "Done — reduced motion is off. You can choose a board animation in Studio.";
    }
    if (/(reset|default) (the )?(board|board look|appearance)/.test(text)) {
      await patchLook({ boardStyle: "default", boardTexture: "none", boardAnim: "none", reducedMotion: false });
      return "Done — the board appearance is back to its default settings.";
    }
    if (/(open|show).*(studio|customi[sz]ation|appearance settings)/.test(text)) {
      return "Use the Open Studio button in the Best Move panel on Chess.com. Studio has the full set of piece, board, effects and other appearance controls.";
    }
    return null;
  }
  function chessAnswer(raw) {
    const q = raw.toLowerCase();
    if (q.includes("castl")) return "Castling moves your king two squares toward a rook, then places the rook beside it. You can only castle if the king and rook have not moved, the path is clear, and the king is not in check or crossing an attacked square.";
    if (q.includes("en passant")) return "En passant is a special pawn capture. If an enemy pawn advances two squares and lands beside yours, you may capture it as if it had moved one square. You must do it immediately on your next move.";
    if (q.includes("checkmate") || q.includes("mate")) return "Checkmate means the king is in check and there is no legal move to escape. The game ends immediately.";
    if (q.includes("stalemate") || q.includes("draw")) return "Stalemate is a draw: the player to move is not in check but has no legal moves. Other draws include agreement, repetition and the fifty-move rule.";
    if (q.includes("fork")) return "A fork is a double attack: one piece attacks two or more enemy pieces at once. Knights are especially good at forks.";
    if (q.includes("pin")) return "A pin happens when moving a piece would expose a more valuable piece behind it, often the king. A piece pinned to its king cannot legally move if that exposes check.";
    if (q.includes("skewer")) return "A skewer attacks a valuable piece first. When it moves, a less valuable piece behind it can be won.";
    if (q.includes("opening")) return "A useful opening plan is to fight for the centre, develop your knights and bishops, and get your king safe. You don't need to memorise dozens of moves to understand those ideas.";
    if (q.includes("stockfish") || q.includes("engine")) return "Stockfish is a chess engine that evaluates positions and suggests candidate moves. Use the analysis board to compare lines and understand why a move works.";
    if (q.includes("accuracy") || q.includes("mistake") || q.includes("blunder") || q.includes("review")) return "A game review compares your moves with engine analysis and labels important differences. Select a move to inspect the position and compare alternatives.";
    if (q.includes("maia")) return "Maia is designed to predict human-like chess moves at different playing strengths. KnightScope includes Maia-related files and controls.";
    if (/^(hi|hello|hey)\\b/.test(q)) return "Hey! What would you like to work on — a chess concept, your game review, or the way KnightScope looks?";
    if (/(what can you|help me|commands|what do you do)/.test(q)) return "I can explain common chess rules and tactics, and change board presets (Ocean, Walnut, Midnight, Classic, Ice, Slate, Rose, Violet, Sunset, Mono or Ember), board textures, and motion settings. Say what you want in normal words. For piece designs and more detailed panel controls, open Studio.";
    return "I don't know that one yet. I can explain chess rules and tactics, or make supported appearance changes. Tell me the change you want in a simple sentence, such as “make my board ocean” or “turn off motion effects”.";
  }
  async function handleChat(raw) {
    const message = raw.trim();
    if (!message) return;
    addChat(message, "user");
    chatInput.value = "";
    try {
      const changed = await designCommand(message);
      addChat(changed || chessAnswer(message), "bot");
      chatStatus.textContent = "Settings are saved locally on this device.";
    } catch (error) {
      addChat("I couldn't save that appearance change. Please try again, or open Studio and change it there.", "bot");
      chatStatus.textContent = "Could not update settings.";
    }
    chatInput.focus();
  }
  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handleChat(chatInput.value);
  });
  document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => handleChat(button.dataset.prompt)));

  checkGame().catch(() => status("review-status", "Could not check this tab."));
})();
