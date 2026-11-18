// Piece Forge: pieces are drawn locally as SVG and recoloured with plain CSS colours.
// Nothing is downloaded, so every non-animated look is instant and works offline.
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const HEX = /^#[0-9a-f]{6}$/i;
  const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (c) => "#" + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
  const lighten = (h, t) => mix(h, "#ffffff", t);
  const darken = (h, t) => mix(h, "#000000", t);
  const safeHex = (v, fallback) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);

  // ---------- shapes (100 x 100 box) ----------
  const PLINTH = '<rect x="22" y="76" width="56" height="8" rx="4"/><rect x="16" y="83" width="68" height="9" rx="4.5"/>';
  // Each piece: body shapes (filled + outlined) and detail strokes (outline colour only).
  const FAMILIES = {
    classic: {
      p: { body: ['<path d="M42 40C42 56 33 62 31 77H69C67 62 58 56 58 40Z"/>', PLINTH, '<rect x="35" y="38" width="30" height="7" rx="3.5"/>', '<circle cx="50" cy="28" r="12.5"/>'], detail: [] },
      r: { body: ['<path d="M33 40H67L71 77H29Z"/>', PLINTH, '<rect x="30" y="36" width="40" height="8" rx="2.5"/>', '<path d="M27 18H39V26H45V18H55V26H61V18H73V38H27Z"/>'], detail: [] },
      n: { body: ['<path d="M25 77C25 66 29 58 38 52L27 52C23 52 20 48 23 43L34 30 36 16 44 24C46 22 50 20 54 19 70 22 77 40 75 55 74 65 73 71 73 77Z"/>', PLINTH],
        detail: ['<circle cx="37" cy="35" r="2.2" fill="currentColor"/>', '<circle cx="26.5" cy="45" r="1.3" fill="currentColor"/>', '<path d="M52 25C62 29 68 40 67 56"/>'] },
      b: { body: ['<path d="M42 50C42 62 34 66 32 77H68C66 66 58 62 58 50Z"/>', PLINTH, '<rect x="36" y="46" width="28" height="7" rx="3.5"/>', '<path d="M50 17C40 24 36 32 36 38 36 46 42 48 50 48 58 48 64 46 64 38 64 32 60 24 50 17Z"/>', '<circle cx="50" cy="13" r="5"/>'],
        detail: ['<path d="M47 27L56 37"/>'] },
      q: { body: ['<path d="M36 54C36 64 33 69 31 77H69C67 69 64 64 64 54Z"/>', PLINTH, '<rect x="30" y="50" width="40" height="7" rx="3.5"/>', '<path d="M27 52 20 26 34 41 36 17 45 40 50 13 55 40 64 17 66 41 80 26 73 52Z"/>', '<circle cx="20" cy="23" r="4"/>', '<circle cx="36" cy="14" r="4"/>', '<circle cx="50" cy="10" r="4"/>', '<circle cx="64" cy="14" r="4"/>', '<circle cx="80" cy="23" r="4"/>'], detail: [] },
      k: { body: ['<path d="M36 57C36 65 33 70 31 77H69C67 70 64 65 64 57Z"/>', PLINTH, '<rect x="29" y="52" width="42" height="7" rx="3.5"/>', '<path d="M28 53C25 40 31 30 41 28H59C69 30 75 40 72 53Z"/>', '<path d="M46.5 4H53.5V10H60V17H53.5V27H46.5V17H40V10H46.5Z"/>'], detail: [] }
    },
    modern: {
      p: { body: ['<path d="M36 78C36 62 42 54 50 50 58 54 64 62 64 78Z"/>', '<rect x="27" y="76" width="46" height="12" rx="6"/>', '<circle cx="50" cy="33" r="14"/>'], detail: [] },
      r: { body: ['<rect x="30" y="38" width="40" height="42" rx="5"/>', '<rect x="27" y="76" width="46" height="12" rx="6"/>', '<path d="M26 26a6 6 0 0 1 6-6h5a3 3 0 0 1 3 3v5h20v-5a3 3 0 0 1 3-3h5a6 6 0 0 1 6 6v14H26Z"/>'], detail: [] },
      n: { body: ['<path d="M30 80C30 66 33 56 44 48L32 48C26 48 22 42 25 37L36 22 38 12 47 19C53 17 58 18 62 21 74 29 76 48 72 80Z"/>', '<rect x="25" y="76" width="50" height="12" rx="6"/>'],
        detail: ['<circle cx="40" cy="31" r="2.6" fill="currentColor"/>'] },
      b: { body: ['<path d="M37 80C37 66 41 58 50 54 59 58 63 66 63 80Z"/>', '<rect x="27" y="76" width="46" height="12" rx="6"/>', '<ellipse cx="50" cy="37" rx="14" ry="19"/>', '<circle cx="50" cy="12" r="5.5"/>'], detail: ['<path d="M45 30L56 42"/>'] },
      q: { body: ['<path d="M36 80C36 68 40 60 50 54 60 60 64 68 64 80Z"/>', '<rect x="27" y="76" width="46" height="12" rx="6"/>', '<path d="M26 56 21 28 36 42 50 18 64 42 79 28 74 56Z"/>', '<circle cx="21" cy="25" r="4.5"/>', '<circle cx="50" cy="14" r="4.5"/>', '<circle cx="79" cy="25" r="4.5"/>'], detail: [] },
      k: { body: ['<path d="M36 80C36 68 40 60 50 56 60 60 64 68 64 80Z"/>', '<rect x="27" y="76" width="46" height="12" rx="6"/>', '<path d="M28 58C24 44 30 33 42 31H58C70 33 76 44 72 58Z"/>', '<path d="M46 5H54V11H60V18H54V28H46V18H40V11H46Z"/>'], detail: [] }
    }
  };

  // ---------- defaults, presets ----------
  const DEFAULT_PIECE = Object.freeze({
    family: "classic", style: "gradient",
    white: Object.freeze({ fill: "#f6f1e4", stroke: "#3a342a" }),
    black: Object.freeze({ fill: "#3b3f4d", stroke: "#0b0c10" }),
    outline: 2.6, gloss: 55, shadow: 45, glow: 0, parts: Object.freeze([]), draw: Object.freeze({}), drawClip: false
  });
  const FX_DEFAULT = Object.freeze({ particles: "none", density: 45, burst: true });

  const P = (id, name, group, piece, fx) => ({ id, name, group, piece: { ...DEFAULT_PIECE, ...piece }, fx: { ...FX_DEFAULT, ...(fx || {}) } });
  const PRESETS = [
    P("ivory", "Ivory & Ebony", "Classic", {}, {}),
    P("tournament", "Tournament", "Classic", { family: "modern", style: "solid", white: { fill: "#f4f4f2", stroke: "#2b2b2b" }, black: { fill: "#2f3136", stroke: "#0a0a0a" }, gloss: 0, shadow: 30 }),
    P("marble", "Marble", "Classic", { style: "gradient", white: { fill: "#eceff3", stroke: "#566070" }, black: { fill: "#4a5160", stroke: "#12151c" }, gloss: 80, shadow: 55 }),
    P("walnut", "Walnut", "Classic", { white: { fill: "#e9cfa1", stroke: "#4b2f17" }, black: { fill: "#6b4326", stroke: "#2a1608" }, gloss: 40 }),
    P("glass", "Crystal Glass", "Glass", { family: "modern", style: "glass", white: { fill: "#e8f4ff", stroke: "#ffffff" }, black: { fill: "#6a8cff", stroke: "#cfe0ff" }, outline: 2.2, gloss: 70, shadow: 40, glow: 20 }, {}),
    P("frost", "Frost", "Glass", { family: "modern", style: "glass", white: { fill: "#e3f6ff", stroke: "#ffffff" }, black: { fill: "#1b3b66", stroke: "#8fd0ff" }, glow: 35 }, { particles: "snow", density: 40 }),
    P("neon", "Neon Duel", "Neon", { family: "modern", style: "neon", white: { fill: "#00f0ff", stroke: "#00f0ff" }, black: { fill: "#ff2bd6", stroke: "#ff2bd6" }, outline: 3, gloss: 0, shadow: 0, glow: 80 }, { particles: "sparkles", density: 35 }),
    P("toxic", "Toxic", "Neon", { family: "modern", style: "neon", white: { fill: "#b6ff2e", stroke: "#b6ff2e" }, black: { fill: "#a64dff", stroke: "#a64dff" }, outline: 3, gloss: 0, shadow: 0, glow: 70 }, { particles: "pixels", density: 30 }),
    P("gold", "Gold & Onyx", "Metals", { style: "gradient", white: { fill: "#f4d27a", stroke: "#6b4a07" }, black: { fill: "#23232b", stroke: "#d9b45a" }, gloss: 90, shadow: 60, glow: 10 }, { particles: "sparkles", density: 30 }),
    P("silver", "Silver & Steel", "Metals", { family: "modern", style: "gradient", white: { fill: "#e7eaf0", stroke: "#5c6577" }, black: { fill: "#505a6e", stroke: "#1a202c" }, gloss: 90, shadow: 55 }),
    P("emerald", "Emerald & Pearl", "Gems", { style: "gradient", white: { fill: "#f6efe6", stroke: "#4c5c47" }, black: { fill: "#127a55", stroke: "#06301f" }, gloss: 85, shadow: 55 }, {}),
    P("ruby", "Ruby & Sapphire", "Gems", { style: "gradient", white: { fill: "#e24a5e", stroke: "#4d0c18" }, black: { fill: "#2f5fd0", stroke: "#0a1c4d" }, gloss: 85 }),
    P("sakura", "Sakura", "Nature", { family: "modern", style: "gradient", white: { fill: "#ffe3ec", stroke: "#a85a73" }, black: { fill: "#5a3350", stroke: "#26101f" }, gloss: 55 }, { particles: "petals", density: 45 }),
    P("ember", "Ember", "Nature", { style: "gradient", white: { fill: "#ffd6a0", stroke: "#7a3300" }, black: { fill: "#3a1a14", stroke: "#ff7a1a" }, glow: 35, gloss: 60 }, { particles: "embers", density: 50 }),
    P("ocean", "Deep Ocean", "Nature", { family: "modern", style: "gradient", white: { fill: "#d9f6f1", stroke: "#2d7f86" }, black: { fill: "#0f4a73", stroke: "#06223a" }, gloss: 65 }, { particles: "bubbles", density: 40 }),
    P("midnight", "Midnight", "Night", { family: "modern", style: "glass", white: { fill: "#c9d3ff", stroke: "#eef1ff" }, black: { fill: "#161a3a", stroke: "#7a88ff" }, glow: 45 }, { particles: "stardust", density: 55 }),
    P("candy", "Candy", "Fun", { family: "modern", style: "solid", white: { fill: "#ffe0f0", stroke: "#e0679d" }, black: { fill: "#6fe3c0", stroke: "#1f8f6f" }, outline: 3.2, gloss: 0, shadow: 25 }, { anim: "sway" }),
    P("frostbound", "Frostbound", "Parts", { family: "modern", style: "glass", white: { fill: "#e8f6ff", stroke: "#ffffff" }, black: { fill: "#2a4f8f", stroke: "#a9d8ff" }, glow: 25, parts: [{ k: "ice", on: "all" }, { k: "frost", on: "all" }] }, { particles: "snow", density: 35 }),
    P("inferno", "Inferno", "Parts", { style: "gradient", white: { fill: "#ffd9a8", stroke: "#7a2f00" }, black: { fill: "#2b1210", stroke: "#ff7a1a" }, glow: 30, parts: [{ k: "ember", on: "all" }, { k: "cracks", on: "all", side: "b" }] }, { particles: "embers", density: 45 }),
    P("angelic", "Angelic", "Parts", { family: "modern", style: "gradient", white: { fill: "#fffaf0", stroke: "#b8a26a" }, black: { fill: "#5b4a8a", stroke: "#e9d9ff" }, gloss: 80, parts: [{ k: "wings", on: "all" }, { k: "halo", on: "all" }] }, { particles: "sparkles", density: 30 }),
    P("demon", "Demon Court", "Parts", { style: "gradient", white: { fill: "#e9d3c2", stroke: "#5b1d12" }, black: { fill: "#3a0f14", stroke: "#ff4a3c" }, glow: 20, parts: [{ k: "horns", on: "all" }, { k: "spikes", on: "all", side: "b" }, { k: "cracks", on: "all", side: "b" }] }),
    P("overgrown", "Overgrown", "Parts", { style: "gradient", white: { fill: "#e8e4c9", stroke: "#4a5b2e" }, black: { fill: "#2f4a35", stroke: "#0f2314" }, parts: [{ k: "thorns", on: "all" }] }, { particles: "petals", density: 25 }),
    P("royal", "Royal Crystal", "Parts", { family: "modern", style: "glass", white: { fill: "#f3e8ff", stroke: "#ffffff" }, black: { fill: "#4b2a8a", stroke: "#d0b6ff" }, glow: 30, parts: [{ k: "crystals", on: "all" }, { k: "crown", on: "k" }, { k: "stars", on: "q" }] }),
    P("ink", "Mono Ink", "Minimal", { family: "modern", style: "outline", white: { fill: "#ffffff", stroke: "#ffffff" }, black: { fill: "#000000", stroke: "#000000" }, outline: 3.4, gloss: 0, shadow: 20 })
  ];
  const presetById = (id) => PRESETS.find((p) => p.id === id) || null;


  // ---------- parts: extra elements added to the pieces (ice shards, flames, wings ...) ----------
  // Every part is drawn from the piece's own anchors, so it sits right on a pawn as well as on a king.
  const ANCH = { p: { top: 16, sh: 46, hw: 15 }, n: { top: 14, sh: 44, hw: 22 }, b: { top: 8, sh: 42, hw: 14 }, r: { top: 18, sh: 46, hw: 20 }, q: { top: 8, sh: 48, hw: 24 }, k: { top: 5, sh: 44, hw: 20 } };
  const mir = (svg) => `<g transform="translate(100 0) scale(-1 1)">${svg}</g>`;
  const both = (svg) => svg + mir(svg);
  const shard = (x, y, w, h, ang, fill, stroke, sw = 1) =>
    `<g transform="rotate(${ang} ${x} ${y})"><path d="M${x - w / 2} ${y}L${x - w * 0.12} ${y - h}L${x + w * 0.5} ${y - h * 0.18}L${x + w / 2} ${y}Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="M${x - w * 0.12} ${y - h}L${x + w * 0.02} ${y - 1}" stroke="#fff" stroke-opacity=".7" stroke-width="${Math.max(.6, sw * .6)}" fill="none"/></g>`;
  const flame = (x, y, h, c1, c2) =>
    `<path d="M${x} ${y - h}C${x + h * 0.3} ${y - h * 0.62} ${x + h * 0.34} ${y - h * 0.28} ${x} ${y}C${x - h * 0.36} ${y - h * 0.26} ${x - h * 0.2} ${y - h * 0.62} ${x} ${y - h}Z" fill="${c1}"/>` +
    `<path d="M${x} ${y - h * 0.58}C${x + h * 0.14} ${y - h * 0.38} ${x + h * 0.15} ${y - h * 0.16} ${x} ${y}C${x - h * 0.16} ${y - h * 0.14} ${x - h * 0.1} ${y - h * 0.4} ${x} ${y - h * 0.58}Z" fill="${c2}"/>`;
  const star4 = (x, y, r, fill) => `<path d="M${x} ${y - r}Q${x + r * .16} ${y - r * .16} ${x + r} ${y}Q${x + r * .16} ${y + r * .16} ${x} ${y + r}Q${x - r * .16} ${y + r * .16} ${x - r} ${y}Q${x - r * .16} ${y - r * .16} ${x} ${y - r}Z" fill="${fill}"/>`;
  const feather = (x, y, len, ang, fill, stroke) =>
    `<path transform="translate(${x} ${y}) rotate(${ang})" d="M0 0C-5.5 ${-len * 0.3} -5 ${-len * 0.8} 0 ${-len}C5 ${-len * 0.8} 5.5 ${-len * 0.3} 0 0Z" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`;

  // layer: "back" is drawn behind the piece, "front" on top. at: scaling anchor. c1/c2 = default colours.
  const PARTS = {
    ice:     { name: "Ice shards", layer: "back", c1: "#bfe9ff", c2: "#5fb4ee", draw: (a, c) => {
      const x0 = 50 - a.hw + 3, y0 = a.sh + 18;
      return both(shard(x0, y0, 9, 24, -34, c.c1, c.c2) + shard(x0 + 2, y0 - 6, 7, 30, -12, c.c1, c.c2) + shard(x0 - 3, y0 + 4, 7, 20, -58, c.c1, c.c2) + shard(x0 + 5, y0 + 6, 6, 16, -80, c.c1, c.c2));
    }, at: (a) => [50, a.sh + 10] },
    frost:   { name: "Frost cap", layer: "front", c1: "#eaf8ff", c2: "#8fd0ff", draw: (a, c) => {
      const t = Math.max(a.top, 9);
      return `<path d="M37 ${t + 11}C37 ${t + 1} 43 ${t - 3} 50 ${t - 3}C57 ${t - 3} 63 ${t + 1} 63 ${t + 11}L60 ${t + 8}L57 ${t + 15}L53.5 ${t + 8}L50 ${t + 14}L46.5 ${t + 8}L43 ${t + 15}L40 ${t + 8}Z" fill="${c.c1}" stroke="${c.c2}" stroke-width="1.4" stroke-linejoin="round"/>` +
        shard(46, t - 1, 4, 9, -14, c.c1, c.c2, .8) + shard(55, t - 1, 4, 11, 18, c.c1, c.c2, .8);
    }, at: (a) => [50, Math.max(a.top, 9) + 6] },
    ember:   { name: "Flames", layer: "back", c1: "#ff7a1a", c2: "#ffd35a", draw: (a, c) => {
      const y = 82; return both(flame(26, y, 26, c.c1, c.c2) + flame(35, y + 2, 20, c.c1, c.c2) + flame(18, y - 4, 16, c.c1, c.c2) + flame(50 - a.hw + 4, a.sh + 6, 22, c.c1, c.c2));
    }, at: () => [50, 80] },
    halo:    { name: "Halo", layer: "front", c1: "#ffd86b", c2: "#fff3b8", draw: (a, c) => {
      const y = Math.max(5.5, a.top - 5);
      return `<ellipse cx="50" cy="${y}" rx="15" ry="4.4" fill="none" stroke="${c.c1}" stroke-opacity=".35" stroke-width="6"/><ellipse cx="50" cy="${y}" rx="15" ry="4.4" fill="none" stroke="${c.c1}" stroke-width="2.6"/><ellipse cx="50" cy="${y}" rx="15" ry="4.4" fill="none" stroke="${c.c2}" stroke-width="1" stroke-opacity=".9"/>`;
    }, at: (a) => [50, Math.max(5.5, a.top - 5)] },
    wings:   { name: "Wings", layer: "back", c1: "#f7f9ff", c2: "#9aa8c8", draw: (a, c) => {
      const x = 50 - Math.min(a.hw, 18) * 0.5, y = a.sh + 4;
      return both([[-84, 24], [-66, 29], [-48, 29], [-30, 25], [-12, 18]].map(([ang, len]) => feather(x, y, len, ang, c.c1, c.c2)).join(""));
    }, at: (a) => [50, a.sh] },
    horns:   { name: "Horns", layer: "front", c1: "#3a1f1f", c2: "#ff5a3c", draw: (a, c) => {
      const y = Math.max(a.top + 9, 22), x = 41;
      return both(`<path d="M${x} ${y}C${x - 6} ${y - 1} ${x - 12} ${y - 7} ${x - 9} ${y - 17}C${x - 6} ${y - 9} ${x - 2} ${y - 7} ${x + 4} ${y - 4}Z" fill="${c.c1}" stroke="${c.c2}" stroke-width="1.3" stroke-linejoin="round"/>`);
    }, at: (a) => [50, Math.max(a.top + 9, 22) - 6] },
    crown:   { name: "Crown", layer: "front", c1: "#ffd24d", c2: "#9c6b00", draw: (a, c) => {
      const y = Math.max(a.top + 1, 14);
      return `<path d="M40.5 ${y + 3}L39.5 ${y - 8}L45.3 ${y - 3}L50 ${y - 11}L54.7 ${y - 3}L60.5 ${y - 8}L59.5 ${y + 3}Z" fill="${c.c1}" stroke="${c.c2}" stroke-width="1.4" stroke-linejoin="round"/><circle cx="50" cy="${y - 1}" r="1.9" fill="#ff4f6a" stroke="${c.c2}" stroke-width=".6"/>`;
    }, at: (a) => [50, Math.max(a.top + 1, 14) - 4] },
    crystals:{ name: "Crystals", layer: "front", c1: "#b98cff", c2: "#5b2fb0", draw: (a, c) => {
      const x0 = 50 - a.hw + 1, y0 = a.sh + 24;
      return both(shard(x0, y0, 10, 28, -28, c.c1, c.c2, 1.2) + shard(x0 + 5, y0 + 4, 8, 20, 8, c.c1, c.c2, 1.2) + shard(x0 - 2, y0 + 8, 7, 15, -64, c.c1, c.c2, 1.2));
    }, at: (a) => [50, a.sh + 16] },
    thorns:  { name: "Thorn vines", layer: "front", c1: "#43a852", c2: "#1d5e2b", draw: (a, c) => {
      const L = 50 - a.hw * 0.95, W = a.hw * 1.9, y = a.sh + 17; let d = "", th = "", lf = "";
      for (let i = 0; i <= 8; i++) { const x = L + (W * i) / 8, yy = y + (i % 2 ? -3.5 : 3.5); d += (i ? "L" : "M") + x.toFixed(1) + " " + yy.toFixed(1); if (i && i < 8) th += `<path d="M${(x - 1.6).toFixed(1)} ${yy.toFixed(1)}L${x.toFixed(1)} ${(yy + (i % 2 ? -5 : 5)).toFixed(1)}L${(x + 1.6).toFixed(1)} ${yy.toFixed(1)}Z" fill="${c.c2}"/>`; if (i === 2 || i === 6) lf += `<ellipse cx="${x.toFixed(1)}" cy="${(yy - 4).toFixed(1)}" rx="3.6" ry="1.8" transform="rotate(-35 ${x.toFixed(1)} ${(yy - 4).toFixed(1)})" fill="${c.c1}" stroke="${c.c2}" stroke-width=".8"/>`; }
      return `<path d="${d}" fill="none" stroke="${c.c2}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c.c1}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${th}${lf}`;
    }, at: (a) => [50, a.sh + 17] },
    cracks:  { name: "Glowing cracks", layer: "front", c1: "#ffb347", c2: "#ff4a1a", draw: (a, c) => {
      const t = a.top + 12, d = `M52 ${t}l-4.5 8 5.5 6.5-6.5 9.5 4.5 8-3 8`, b = `M48.5 ${t + 14.5}l-8 3.5M53 ${t + 21}l7.5 4`;
      return `<path d="${d}${b}" fill="none" stroke="${c.c2}" stroke-opacity=".45" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}${b}" fill="none" stroke="${c.c1}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
    }, at: (a) => [50, a.top + 28] },
    spikes:  { name: "Shoulder spikes", layer: "front", c1: "#9aa3b5", c2: "#2b3040", draw: (a, c) => {
      let out = ""; const n = 5, L = 50 - a.hw * 0.85, W = a.hw * 1.7;
      for (let i = 0; i < n; i++) { const x = L + (W * i) / (n - 1), h = i === 2 ? 12 : 8.5; out += `<path d="M${(x - 3.2).toFixed(1)} ${a.sh + 2}L${x.toFixed(1)} ${a.sh + 2 - h}L${(x + 3.2).toFixed(1)} ${a.sh + 2}Z" fill="${c.c1}" stroke="${c.c2}" stroke-width="1.2" stroke-linejoin="round"/>`; }
      return out;
    }, at: (a) => [50, a.sh] },
    stars:   { name: "Sparkles", layer: "back", c1: "#fff3a8", c2: "#ffffff", draw: (a, c) =>
      star4(17, 26, 7, c.c1) + star4(84, 20, 5.5, c.c2) + star4(83, 55, 7.5, c.c1) + star4(15, 58, 5, c.c2) + star4(50, Math.max(5, a.top - 2), 4, c.c1) + star4(70, 12, 3.2, c.c1), at: () => [50, 40] }
  };
  const PART_IDS = Object.keys(PARTS), PART_TARGETS = ["all", "p", "n", "b", "r", "q", "k"], MAX_PARTS = 10;
  function normalizeParts(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_PARTS).filter((x) => x && PARTS[x.k]).map((x) => ({
      k: x.k, on: PART_TARGETS.includes(x.on) ? x.on : "all", side: ["both", "w", "b"].includes(x.side) ? x.side : "both",
      color: typeof x.color === "string" && HEX.test(x.color) ? x.color.toLowerCase() : null, size: clamp(Number.isFinite(+x.size) ? +x.size : 100, 50, 150)
    }));
  }
  function partsSvg(list, type, white, style) {
    const a = ANCH[type], back = [], front = [];
    for (const p of list) {
      if ((p.on !== "all" && p.on !== type) || (p.side === "w" && !white) || (p.side === "b" && white)) continue;
      const def = PARTS[p.k], c1 = p.color || def.c1, c = { c1, c2: p.color ? darken(p.color, 0.4) : def.c2 };
      const [ax, ay] = def.at(a), sc = p.size / 100;
      const g = `<g transform="translate(${ax} ${ay}) scale(${sc}) translate(${-ax} ${-ay})">${def.draw(a, c)}</g>`;
      (def.layer === "back" ? back : front).push(g);
    }
    return { back: back.join(""), front: front.join("") };
  }

  // ---------- drawing on pieces: freehand strokes saved per piece type ----------
  const DRAW_TYPES = ["p", "n", "b", "r", "q", "k"], MAX_STROKES = 40, PATH_OK = /^[ML0-9 .\-]+$/;
  function normalizeDraw(input) {
    const out = {}; if (!input || typeof input !== "object") return out;
    for (const t of DRAW_TYPES) {
      const list = Array.isArray(input[t]) ? input[t] : []; const keep = [];
      for (const s of list.slice(0, MAX_STROKES)) {
        if (s && typeof s.d === "string" && s.d.length < 2400 && PATH_OK.test(s.d) && HEX.test(s.c || "")) keep.push({ c: s.c.toLowerCase(), w: clamp(Number.isFinite(+s.w) ? +s.w : 3, 0.6, 9), d: s.d, s: ["both", "w", "b"].includes(s.s) ? s.s : "both" });
      }
      if (keep.length) out[t] = keep;
    }
    return out;
  }
  const drawSvg = (list, white) => (list || []).filter((s) => s.s === "both" || (s.s === "w") === white).map((s) => `<path d="${s.d}" fill="none" stroke="${s.c}" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");

  // ---------- normalising user input ----------
  function normalizePiece(input) {
    const s = input && typeof input === "object" ? input : {};
    const side = (v, d) => ({ fill: safeHex(v && v.fill, d.fill), stroke: safeHex(v && v.stroke, d.stroke) });
    return {
      family: FAMILIES[s.family] ? s.family : DEFAULT_PIECE.family,
      style: ["solid", "gradient", "glass", "outline", "neon"].includes(s.style) ? s.style : DEFAULT_PIECE.style,
      white: side(s.white, DEFAULT_PIECE.white), black: side(s.black, DEFAULT_PIECE.black),
      outline: clamp(Number.isFinite(+s.outline) ? +s.outline : DEFAULT_PIECE.outline, 0, 6),
      gloss: clamp(Number.isFinite(+s.gloss) ? +s.gloss : DEFAULT_PIECE.gloss, 0, 100),
      shadow: clamp(Number.isFinite(+s.shadow) ? +s.shadow : DEFAULT_PIECE.shadow, 0, 100),
      glow: clamp(Number.isFinite(+s.glow) ? +s.glow : DEFAULT_PIECE.glow, 0, 100),
      parts: normalizeParts(s.parts), draw: normalizeDraw(s.draw), drawClip: s.drawClip === true
    };
  }
  const PARTICLES = ["none", "sparkles", "embers", "snow", "petals", "bubbles", "stardust", "pixels"];
  function normalizeFx(input) {
    const s = input && typeof input === "object" ? input : {};
    return {
      particles: PARTICLES.includes(s.particles) ? s.particles : "none",
      density: clamp(Number.isFinite(+s.density) ? +s.density : FX_DEFAULT.density, 5, 100),
      burst: s.burst !== false
    };
  }

  // ---------- rendering ----------
  function svgFor(code, rawCfg) {
    const cfg = normalizePiece(rawCfg), type = code[1], white = code[0] === "w";
    const fam = FAMILIES[cfg.family], def = fam[type];
    if (!def) return "";
    const col = white ? cfg.white : cfg.black, style = cfg.style, sw = cfg.outline;
    const shapes = def.body.join("");
    let fill, strokeColor = col.stroke, strokeW = sw, defs = "", overlay = "";
    const grad = (id, stops, units = 'gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="92"') =>
      `<linearGradient id="${id}" ${units}>${stops.map((s) => `<stop offset="${s[0]}" stop-color="${s[1]}"${s[2] != null ? ` stop-opacity="${s[2]}"` : ""}/>`).join("")}</linearGradient>`;
    if (style === "solid") fill = col.fill;
    else if (style === "gradient") { defs += grad("g", [[0, lighten(col.fill, 0.22)], [0.55, col.fill], [1, darken(col.fill, 0.24)]]); fill = "url(#g)"; }
    else if (style === "glass") {
      defs += grad("g", [[0, lighten(col.fill, 0.55), 0.62], [0.5, col.fill, 0.34], [1, darken(col.fill, 0.2), 0.5]]);
      fill = "url(#g)"; strokeW = Math.max(sw, 1.4);
    } else if (style === "outline") { fill = "none"; strokeW = Math.max(sw, 2); strokeColor = col.stroke; }
    else { /* neon */ fill = darken(col.fill, 0.82); strokeColor = col.fill; strokeW = Math.max(sw, 2.2); }

    // soft light and shade clipped to the piece
    if (cfg.gloss > 0 && style !== "outline" && style !== "neon") {
      const a = (cfg.gloss / 100).toFixed(2);
      defs += `<clipPath id="cp">${shapes}</clipPath>` +
        `<radialGradient id="hl" cx="0.3" cy="0.22" r="0.65"><stop offset="0" stop-color="#fff" stop-opacity="${(0.75 * a).toFixed(2)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="sd" x1="0" y1="0.45" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${(0.32 * a).toFixed(2)}"/></linearGradient>`;
      overlay = `<g clip-path="url(#cp)" stroke="none"><rect x="0" y="0" width="100" height="100" fill="url(#sd)"/><rect x="0" y="0" width="100" height="100" fill="url(#hl)"/></g>`;
    }
    // drop shadow and glow
    let filter = "", fattr = "";
    const glowCol = style === "neon" ? col.fill : style === "glass" ? col.stroke : col.stroke === "#000000" ? col.fill : col.stroke;
    const parts = [];
    if (cfg.shadow > 0) parts.push(`<feDropShadow dx="0" dy="${(1 + cfg.shadow / 40).toFixed(1)}" stdDeviation="${(1 + cfg.shadow / 40).toFixed(1)}" flood-color="#000" flood-opacity="${(0.12 + cfg.shadow / 220).toFixed(2)}"/>`);
    if (cfg.glow > 0) {
      const sd = (1.5 + cfg.glow / 18).toFixed(1), op = Math.min(1, 0.35 + cfg.glow / 110).toFixed(2);
      parts.push(`<feDropShadow dx="0" dy="0" stdDeviation="${sd}" flood-color="${glowCol}" flood-opacity="${op}"/>`);
      if (style === "neon") parts.push(`<feDropShadow dx="0" dy="0" stdDeviation="${(sd * 0.45).toFixed(1)}" flood-color="${glowCol}" flood-opacity="0.9"/>`);
    }
    if (parts.length) { filter = `<filter id="f" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">${parts.join("")}</filter>`; fattr = ' filter="url(#f)"'; }
    const detailColor = style === "neon" ? col.fill : strokeColor;
    const pt = cfg.parts.length ? partsSvg(cfg.parts, type, white) : { back: "", front: "" };
    const ink = "";   // freehand drawing was removed in 3.4.2
    const inkSvg = ink ? (cfg.drawClip ? `<defs><clipPath id="dc">${shapes}</clipPath></defs><g clip-path="url(#dc)">${ink}</g>` : `<g>${ink}</g>`) : "";
    const details = def.detail.map((d) => d.replace(/<path /g, `<path fill="none" `)).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${defs}${filter}</defs>` +
      `<g${fattr}>${pt.back}<g fill="${fill}" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>${overlay}` +
      `<g color="${detailColor}" stroke="${detailColor}" stroke-width="${Math.max(1.6, strokeW * 0.9).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${details}</g>${inkSvg}${pt.front}</g></svg>`;
  }
  // Parts only (transparent), as separate "behind the piece" and "in front of the piece" images, so they can sit on top of
  // any base image, e.g. one of Chess.com's own piece themes.
  const layerCache = new Map();
  function partsLayers(code, rawCfg) {
    const cfg = normalizePiece(rawCfg); if (!cfg.parts.length) return null;
    const key = code + JSON.stringify(cfg.parts); let v = layerCache.get(key);
    if (!v) {
      const pt = partsSvg(cfg.parts, code[1], code[0] === "w"), wrap = (g) => g ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${g}</svg>`) : "";
      v = { back: wrap(pt.back), front: wrap(pt.front) }; if (layerCache.size > 120) layerCache.clear(); layerCache.set(key, v);
    }
    return v;
  }
  const cache = new Map();
  function dataUri(code, cfg) {
    const norm = normalizePiece(cfg), key = code + JSON.stringify(norm);
    let v = cache.get(key);
    if (!v) { v = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgFor(code, norm)); if (cache.size > 240) cache.clear(); cache.set(key, v); }
    return v;
  }

  self.BMPieces = { PARTS, PART_IDS, PART_TARGETS, MAX_PARTS, DRAW_TYPES, FAMILIES: Object.keys(FAMILIES), STYLES: ["solid", "gradient", "glass", "outline", "neon"], PRESETS, presetById, DEFAULT_PIECE, FX_DEFAULT, PARTICLES, normalizePiece, normalizeFx, svgFor, dataUri, partsLayers, mix, lighten, darken };
})();
