// Animated board backgrounds. One small canvas drawn procedurally (no images, no downloads), upscaled with
// smoothing, blended over the squares with a CSS blend mode and kept under the pieces. ~24 fps, sleeps when hidden.
(() => {
  const TAU = Math.PI * 2, R = 192;                       // internal resolution; the canvas is stretched to the board
  const rnd = (a, b) => a + Math.random() * (b - a);
  const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

  // each style: label, blend mode for the canvas, init(state) and draw(ctx, t, dt, state)
  const STYLES = {
    aurora: { label: "Aurora", blend: "screen", init() { return {}; }, draw(c, t) {
      c.clearRect(0, 0, R, R);
      c.globalCompositeOperation = "lighter";
      for (let k = 0; k < 4; k++) {
        const base = R * (0.22 + k * 0.2), amp = R * (0.09 + k * 0.02), hue = 135 + k * 38 + Math.sin(t * 0.0002 + k) * 24;
        const g = c.createLinearGradient(0, base - amp * 2, 0, base + R * 0.34);
        g.addColorStop(0, hsl(hue, 90, 60, 0)); g.addColorStop(0.35, hsl(hue, 92, 62, 0.5)); g.addColorStop(1, hsl(hue + 30, 90, 55, 0));
        c.fillStyle = g; c.beginPath(); c.moveTo(0, R);
        for (let x = 0; x <= R; x += 6) c.lineTo(x, base + Math.sin(x * 0.034 + t * 0.00055 * (1 + k * 0.3) + k * 2) * amp + Math.sin(x * 0.011 - t * 0.0003 + k) * amp * 0.8);
        c.lineTo(R, R); c.closePath(); c.fill();
      }
      c.globalCompositeOperation = "source-over";
    } },
    water: { label: "Water light", blend: "soft-light", init() { const s = 80, cv = document.createElement("canvas"); cv.width = cv.height = s; return { s, cv, cx: cv.getContext("2d"), img: null }; },
      draw(c, t, _d, st) {
        const { s, cx } = st; if (!st.img) st.img = cx.createImageData(s, s); const d = st.img.data, tt = t * 0.0009;
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          const u = x / s * 9, v = y / s * 9;
          let w = Math.sin(u * 1.3 + tt * 1.1 + Math.sin(v * 0.9 + tt)) + Math.sin(v * 1.7 - tt * 1.3 + Math.cos(u * 0.8 - tt * 0.7)) + Math.sin((u + v) * 1.1 + tt * 0.8);
          w = Math.pow(Math.max(0, 1 - Math.abs(w) * 0.55), 3);                       // bright caustic lines
          const i = (y * s + x) * 4, base = 118, val = base + w * 137;
          d[i] = val * 0.82; d[i + 1] = val * 0.97; d[i + 2] = Math.min(255, val * 1.1); d[i + 3] = 255;
        }
        cx.putImageData(st.img, 0, 0); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; c.drawImage(st.cv, 0, 0, R, R);
      } },
    lava: { label: "Lava glow", blend: "overlay", init() { return { b: Array.from({ length: 7 }, () => ({ x: rnd(0, R), y: rnd(0, R), r: rnd(34, 62), a: rnd(0, TAU), s: rnd(0.00015, 0.00045) })) }; },
      draw(c, t, _d, st) {
        c.fillStyle = "#2a0a02"; c.fillRect(0, 0, R, R); c.globalCompositeOperation = "lighter";
        for (const o of st.b) {
          const x = o.x + Math.sin(t * o.s * 2 + o.a) * 46, y = o.y + Math.cos(t * o.s * 1.6 + o.a * 2) * 46, g = c.createRadialGradient(x, y, 0, x, y, o.r);
          g.addColorStop(0, "rgba(255,230,120,.95)"); g.addColorStop(0.35, "rgba(255,120,20,.7)"); g.addColorStop(1, "rgba(180,20,0,0)");
          c.fillStyle = g; c.fillRect(x - o.r, y - o.r, o.r * 2, o.r * 2);
        }
        c.globalCompositeOperation = "source-over";
      } },
    stars: { label: "Starfield", blend: "screen", init() { return { s: Array.from({ length: 90 }, () => ({ x: rnd(0, R), y: rnd(0, R), z: rnd(0.3, 1), p: rnd(0, TAU), h: rnd(200, 60) })), shoot: null, next: 1800 }; },
      draw(c, t, dt, st) {
        c.clearRect(0, 0, R, R);
        for (const o of st.s) {
          o.x -= dt * 0.006 * o.z; if (o.x < -2) o.x = R + 2;
          const tw = 0.45 + 0.55 * Math.sin(t * 0.003 * o.z + o.p), r = 0.5 + o.z * 1.3;
          c.fillStyle = hsl(o.h, 70, 88, tw * (0.4 + o.z * 0.6)); c.beginPath(); c.arc(o.x, o.y, r, 0, TAU); c.fill();
          if (o.z > 0.85) { c.fillStyle = hsl(o.h, 70, 92, tw * 0.25); c.fillRect(o.x - 4, o.y - 0.3, 8, 0.6); c.fillRect(o.x - 0.3, o.y - 4, 0.6, 8); }
        }
        st.next -= dt; if (st.next < 0 && !st.shoot) { st.shoot = { x: rnd(R * 0.4, R), y: rnd(0, R * 0.4), life: 0 }; st.next = rnd(2500, 6500); }
        if (st.shoot) { const s = st.shoot; s.life += dt / 600; const x = s.x - s.life * 90, y = s.y + s.life * 55, g = c.createLinearGradient(x, y, x + 34, y - 20);
          g.addColorStop(0, `rgba(255,255,255,${1 - s.life})`); g.addColorStop(1, "rgba(255,255,255,0)"); c.strokeStyle = g; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 34, y - 20); c.stroke(); if (s.life >= 1) st.shoot = null; }
      } },
    rain: { label: "Rain", blend: "screen", init() { return { d: Array.from({ length: 70 }, () => ({ x: rnd(0, R), y: rnd(0, R), v: rnd(0.18, 0.36), l: rnd(7, 15) })), rip: [] }; },
      draw(c, t, dt, st) {
        c.clearRect(0, 0, R, R); c.lineCap = "round";
        for (const o of st.d) {
          o.y += o.v * dt; o.x -= o.v * dt * 0.12;
          if (o.y > R) { if (Math.random() < 0.35 && st.rip.length < 14) st.rip.push({ x: o.x, y: rnd(R * 0.1, R), age: 0 }); o.y = -10; o.x = rnd(0, R + 20); }
          c.strokeStyle = `rgba(200,225,255,${0.12 + o.v * 0.7})`; c.lineWidth = 0.9; c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x + o.l * 0.12, o.y - o.l); c.stroke();
        }
        for (let i = st.rip.length - 1; i >= 0; i--) { const r = st.rip[i]; r.age += dt / 900; if (r.age >= 1) { st.rip.splice(i, 1); continue; }
          c.strokeStyle = `rgba(210,235,255,${0.5 * (1 - r.age)})`; c.lineWidth = 0.8; c.beginPath(); c.ellipse(r.x, r.y, 3 + r.age * 15, 1.2 + r.age * 5, 0, 0, TAU); c.stroke(); }
      } },
    neon: { label: "Neon grid", blend: "screen", init() { return {}; }, draw(c, t) {
      c.clearRect(0, 0, R, R); const n = 8, s = R / n, ph = t * 0.0009;
      for (let i = 0; i <= n; i++) {
        const p = i * s, hue = 180 + 120 * (0.5 + 0.5 * Math.sin(ph + i * 0.7));
        c.strokeStyle = hsl(hue, 100, 62, 0.35 + 0.25 * Math.sin(ph * 1.7 + i)); c.lineWidth = 1.6; c.shadowColor = hsl(hue, 100, 60, 0.9); c.shadowBlur = 8;
        c.beginPath(); c.moveTo(p, 0); c.lineTo(p, R); c.moveTo(0, p); c.lineTo(R, p); c.stroke();
      }
      c.shadowBlur = 0; const sweep = ((t * 0.00018) % 1) * (R + 60) - 30, g = c.createLinearGradient(sweep - 30, 0, sweep + 30, 0);
      g.addColorStop(0, "rgba(255,0,200,0)"); g.addColorStop(0.5, "rgba(120,220,255,.28)"); g.addColorStop(1, "rgba(255,0,200,0)"); c.fillStyle = g; c.fillRect(0, 0, R, R);
    } },
    fireflies: { label: "Fireflies", blend: "screen", init() { return { f: Array.from({ length: 26 }, () => ({ x: rnd(0, R), y: rnd(0, R), a: rnd(0, TAU), sp: rnd(0.012, 0.03), p: rnd(0, TAU), r: rnd(2, 4.2) })) }; },
      draw(c, t, dt, st) {
        c.clearRect(0, 0, R, R); c.globalCompositeOperation = "lighter";
        for (const o of st.f) {
          o.a += Math.sin(t * 0.0006 + o.p) * 0.03; o.x += Math.cos(o.a) * o.sp * dt; o.y += Math.sin(o.a) * o.sp * dt * 0.8;
          if (o.x < -6) o.x = R + 6; if (o.x > R + 6) o.x = -6; if (o.y < -6) o.y = R + 6; if (o.y > R + 6) o.y = -6;
          const gl = 0.2 + 0.8 * Math.max(0, Math.sin(t * 0.002 + o.p)), g = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 5);
          g.addColorStop(0, `rgba(235,255,150,${0.9 * gl})`); g.addColorStop(0.25, `rgba(190,255,90,${0.45 * gl})`); g.addColorStop(1, "rgba(120,255,60,0)");
          c.fillStyle = g; c.fillRect(o.x - o.r * 5, o.y - o.r * 5, o.r * 10, o.r * 10);
        }
        c.globalCompositeOperation = "source-over";
      } },
    holo: { label: "Holo sheen", blend: "soft-light", init() { return {}; }, draw(c, t) {
      c.clearRect(0, 0, R, R); const pos = ((t * 0.00012) % 1.6) - 0.3, w = 0.5;
      const g = c.createLinearGradient(0, 0, R, R);
      for (let i = 0; i <= 8; i++) { const k = i / 8, d = (k - pos) / w; g.addColorStop(k, d > -1 && d < 1 ? hsl(k * 360 + t * 0.03, 100, 62, 0.95 * (1 - d * d)) : "rgba(255,255,255,0)"); }
      c.fillStyle = "rgba(128,128,160,.55)"; c.fillRect(0, 0, R, R); c.fillStyle = g; c.fillRect(0, 0, R, R);
    } }
  };

  function create(canvas) {
    const ctx = canvas.getContext("2d"); canvas.width = canvas.height = R;
    let style = "none", power = 0.6, state = null, raf = 0, last = 0, acc = 0, alive = true;
    const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
    function frame(now) {
      raf = 0; if (!alive || style === "none") return;
      if (document.hidden) return;
      const dt = Math.min(100, now - last); acc += dt; last = now;
      if (acc >= 41) { const d = acc; acc = 0; try { STYLES[style].draw(ctx, now, d, state); } catch (_) { stop(); return; } }
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && alive && style !== "none" && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    function stop() { cancelAnimationFrame(raf); raf = 0; }
    function set(name, strength, still) {
      const def = STYLES[name]; stop();
      if (!def || still || reduce()) { style = "none"; ctx.clearRect(0, 0, R, R); canvas.style.display = "none"; return; }
      if (style !== name) { style = name; state = def.init(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "source-over"; ctx.shadowBlur = 0; ctx.clearRect(0, 0, R, R); }
      power = Math.max(0.1, Math.min(1, (strength == null ? 60 : strength) / 100));
      canvas.style.display = ""; canvas.style.mixBlendMode = def.blend; canvas.style.opacity = String(0.25 + power * 0.75); canvas.style.imageRendering = "auto";
      kick();
    }
    const vis = () => { if (!document.hidden) kick(); }; document.addEventListener("visibilitychange", vis);
    return { set, kick, destroy() { alive = false; stop(); document.removeEventListener("visibilitychange", vis); } };
  }
  self.BMBoardFx = { create, STYLES: Object.keys(STYLES), LABELS: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label])) };
})();
