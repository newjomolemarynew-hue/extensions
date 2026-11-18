(() => {
  const classify = (seconds) => (seconds < 180 ? "bullet" : seconds < 600 ? "blitz" : seconds <= 3600 ? "rapid" : "classical");

  function parseClock(text) {
    const value = String(text || "").trim().replace(/,/g, "");
    let match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/);
    if (match) return +(match[1] || 0) * 3600 + +match[2] * 60 + +match[3];
    match = value.match(/^(\d+(?:\.\d+)?)$/);
    return match ? +match[1] : null;
  }

  const fmtBase = (seconds) => (seconds < 60 ? `${seconds} sec` : seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);

  function create() {
    let clockMax = 0;
    let frozen = false;

    function reset() {
      clockMax = 0;
      frozen = false;
    }

    function detect(position) {
      const path = location.pathname;
      let cls = null, base = null;
      if (/\/play\/computer/.test(path)) cls = "bot";
      else if (/\/analysis/.test(path)) cls = "analysis";
      else if (/\/puzzles?(\/|$)/.test(path)) cls = "puzzle";
      else if (/\/game\/daily|\/daily\//.test(path)) cls = "daily";

      if (!cls) {
        const timeControl = document.documentElement.dataset.bmTC;
        if (timeControl) try {
          for (const [key, value] of Object.entries(JSON.parse(timeControl))) {
            const text = String(value).trim();
            const name = text.match(/\b(bullet|blitz|rapid|daily|classical)\b/i);
            if (name) cls = name[0].toLowerCase();
            const seconds = text.match(/^(\d+(?:\.\d+)?)(?:\s*\+\s*\d+(?:\.\d+)?)?(?:\s*(seconds?|secs?))?$/i);
            const minutes = text.match(/^(\d+(?:\.\d+)?)\s*(minutes?|mins?)$/i);
            if (/control|base|initial|starting|time/i.test(key) && !base) {
              if (seconds) base = +seconds[1];
              else if (minutes) base = +minutes[1] * 60;
            }
          }
        } catch (_) {}
      }

      if (!cls && !frozen) {
        if (position.full <= 2) {
          const clocks = new Set();
          for (const selector of [".clock-time-monospace", ".clock-component", '[data-cy="clock"]']) {
            document.querySelectorAll(selector).forEach((element) => clocks.add(element));
          }
          clocks.forEach((element) => {
            const seconds = parseClock(element.textContent);
            if (seconds && seconds > clockMax) clockMax = seconds;
          });
        } else if (clockMax > 0) frozen = true;
      }

      if (!cls) {
        base = base || clockMax || null;
        if (base) cls = classify(base);
      }

      const mode = { cls: cls || "unknown", base: base || (cls && clockMax) || null };
      if (!["bullet", "blitz", "rapid", "classical"].includes(mode.cls)) mode.base = null;
      return mode;
    }

    return { detect, reset };
  }

  self.BMGameMode = { create, fmtBase, parseClock, classify };
})();
