(() => {
  let version = "1";
  try { version = String(chrome.runtime.getManifest().version).split(".")[0]; } catch (_) {}
  const label = "V" + version;
  document.title = (document.title || "KnightScope").replace(/KnightScope(?:\\s+V\\d+)?/i, "KnightScope " + label);
  document.querySelectorAll(".version").forEach((el) => { el.textContent = label; });
  document.querySelectorAll(".top, .hdr").forEach((header) => {
    if (header.querySelector(".knightscope-version")) return;
    const badge = document.createElement("span");
    badge.className = "knightscope-version";
    badge.textContent = label;
    badge.setAttribute("aria-label", "KnightScope version " + version);
    badge.style.cssText = "margin-left:auto;padding:4px 8px;border:1px solid rgba(140,150,175,.28);border-radius:8px;font:700 11px/1.2 system-ui;letter-spacing:.04em;color:var(--muted,currentColor);white-space:nowrap";
    header.appendChild(badge);
  });
})();