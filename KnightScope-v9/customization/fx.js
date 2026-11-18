// Particle engine: one canvas, sprite-cached, 30 fps, sleeps when nothing is alive.
(() => {
  const TAU = Math.PI * 2, rnd = (a, b) => a + Math.random() * (b - a);
  const MAX = 140;

  // kind -> look + physics. life in seconds, g = gravity (px/s^2, +down), drift = horizontal wobble
  const KINDS = {
    sparkles: { shape: "star", colors: ["#fff6c8", "#ffffff", "#cfe9ff"], size: [5, 11], life: [0.7, 1.3], vy: [-26, -6], g: -4, spin: 3, add: true, twinkle: true },
    embers:   { shape: "dot", colors: ["#ffb347", "#ff7a1a", "#ffd27a"], size: [2, 5], life: [1.0, 2.0], vy: [-60, -22], g: -8, drift: 14, add: true },
    snow:     { shape: "dot", colors: ["#ffffff", "#dff2ff"], size: [2, 4.5], life: [3, 5], vy: [14, 32], g: 0, drift: 18 },
    petals:   { shape: "petal", colors: ["#ffb7cf", "#ffd0e0", "#ff9bbd"], size: [6, 10], life: [3, 5], vy: [14, 30], g: 0, drift: 26, spin: 2.4 },
    bubbles:  { shape: "ring", colors: ["#bfefff", "#e6fbff"], size: [4, 10], life: [2, 3.6], vy: [-40, -16], g: 0, drift: 12 },
    stardust: { shape: "dot", colors: ["#c9d3ff", "#ffffff", "#9aa8ff"], size: [1.4, 3], life: [2, 4], vy: [-8, 8], g: 0, drift: 10, add: true, twinkle: true },
    pixels:   { shape: "square", colors: ["#b6ff2e", "#a64dff", "#ffffff"], size: [3, 6], life: [0.6, 1.2], vy: [-30, 10], g: 60, add: false }
  };
  const sprites = new Map();
  function sprite(kind, color) {
    const key = kind + color; let s = sprites.get(key); if (s) return s;
    const def = KINDS[kind], S = 32, c = document.createElement("canvas"); c.width = c.height = S;
    const x = c.getContext("2d"); x.translate(S / 2, S / 2); x.fillStyle = x.strokeStyle = color;
    if (def.shape === "dot") { const g = x.createRadialGradient(0, 0, 0, 0, 0, S / 2); g.addColorStop(0, color); g.addColorStop(0.45, color); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.beginPath(); x.arc(0, 0, S / 2, 0, TAU); x.fill(); }
    else if (def.shape === "star") { x.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 : 15; x.lineTo(Math.cos(i * Math.PI / 4 - Math.PI / 2) * r, Math.sin(i * Math.PI / 4 - Math.PI / 2) * r); } x.closePath(); x.fill(); }
    else if (def.shape === "petal") { x.beginPath(); x.ellipse(0, 0, 14, 8, 0, 0, TAU); x.fill(); }
    else if (def.shape === "ring") { x.lineWidth = 2.5; x.globalAlpha = 0.9; x.beginPath(); x.arc(0, 0, 12, 0, TAU); x.stroke(); x.globalAlpha = 0.35; x.beginPath(); x.arc(-4, -4, 3, 0, TAU); x.fill(); }
    else { x.fillRect(-12, -12, 24, 24); }
    sprites.set(key, c); return c;
  }
  const pick = (a) => a[(Math.random() * a.length) | 0];

  function create(canvas, options = {}) {
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, parts = [], raf = 0, last = 0, acc = 0, ambient = null, ambTimer = 0, alive = true, tint = options.tint || null;

    function resize(w, h) {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = w; H = h;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    }
    function spawn(kind, x, y, burst) {
      const def = KINDS[kind]; if (!def || parts.length >= MAX) return;
      const ang = rnd(0, TAU), sp = burst ? rnd(30, 120) : 0;
      parts.push({
        kind, x, y, vx: Math.cos(ang) * sp + (def.drift ? rnd(-def.drift, def.drift) * 0.4 : 0),
        vy: burst ? Math.sin(ang) * sp * 0.9 + (def.vy[0] + def.vy[1]) * 0.2 : rnd(def.vy[0], def.vy[1]),
        size: rnd(def.size[0], def.size[1]) * (burst ? 1.15 : 1), life: rnd(def.life[0], def.life[1]) * (burst ? 0.7 : 1), age: 0,
        rot: rnd(0, TAU), vr: def.spin ? rnd(-def.spin, def.spin) : 0, ph: rnd(0, TAU), color: (tint && Math.random() < 0.5) ? tint : pick(def.colors)
      });
    }
    function kick() { if (!raf && alive && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
    function loop(now) {
      raf = 0; if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); acc += dt; last = now;
      if (acc < 1 / 32) { raf = requestAnimationFrame(loop); return; }
      const step = acc; acc = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i], def = KINDS[p.kind]; p.age += step;
        if (p.age >= p.life || p.y < -20 || p.y > H + 20) { parts.splice(i, 1); continue; }
        const t = p.age / p.life;
        p.vy += (def.g || 0) * step; p.x += (p.vx + (def.drift ? Math.sin(p.age * 2 + p.ph) * def.drift : 0)) * step; p.y += p.vy * step; p.rot += p.vr * step;
        let a = t < 0.15 ? t / 0.15 : t > 0.65 ? (1 - t) / 0.35 : 1;
        if (def.twinkle) a *= 0.55 + 0.45 * Math.sin(p.age * 9 + p.ph);
        if (a <= 0.01) continue;
        ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = def.add ? "lighter" : "source-over";
        const s = sprite(p.kind, p.color), z = p.size * (p.kind === "bubbles" ? 1 + t * 0.4 : 1) * 2;
        if (p.rot) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(s, -z / 2, -z / 2, z, z); ctx.restore(); }
        else ctx.drawImage(s, p.x - z / 2, p.y - z / 2, z, z);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      if (parts.length || ambient) raf = requestAnimationFrame(loop);
    }
    function burst(kind, x, y, n = 14) { if (!KINDS[kind]) return; for (let i = 0; i < n; i++) spawn(kind, x + rnd(-6, 6), y + rnd(-6, 6), true); kick(); }
    // ambient: spawn rate scales with density (5..100); rising kinds spawn low, falling kinds spawn high
    function setAmbient(kind, density) {
      clearInterval(ambTimer); ambient = null;
      if (!KINDS[kind] || kind === "none" || !density) return;
      ambient = { kind, density };
      const rate = Math.max(120, 1100 - density * 9);
      ambTimer = setInterval(() => {
        if (document.hidden || !W) return;
        const def = KINDS[kind], falling = def.vy[0] > 0;
        spawn(kind, rnd(0, W), falling ? -6 : rnd(H * 0.55, H), false);
        if (density > 60) spawn(kind, rnd(0, W), falling ? -6 : rnd(H * 0.55, H), false);
        kick();
      }, rate);
      kick();
    }
    function setTint(c) { tint = c; }
    const onVis = () => { if (!document.hidden) kick(); };
    document.addEventListener("visibilitychange", onVis);
    function destroy() { alive = false; clearInterval(ambTimer); cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); parts = []; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    return { resize, burst, setAmbient, setTint, destroy, clear() { parts = []; ctx.clearRect(0, 0, canvas.width, canvas.height); } };
  }
  self.BMFx = { create, KINDS: Object.keys(KINDS) };
})();
