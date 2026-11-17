// Liquid Glass pointer light. The glass itself is pure CSS (liquid.css); this only nudges the rim
// light and sheen toward the pointer, throttled to one update per frame.
(() => {
  function track(el) {
    let raf = 0, ev = null;
    const apply = () => {
      raf = 0; if (!ev) return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      el.style.setProperty("--ang", (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90).toFixed(0) + "deg");
      el.style.setProperty("--lx", ev.clientX - r.left + "px"); el.style.setProperty("--ly", ev.clientY - r.top + "px");
    };
    const mv = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); };
    const lv = () => { ev = null; el.style.removeProperty("--ang"); el.style.removeProperty("--lx"); el.style.removeProperty("--ly"); };
    el.addEventListener("pointermove", mv, { passive: true }); el.addEventListener("pointerleave", lv);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointermove", mv); el.removeEventListener("pointerleave", lv); };
  }
  function auto(selector = "[data-lens]") {
    const hs = [...document.querySelectorAll(selector)].map(track);
    return { destroy() { hs.forEach((h) => h()); } };
  }
  const stub = { update() {}, destroy() {} };
  self.BMLiquid = { supported: true, attach: () => stub, auto, track };
})();
