(() => {
  "use strict";
  if (window.__knightScopeStudyShortcut) return;
  window.__knightScopeStudyShortcut = true;

  const isTyping = (target) => {
    if (!target) return false;
    const tag = target.tagName?.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
  };

  let host = null;
  function openStudio() {
    chrome.runtime.sendMessage({ type: "openCustomization" }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        const status = host?.shadowRoot?.querySelector("[data-status]");
        if (status) status.textContent = response?.error || chrome.runtime.lastError.message;
      }
    });
  }
  async function reviewFinishedGame() {
    const status = host.shadowRoot.querySelector("[data-status]");
    status.textContent = "Looking for a finished game…";
    try {
      const found = await chrome.runtime.sendMessage({ type: "wtp:find" });
      if (!found?.ok) {
        status.textContent = found?.message || "Open a finished Chess.com game first.";
        return;
      }
      const opened = await chrome.runtime.sendMessage({ type: "wtp:open" });
      status.textContent = opened?.ok ? "Opening game review…" : (opened?.message || "Could not open the review.");
    } catch (_) {
      status.textContent = "Refresh this Chess.com tab and try again.";
    }
  }
  function build() {
    if (host) return;
    host = document.createElement("div");
    host.id = "knightscope-study-shortcut";
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box;font-family:Arial,sans-serif}
        .panel{position:fixed;right:22px;top:22px;width:300px;padding:16px;border-radius:16px;background:#111b17;color:#f2f7f3;border:1px solid #345746;box-shadow:0 14px 44px #0008;pointer-events:auto}
        header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        h2{font-size:17px;margin:0;font-weight:700}
        .hint{font-size:11px;color:#a8bdb0;margin:0 0 14px}
        button{width:100%;border:0;border-radius:10px;padding:11px 12px;margin:5px 0;text-align:left;font-size:13px;font-weight:600;cursor:pointer;background:#20392c;color:#eaf5ed}
        button.primary{background:#27764b;color:white}
        button.close{width:30px;height:30px;padding:0;text-align:center;margin:0;background:#26372e;font-size:18px}
        button:hover{filter:brightness(1.13)}
        [data-status]{font-size:11px;color:#b7c8bd;min-height:15px;margin:10px 2px 0}
      </style>
      <section class="panel" role="dialog" aria-label="KnightScope study tools">
        <header><h2>KnightScope</h2><button class="close" type="button" aria-label="Close">×</button></header>
        <p class="hint">Study tools · Alt+B to close</p>
        <button class="primary" type="button" data-customize>Customize board &amp; pieces</button>
        <button type="button" data-review>Review finished game</button>
        <p data-status aria-live="polite">Choose a study tool.</p>
      </section>`;
    root.querySelector(".close").addEventListener("click", close);
    root.querySelector("[data-customize]").addEventListener("click", openStudio);
    root.querySelector("[data-review]").addEventListener("click", reviewFinishedGame);
    document.documentElement.appendChild(host);
  }
  function close() { host?.remove(); host = null; }
  function toggle() { if (host) close(); else build(); }
  window.addEventListener("keydown", (event) => {
    if (event.altKey && event.key.toLowerCase() === "b" && !event.repeat && !isTyping(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }
  }, true);
})();