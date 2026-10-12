/* Manapad 3D simulation — world builder.
   Builds the 3D scene from the same traced site geometry as the presentation
   (scripts/site-geometry.js, original-screenshot pixels, ~1 px = 1 m):
     world X = x - 1100,  world Z = y - 650,  Y = up (metres).
   Everything placed here is CONCEPTUAL: positions come from the hand-marked zones,
   sizes are typical equipment sizes, nothing is surveyed or designed. */
(function () {
  "use strict";
  const T = window.THREE, S = window.SITE;
  const OX = 1100, OZ = 650;
  const G = { x0: 215 - OX, z0: 62 - OZ, w: 1421, h: 820 };       // satellite image extent in world metres
  const v3 = (x, y, z) => new T.Vector3(x, y, z);
  const W = (x, y, h = 0) => v3(x - OX, h, y - OZ);               // image px -> world
  const D2R = Math.PI / 180;
  const parsePath = (d) => d.replace(/[ML]/g, " ").trim().split(/\s+/).map((p) => p.split(",").map(Number));
  const yawOf = (dx, dz) => Math.atan2(-dz, dx);                   // local +X -> (dx, dz)

  /* ---------- small procedural textures ---------- */
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  function waterNormalTex() {
    const N = 256, waves = [[3, 1, 0.9, 0.3], [-2, 4, 0.6, 1.7], [5, -3, 0.35, 2.4], [1, 7, 0.25, 0.9], [-7, -2, 0.2, 4.1], [9, 5, 0.12, 5.3]];
    return canvasTex(N, N, (g) => {
      const im = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let dx = 0, dy = 0;
        for (const [kx, ky, a, ph] of waves) {
          const c = Math.cos(2 * Math.PI * (kx * x + ky * y) / N + ph) * a;
          dx += c * kx; dy += c * ky;
        }
        const nx = -dx * 0.05, ny = -dy * 0.05, nz = 1, l = Math.hypot(nx, ny, nz);
        const i = (y * N + x) * 4;
        im.data[i] = (nx / l * 0.5 + 0.5) * 255; im.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; im.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, false);
  }
  const panelTex = () => canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#14243a"; g.fillRect(0, 0, w, h);
    const cols = 13, rows = 2, mw = w / cols, mh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * mw + 2, y = r * mh + 2;
      const gr = g.createLinearGradient(x, y, x + mw, y + mh);
      gr.addColorStop(0, "#1f3a5c"); gr.addColorStop(1, "#122238");
      g.fillStyle = gr; g.fillRect(x, y, mw - 4, mh - 4);
      g.strokeStyle = "rgba(160,190,220,.18)"; g.lineWidth = 1;
      for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x, y + k * (mh - 4) / 6); g.lineTo(x + mw - 4, y + k * (mh - 4) / 6); g.stroke(); }
      for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(x + k * (mw - 4) / 3, y); g.lineTo(x + k * (mw - 4) / 3, y + mh - 4); g.stroke(); }
    }
    g.strokeStyle = "#c9d1d8"; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  });
  const containerSideTex = (label) => canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = "#e9ecee"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 9) { g.fillStyle = x % 18 ? "rgba(0,0,0,.05)" : "rgba(255,255,255,.5)"; g.fillRect(x, 0, 4, h); }
    g.fillStyle = "#c8ced3"; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 12, w, 12);
    for (let i = 0; i < 4; i++) { // cabinet doors
      const x = 70 + i * 230; g.fillStyle = "#dfe3e6"; g.fillRect(x, 40, 170, 190);
      g.strokeStyle = "#9aa3aa"; g.lineWidth = 3; g.strokeRect(x, 40, 170, 190); g.beginPath(); g.moveTo(x + 85, 40); g.lineTo(x + 85, 230); g.stroke();
      g.fillStyle = "#5c666d"; g.fillRect(x + 72, 120, 5, 30); g.fillRect(x + 93, 120, 5, 30);
    }
    g.fillStyle = "#2f6f8f"; g.fillRect(w - 230, 18, 190, 14);
    g.fillStyle = "#1d2a33"; g.font = "bold 26px Arial"; g.fillText(label, w - 228, 64);
    g.fillStyle = "#f2c230"; g.beginPath(); g.moveTo(w - 150, 90); g.lineTo(w - 125, 115); g.lineTo(w - 150, 140); g.lineTo(w - 175, 115); g.closePath(); g.fill();
    g.fillStyle = "#1d2a33"; g.font = "bold 28px Arial"; g.fillText("!", w - 154, 125);
  });
  const deckTex = () => canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = "#b8b1a3"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = "rgba(60,50,40,.18)"; g.fillRect(x, 0, 2, h); }
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? "255,255,255" : "0,0,0"},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  });
  const glowTex = () => canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, "rgba(255,214,150,1)"); gr.addColorStop(0.4, "rgba(255,190,120,.35)"); gr.addColorStop(1, "rgba(255,180,110,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  // wake: canvas x = along the wake (right edge = stern, narrow and bright), y = across
  const wakeTex = () => canvasTex(256, 128, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const t = 1 - x / w, half = 5 + t * 58, a = Math.pow(1 - t, 1.3) * 0.85;
      const gr = g.createLinearGradient(0, h / 2 - half, 0, h / 2 + half);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.12, `rgba(255,255,255,${a})`); gr.addColorStop(0.3, `rgba(255,255,255,${a * 0.22})`);
      gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.22})`); gr.addColorStop(0.88, `rgba(255,255,255,${a})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(x, 0, 1, h);
    }
  });

  /* ---------- geometry helpers ---------- */
  function colorize(geo, hex) {
    const c = new T.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute("color", new T.BufferAttribute(a, 3));
    return geo;
  }
  const strip = (geo) => { const g = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(g.attributes)) if (!["position", "normal", "color", "uv"].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute("uv", new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
  const merge = (list) => T.mergeGeometries(list.map(strip), false);
  function boxAt(w, h, d, x, y, z, ry = 0, hex) {
    const g = new T.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return hex ? colorize(g, hex) : g;
  }
  function cylAt(r1, r2, h, x, y, z, seg, hex) {
    const g = new T.CylinderGeometry(r1, r2, h, seg || 8); g.translate(x, y, z); return hex ? colorize(g, hex) : g;
  }
  // a beam from a to b (world points), width w, thickness t, top at y
  function beam(a, b, w, t, y, extra = 0) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    const g = new T.BoxGeometry(L + extra, t, w);
    g.rotateY(yawOf(dx, dz)); g.translate((a.x + b.x) / 2, y - t / 2, (a.z + b.z) / 2);
    return g;
  }
  class Poly { // polyline with arc-length lookup (world XZ)
    constructor(pts) {
      this.p = pts; this.s = [0];
      for (let i = 1; i < pts.length; i++) this.s.push(this.s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      this.len = this.s[this.s.length - 1];
    }
    at(s) {
      s = Math.max(0, Math.min(this.len, s));
      let lo = 0, hi = this.s.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
      const a = this.p[lo], b = this.p[hi], f = (s - this.s[lo]) / Math.max(1e-6, this.s[hi] - this.s[lo]);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dx: b.x - a.x, dz: b.z - a.z };
    }
    nearest(x, z) {
      let best = { d: 1e9, s: 0 };
      for (let i = 1; i < this.p.length; i++) {
        const a = this.p[i - 1], b = this.p[i], abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
        const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / L2));
        const qx = a.x + abx * t, qz = a.z + abz * t, d = Math.hypot(x - qx, z - qz);
        if (d < best.d) best = { d, s: this.s[i - 1] + Math.sqrt(L2) * t, x: qx, z: qz };
      }
      return best;
    }
  }
  function smoothPts(raw, n) { // centripetal Catmull-Rom resample
    const c = new T.CatmullRomCurve3(raw.map((p) => v3(p.x, 0, p.z)), false, "centripetal");
    return c.getSpacedPoints(n);
  }

  /* ---------- the build ---------- */
  function build(ctx) {
    const { scene, renderer, sat, waterMask } = ctx;
    const out = { anchors: {}, update: null };
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    sat.anisotropy = maxAniso;

    /* ground: satellite plate, mirrored outward (5x) so the horizon has no hard border; fog hides the copies */
    const EXT = 5;
    function extPlane() {
      const g = new T.PlaneGeometry(G.w * EXT, G.h * EXT, 1, 1);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * EXT - (EXT - 1) / 2, uv.getY(i) * EXT - (EXT - 1) / 2);
      g.rotateX(-Math.PI / 2); g.translate(G.x0 + G.w / 2, 0, G.z0 + G.h / 2);
      return g;
    }
    sat.wrapS = sat.wrapT = T.MirroredRepeatWrapping;
    const groundMat = new T.MeshStandardMaterial({ map: sat, roughness: 1, metalness: 0 });
    const ground = new T.Mesh(extPlane(), groundMat); ground.receiveShadow = true; ground.name = "ground";
    scene.add(ground);

    /* water: translucent animated surface over the water areas of the image */
    const wn = waterNormalTex(); wn.wrapS = wn.wrapT = T.RepeatWrapping; wn.repeat.set(G.w / 70, G.h / 70);
    waterMask.wrapS = waterMask.wrapT = T.MirroredRepeatWrapping;
    const wn2 = wn.clone(); wn2.needsUpdate = true;
    const waterMat = new T.MeshStandardMaterial({
      color: 0x0f4f5e, roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.38, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      alphaMap: waterMask, normalMap: wn, normalScale: new T.Vector2(0.3, 0.3), depthWrite: false, envMapIntensity: 0.45
    });
    const water = new T.Mesh(extPlane(), waterMat); water.position.y = 0.2; water.receiveShadow = true; water.renderOrder = 1;
    scene.add(water);

    /* settlement: building blocks textured with the satellite image from above */
    (function buildings() {
      const B = window.SCENERY.buildings, n = B.length;
      const pos = new Float32Array(n * 20 * 3), nor = new Float32Array(n * 20 * 3), uv = new Float32Array(n * 20 * 2), col = new Float32Array(n * 20 * 3), win = new Float32Array(n * 20 * 4);
      const idx = new Uint32Array(n * 30);
      let v = 0, k = 0;
      const U = (x) => (x - G.x0) / G.w, V = (z) => 1 - (z - G.z0) / G.h;
      B.forEach(([x, z, w, d, h], bi) => {
        const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, seed = (bi * 0.6180339) % 1;
        const quad = (pts, n3, wall) => {
          const base = v;
          pts.forEach(([px, py, pz, ux, uz, wu]) => {
            pos.set([px, py, pz], v * 3); nor.set(n3, v * 3); uv.set([U(ux), V(uz)], v * 2);
            const sh = wall ? 0.62 + 0.18 * seed : 1; col.set([sh, sh, sh], v * 3);
            win.set([wall ? 1 : 0, wu, py, seed * 97], v * 4); v++;
          });
          idx.set([base, base + 1, base + 2, base, base + 2, base + 3], k); k += 6;
        };
        quad([[x0, h, z1, x0, z1, 0], [x1, h, z1, x1, z1, 0], [x1, h, z0, x1, z0, 0], [x0, h, z0, x0, z0, 0]], [0, 1, 0], false);
        quad([[x0, 0, z1, x0, z1, 0], [x1, 0, z1, x1, z1, w], [x1, h, z1, x1, z1, w], [x0, h, z1, x0, z1, 0]], [0, 0, 1], true);
        quad([[x1, 0, z0, x1, z0, 0], [x0, 0, z0, x0, z0, w], [x0, h, z0, x0, z0, w], [x1, h, z0, x1, z0, 0]], [0, 0, -1], true);
        quad([[x1, 0, z1, x1, z1, 0], [x1, 0, z0, x1, z0, d], [x1, h, z0, x1, z0, d], [x1, h, z1, x1, z1, 0]], [1, 0, 0], true);
        quad([[x0, 0, z0, x0, z0, 0], [x0, 0, z1, x0, z1, d], [x0, h, z1, x0, z1, d], [x0, h, z0, x0, z0, 0]], [-1, 0, 0], true);
      });
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("normal", new T.BufferAttribute(nor, 3));
      g.setAttribute("uv", new T.BufferAttribute(uv, 2)); g.setAttribute("color", new T.BufferAttribute(col, 3)); g.setAttribute("aWin", new T.BufferAttribute(win, 4));
      g.setIndex(new T.BufferAttribute(idx, 1));
      const m = new T.MeshStandardMaterial({ map: sat, vertexColors: true, roughness: 0.92 });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = out.uNight;
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 aWin; varying vec4 vWin;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWin = aWin;");
        sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec4 vWin; uniform float uNight;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}")
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            if (vWin.x > 0.5) {
              vec2 q = vec2(vWin.y / 2.4, (vWin.z - 0.6) / 2.9);
              vec2 f = fract(q), c = floor(q);
              float w = step(0.3, f.x) * step(f.x, 0.72) * step(0.35, f.y) * step(f.y, 0.78) * step(0.0, c.y);
              float lit = step(0.6, h21(c + vWin.w));
              diffuseColor.rgb *= 1.0 - 0.45 * w;
              totalEmissiveRadiance += vec3(1.0, 0.68, 0.36) * w * lit * uNight * 1.4;
            }`);
      };
      const mesh = new T.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = "buildings";
      scene.add(mesh); out.buildings = mesh;
    })();
    out.uNight = { value: 0 };

    /* trees: coconut palms and round canopy trees */
    (function trees() {
      const P = window.SCENERY.trees;
      const palmParts = [];
      const trunk = new T.CylinderGeometry(0.16, 0.26, 8, 6, 4); trunk.translate(0, 4, 0);
      const tp = trunk.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.pow(y / 8, 2) * 0.6); }
      palmParts.push(colorize(trunk, "#7b6a55"));
      for (let f = 0; f < 8; f++) {
        const a = f / 8 * Math.PI * 2 + (f % 2) * 0.2, segs = 5, L = 3.6, pts = [], ind = [];
        for (let s = 0; s <= segs; s++) {
          const t = s / segs, r = t * L, y = 8 + Math.sin(t * Math.PI * 0.8) * 0.9 - t * t * 1.6, wdt = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
          const cx = 0.6 + Math.cos(a) * r, cz = Math.sin(a) * r, px = -Math.sin(a) * wdt, pz = Math.cos(a) * wdt;
          pts.push(cx - px, y - 0.12, cz - pz, cx + px, y - 0.12, cz + pz);
          if (s) { const b = (s - 1) * 2; ind.push(b, b + 1, b + 3, b, b + 3, b + 2); }
        }
        const fg = new T.BufferGeometry(); fg.setAttribute("position", new T.Float32BufferAttribute(pts, 3)); fg.setIndex(ind); fg.computeVertexNormals();
        palmParts.push(colorize(fg, f % 2 ? "#3f6b2e" : "#4d7c34"));
      }
      const palmGeo = merge(palmParts);
      const roundGeo = merge([colorize(cylAt(0.2, 0.3, 2.6, 0, 1.3, 0, 6), "#6b5a45"), colorize((() => { const g = new T.IcosahedronGeometry(2.6, 1); g.scale(1, 0.8, 1); g.translate(0, 4.2, 0); return g; })(), "#3e6a33")]);
      const mat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
      const palms = P.filter((t) => t[3] < 2), rounds = P.filter((t) => t[3] === 2);
      const mk = (geo, list, base) => {
        const im = new T.InstancedMesh(geo, mat, list.length), m4 = new T.Matrix4(), q = new T.Quaternion();
        list.forEach(([x, z, h], i) => {
          const s = h / base; q.setFromAxisAngle(v3(0, 1, 0), (i * 2.399) % (Math.PI * 2));
          m4.compose(v3(x, 0, z), q, v3(s, s, s)); im.setMatrixAt(i, m4);
          const tint = 0.85 + ((i * 0.37) % 0.3); im.setColorAt(i, new T.Color(tint, tint, tint));
        });
        im.castShadow = true; im.receiveShadow = false; scene.add(im); return im;
      };
      out.trees = [mk(palmGeo, palms, 8), mk(roundGeo, rounds, 6)];
    })();

    /* ---------- solar field ---------- */
    const solarPts = [].concat(S.solarBlocks.A, S.solarBlocks.B, S.solarBlocks.C);
    (function solar() {
      const tilt = 10 * D2R, yaw = -S.solarAngle * D2R;
      const pg = new T.BoxGeometry(14, 0.07, 5.6); pg.rotateX(tilt); pg.translate(0, 1.25, 0);
      const pm = new T.MeshStandardMaterial({ map: panelTex(), color: 0xffffff, metalness: 0.55, roughness: 0.22, envMapIntensity: 1.3 });
      const legs = [];
      for (const lx of [-6.2, -2.1, 2.1, 6.2]) {
        legs.push(cylAt(0.06, 0.06, 0.75 + 1.25 - 0.45, lx, (0.75 + 1.25 - 0.45) / 2, 2.2, 6));
        legs.push(cylAt(0.06, 0.06, 1.25 + 0.5, lx, (1.25 + 0.5) / 2, -2.2, 6));
        legs.push(boxAt(0.08, 0.08, 5.0, lx, 1.2, 0)); // rafter
      }
      legs.push(boxAt(13.8, 0.1, 0.1, 0, 0.82, 2.2)); legs.push(boxAt(13.8, 0.1, 0.1, 0, 1.68, -2.2));
      const lg = merge(legs);
      const lm = new T.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.7, roughness: 0.45 });
      const panels = new T.InstancedMesh(pg, pm, solarPts.length), frames = new T.InstancedMesh(lg, lm, solarPts.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion().setFromAxisAngle(v3(0, 1, 0), yaw);
      solarPts.forEach(([x, y], i) => { m4.compose(W(x, y), q, v3(1, 1, 1)); panels.setMatrixAt(i, m4); frames.setMatrixAt(i, m4); });
      panels.castShadow = frames.castShadow = true; panels.receiveShadow = true;
      scene.add(panels, frames); out.panels = panels;
      // inverter / combiner station at the solar hub
      const hub = W(S.solarHub[0], S.solarHub[1]);
      const inv = new T.Mesh(merge([boxAt(4, 0.25, 3, 0, 0.12, 0, 0, "#b7b7b0"), boxAt(3.2, 2.2, 1.6, 0, 1.35, 0, 0, "#d9dde0"), boxAt(3.4, 0.12, 1.9, 0, 2.5, 0, 0, "#a9b0b5")]), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
      inv.position.copy(hub); inv.rotation.y = yaw; inv.castShadow = true; scene.add(inv);
      out.anchors.solar = v3(hub.x, 9, hub.z);
      // perimeter fence around the solar tables (convex hull, pushed outward)
      const pts = solarPts.map(([x, y]) => W(x, y));
      const hull = convexHull(pts), cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
      const ring = hull.map((p) => { const dx = p.x - cx, dz = p.z - cz, l = Math.hypot(dx, dz); return v3(p.x + dx / l * 12, 0, p.z + dz / l * 12); });
      fence(ring, true);
    })();

    function convexHull(P) {
      const p = P.slice().sort((a, b) => a.x - b.x || a.z - b.z), cr = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
      const lo = [], up = [];
      for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
      for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    function fence(ring, closed) {
      const pts = closed ? ring.concat([ring[0]]) : ring, posts = [], wire = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = a.distanceTo(b), n = Math.max(1, Math.round(L / 4));
        for (let k = 0; k < n; k++) { const t = k / n; posts.push(v3(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t)); }
        for (const hgt of [0.6, 1.3, 2.0]) wire.push(a.x, hgt, a.z, b.x, hgt, b.z);
      }
      const im = new T.InstancedMesh(new T.CylinderGeometry(0.05, 0.05, 2.2, 5).translate(0, 1.1, 0), new T.MeshStandardMaterial({ color: 0x8e979c, metalness: 0.6, roughness: 0.5 }), posts.length);
      const m4 = new T.Matrix4(); posts.forEach((p, i) => { m4.makeTranslation(p.x, 0, p.z); im.setMatrixAt(i, m4); });
      const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.Float32BufferAttribute(wire, 3));
      scene.add(im, new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x7d878c, transparent: true, opacity: 0.4 })));
    }

    /* ---------- solar inverter station, monitoring station, charging control room ----------
       No battery storage. The compound on the old BESS footprint holds two central inverter skids,
       the inverter-duty transformer and HT ring main unit, and a monitoring station
       (SCADA room, weather station, CCTV). Sizes are typical, not designed. */
    (function station() {
      const b = S.bess, pc = S.pcs, sw = S.swap;
      const c0 = W(b.x + b.w / 2, b.y + b.h / 2);
      const pad = new T.Mesh(new T.BoxGeometry(b.w + 20, 0.3, b.h + 14), new T.MeshStandardMaterial({ color: 0xa8a49b, roughness: 1 }));
      pad.position.set(c0.x - 6, 0.15, c0.z); pad.receiveShadow = true; scene.add(pad);
      const std = (c, r = 0.6, m = 0.15) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
      const add = (geo, mat, x, y, z, parent = scene) => { const o = new T.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
      // two central inverter skids (outdoor cabinets on concrete plinths)
      out.leds = [];
      const ledG = new T.BoxGeometry(0.08, 0.12, 0.3);
      [[1307, 765, "INV-01"], [1307, 777, "INV-02"]].forEach(([x, y, label]) => {
        const p = W(x, y), g = new T.Group(); g.position.copy(p); scene.add(g);
        add(new T.BoxGeometry(7.4, 0.3, 3.4), std(0x8c877e, 1, 0), 0, 0.45, 0, g);
        const side = new T.MeshStandardMaterial({ map: containerSideTex(label), roughness: 0.55, metalness: 0.15 });
        const plain = std(0xd9dde0, 0.55);
        add(new T.BoxGeometry(6.0, 2.3, 2.4), [plain, plain, std(0xc9cfd3, 0.7), plain, side, side], -0.4, 1.75, 0, g);
        add(new T.BoxGeometry(6.3, 0.12, 2.7), std(0xaab2b8, 0.5, 0.4), -0.4, 2.96, 0, g);            // rain canopy
        add(new T.BoxGeometry(1.0, 1.6, 1.2), std(0xb8bfc4, 0.6), 3.1, 1.4, 0, g);                      // DC combiner / AC breaker box
        for (let k = 0; k < 3; k++) { const l = add(ledG, new T.MeshBasicMaterial({ color: 0x3ddc97 }), 2.62, 2.5 - k * 0.2, 0.5, g); out.leds.push(l); }
      });
      // inverter-duty transformer (finned tank, bushings) + HT ring main unit
      const tc = W(1320, 771);
      const tr = new T.Group(); tr.position.set(tc.x, 0.3, tc.z); scene.add(tr);
      add(new T.BoxGeometry(3.2, 0.3, 3.6), std(0x8c877e, 1, 0), 0, 0.15, 0, tr);
      const tank = add(new T.BoxGeometry(2.2, 2.0, 2.6), std(0x6f8592, 0.5, 0.3), 0, 1.3, 0, tr);
      for (let i = 0; i < 9; i++) { add(new T.BoxGeometry(0.06, 1.6, 0.5), tank.material, -1.0 + i * 0.25, 1.3, 1.55, tr); add(new T.BoxGeometry(0.06, 1.6, 0.5), tank.material, -1.0 + i * 0.25, 1.3, -1.55, tr); }
      for (let i = 0; i < 3; i++) add(new T.CylinderGeometry(0.09, 0.12, 0.7, 8), std(0x7b4b35), -0.6 + i * 0.6, 2.65, 0, tr);
      const rmu = W(1327, 771);
      add(new T.BoxGeometry(1.4, 2.0, 2.6), std(0x7f9a8a, 0.55, 0.2), rmu.x, 1.3, rmu.z);
      // monitoring station: SCADA / control room with rooftop telemetry
      const mc = W(pc.x + pc.w / 2, pc.y + pc.h / 2);
      const mon = new T.Group(); mon.position.set(mc.x, 0.3, mc.z); scene.add(mon);
      const wallTex = canvasTex(512, 128, (g, w, h) => {
        g.fillStyle = "#ece8de"; g.fillRect(0, 0, w, h);
        g.fillStyle = "#c9c3b6"; g.fillRect(0, h - 10, w, 10);
        g.fillStyle = "#5c6b74"; g.fillRect(60, 30, 120, 50); g.fillRect(330, 30, 120, 50);   // windows
        g.fillStyle = "#3f6f8e"; g.fillRect(225, 22, 62, 106);                                // door
        g.fillStyle = "#1d2a33"; g.font = "bold 18px Arial"; g.fillText("MONITORING", 196, 16);
      });
      const wallM = new T.MeshStandardMaterial({ map: wallTex, roughness: 0.85 }), endM = std(0xece8de, 0.85);
      add(new T.BoxGeometry(5.2, 3.0, 9.0), [wallM, wallM, std(0xb9b4aa, 0.9), endM, endM, endM], 0, 1.5, 0, mon);
      add(new T.BoxGeometry(5.6, 0.3, 9.4), std(0xd2cdc2, 0.9), 0, 3.15, 0, mon);              // roof slab / parapet
      add(new T.BoxGeometry(0.8, 0.6, 1.0), std(0xc7ccd0, 0.5), 2.0, 3.6, -3.2, mon);            // AC condenser
      add(new T.CylinderGeometry(0.04, 0.05, 4.5, 6), std(0x9aa2a8, 0.4, 0.6), -1.5, 5.5, 3.2, mon);   // telemetry mast
      const dish = add(new T.SphereGeometry(0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), std(0xe6e9eb, 0.4), -1.5, 4.4, 2.6, mon);
      dish.rotation.x = -1.1;
      add(new T.BoxGeometry(0.06, 0.5, 0.06), std(0x2e3a42), -1.5, 8.0, 3.2, mon);
      // weather station: pyranometer, reference cell, anemometer and vane on a 6 m mast
      const ws = W(1333, 758);
      const wsG = new T.Group(); wsG.position.set(ws.x, 0.3, ws.z); scene.add(wsG);
      add(new T.CylinderGeometry(0.06, 0.08, 6, 8), std(0xb8bfc4, 0.4, 0.6), 0, 3, 0, wsG);
      add(new T.BoxGeometry(1.6, 0.06, 0.06), std(0xb8bfc4, 0.4, 0.6), 0, 5.2, 0, wsG);
      add(new T.CylinderGeometry(0.12, 0.14, 0.08, 16), std(0xf0f0ea, 0.3), 0.75, 5.3, 0, wsG);       // pyranometer
      add(new T.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe8f4ff, 0.05, 0.1), 0.75, 5.34, 0, wsG);
      const refCell = add(new T.BoxGeometry(0.5, 0.03, 0.35), std(0x1f3a5c, 0.25, 0.5), -0.75, 5.35, 0, wsG); refCell.rotation.x = 0.17;
      const cups = new T.Group(); cups.position.set(0, 6.15, 0); wsG.add(cups);
      for (let k = 0; k < 3; k++) { const a = k * 2.094; add(new T.BoxGeometry(0.4, 0.02, 0.02), std(0x9aa2a8), Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, cups).rotation.y = -a; add(new T.SphereGeometry(0.06, 8, 6), std(0xe6e9eb), Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, cups); }
      add(new T.CylinderGeometry(0.015, 0.015, 0.3, 6), std(0x9aa2a8), 0, 6.0, 0, wsG);
      add(new T.BoxGeometry(0.5, 0.18, 0.02), std(0xe6e9eb), 0.2, 5.75, 0, wsG);                       // wind vane
      add(new T.BoxGeometry(0.4, 0.5, 0.25), std(0xd9dde0, 0.5), 0, 1.6, 0.12, wsG);                   // logger box
      out.anemometer = cups;
      // CCTV poles at two compound corners
      [[1284, 756, 0.8], [1336, 786, -2.4]].forEach(([x, y, yaw]) => {
        const p = W(x, y), g = new T.Group(); g.position.set(p.x, 0.3, p.z); g.rotation.y = yaw; scene.add(g);
        add(new T.CylinderGeometry(0.07, 0.1, 7, 8), std(0x8e979c, 0.4, 0.6), 0, 3.5, 0, g);
        add(new T.BoxGeometry(0.5, 0.18, 0.18), std(0xf2f2ee, 0.4), 0.3, 6.9, 0, g);
        add(new T.BoxGeometry(0.05, 0.05, 0.05), new T.MeshBasicMaterial({ color: 0xe5484d }), 0.56, 6.95, 0.05, g);
      });
      out.anchors.station = v3(c0.x - 6, 9, c0.z - 3);
      out.anchors.monitor = v3(mc.x, 9, mc.z);
      // compound fence
      const fx0 = pc.x - 5, fx1 = b.x + b.w + 6, fy0 = b.y - 6, fy1 = b.y + b.h + 6;
      fence([W(fx0, fy0), W(fx1, fy0), W(fx1, fy1), W(fx0, fy1)], true);
      // charging control room (low building, gable roof)
      const sc = W(sw.x + sw.w / 2, sw.y + sw.h / 2);
      const bw = 22, bd = 10, bh = 3.6;
      const room = new T.Mesh(new T.BoxGeometry(bw, bh, bd), new T.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.85 }));
      room.position.set(sc.x, bh / 2, sc.z); room.castShadow = room.receiveShadow = true; scene.add(room);
      const roofShape = new T.Shape(); roofShape.moveTo(-bd / 2 - 0.6, 0); roofShape.lineTo(0, 1.6); roofShape.lineTo(bd / 2 + 0.6, 0); roofShape.lineTo(-bd / 2 - 0.6, 0);
      const rg = new T.ExtrudeGeometry(roofShape, { depth: bw + 1, bevelEnabled: false }); rg.translate(0, 0, -(bw + 1) / 2); rg.rotateY(Math.PI / 2);
      const roof = new T.Mesh(rg, new T.MeshStandardMaterial({ color: 0x3f6f8e, roughness: 0.55, metalness: 0.3 })); roof.position.set(sc.x, bh, sc.z); roof.castShadow = true; scene.add(roof);
      out.anchors.room = v3(sc.x, 8, sc.z);
      // grid connection pole + line (route assumed)
      const gp = [W(1296, 800), W(1305, 815), W(1318, 846), W(1330, 900)];
      gp.forEach((p) => { const pole = new T.Mesh(new T.CylinderGeometry(0.14, 0.2, 9, 6), new T.MeshStandardMaterial({ color: 0x8a8174 })); pole.position.set(p.x, 4.5, p.z); pole.castShadow = true; scene.add(pole); });
      out.anchors.grid = v3(gp[1].x, 12, gp[1].z);
      out.gridPoles = gp;
    })();

    /* ---------- jetty: spine walkway, finger piers, piles, lamps, pedestals ---------- */
    const J = S.jetty;
    const spine = parsePath(J.spine).map(([x, y]) => W(x, y));
    const pontoon = parsePath(J.pontoon).map(([x, y]) => W(x, y));
    const DECK = 1.4, FING = 1.05;
    (function jetty() {
      const dt = deckTex(); dt.wrapS = dt.wrapT = T.RepeatWrapping; dt.repeat.set(1, 1);
      const deckM = new T.MeshStandardMaterial({ map: dt, roughness: 0.9 });
      const parts = [];
      for (let i = 1; i < spine.length; i++) parts.push(beam(spine[i - 1], spine[i], 3.2, 0.35, DECK, 0.4));
      // finger piers: inner + outer segments are collinear -> one pier from the spine to the outer end
      const nF = J.fingers.length / 2;
      out.fingers = [];
      for (let k = 0; k < nF; k++) {
        const a = W(J.fingers[k][0], J.fingers[k][1]), m = W(J.fingers[k][2], J.fingers[k][3]), e = W(J.fingers[k + nF][2], J.fingers[k + nF][3]);
        parts.push(beam(a, m, 1.3, 0.25, FING), beam(m, e, 1.3, 0.25, FING));
        out.fingers.push([a, m, e]);
      }
      // landing platform at the south end + shore bridges on the land side
      const end = spine[spine.length - 1], land = W(S.landing[0], S.landing[1]);
      parts.push(beam(end, land, 5, 0.35, DECK));
      const deck = new T.Mesh(merge(parts), deckM); deck.castShadow = deck.receiveShadow = true; scene.add(deck);
      // piles under the spine (both edges) and finger ends
      const piles = [];
      for (let i = 0; i < spine.length; i += 1) {
        const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
        piles.push(v3(spine[i].x + nx * 1.4, 0, spine[i].z + nz * 1.4), v3(spine[i].x - nx * 1.4, 0, spine[i].z - nz * 1.4));
      }
      out.fingers.forEach(([a, m, e]) => piles.push(m.clone(), e.clone(), v3((a.x + m.x) / 2, 0, (a.z + m.z) / 2)));
      const pim = new T.InstancedMesh(new T.CylinderGeometry(0.22, 0.25, 4, 8).translate(0, -0.8, 0), new T.MeshStandardMaterial({ color: 0x5e5a52, roughness: 0.9 }), piles.length);
      const m4 = new T.Matrix4(); piles.forEach((p, i) => { m4.makeTranslation(p.x, 0, p.z); pim.setMatrixAt(i, m4); });
      pim.castShadow = true; scene.add(pim);
      // land side of the spine (opposite to the berths)
      const landSide = (i) => {
        const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
        let nx = -dz / l, nz = dx / l;
        const pn = new Poly(pontoon).nearest(spine[i].x, spine[i].z);
        if ((pn.x - spine[i].x) * nx + (pn.z - spine[i].z) * nz > 0) { nx = -nx; nz = -nz; }
        return [nx, nz];
      };
      out.landSide = landSide;
      const br = [];
      for (let i = 4; i < spine.length - 2; i += 8) {
        const [nx, nz] = landSide(i), a = spine[i], b = v3(a.x + nx * 11, 0, a.z + nz * 11);
        const g = beam(a, b, 2.6, 0.3, DECK); br.push(g);
      }
      const brm = new T.Mesh(merge(br), deckM); brm.castShadow = true; scene.add(brm);
      // lamp posts on the land edge of the spine
      const lamps = [];
      for (let i = 1; i < spine.length; i += 3) { const [nx, nz] = landSide(i); lamps.push(v3(spine[i].x + nx * 1.35, DECK, spine[i].z + nz * 1.35)); }
      const poleG = merge([cylAt(0.07, 0.09, 6, 0, 3, 0, 6, "#5b6166"), boxAt(0.9, 0.08, 0.08, 0.4, 6, 0, 0, "#5b6166")]);
      const lp = new T.InstancedMesh(poleG, new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.5 }), lamps.length);
      const bulbs = new T.InstancedMesh(new T.BoxGeometry(0.45, 0.12, 0.25), new T.MeshBasicMaterial({ color: 0xffffff }), lamps.length);
      const pools = new T.InstancedMesh(new T.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }), lamps.length);
      lamps.forEach((p, i) => {
        const yaw = Math.atan2(-(spine[Math.min(i * 3 + 1, spine.length - 1)].z - p.z), 1);
        m4.makeTranslation(p.x, p.y, p.z); lp.setMatrixAt(i, m4);
        m4.makeTranslation(p.x + 0.7, p.y + 5.92, p.z); bulbs.setMatrixAt(i, m4);
        m4.makeTranslation(p.x, 0.25, p.z); pools.setMatrixAt(i, m4);
        bulbs.setColorAt(i, new T.Color(0x333333));
      });
      lp.castShadow = true; pools.renderOrder = 3; scene.add(lp, bulbs, pools);
      out.lamps = { bulbs, pools, n: lamps.length };
      out.anchors.jetty = v3(spine[18].x, 10, spine[18].z);
      out.anchors.landing = v3(land.x, 6, land.z);
    })();

    /* pedestals: one per pen per row; outer-row pedestals sit on the finger pier at the old pontoon line */
    const peds = J.peds.map(([x, y, row, pen]) => {
      let p = W(x, y);
      if (row === 1) { // snap to the closest finger mid-point (the pontoon line is open water in this layout)
        let best = null; out.fingers.forEach(([a, m]) => { const d = Math.hypot(m.x - p.x, m.z - p.z); if (!best || d < best.d) best = { d, m }; });
        p = v3(best.m.x, 0, best.m.z);
      }
      return { p, row, pen, top: v3(p.x, (row === 0 ? DECK : FING) + 1.15, p.z) };
    });
    (function pedestals() {
      const g = merge([boxAt(0.32, 1.1, 0.32, 0, 0.55, 0, 0, "#e6e8ea"), boxAt(0.5, 0.32, 0.42, 0, 1.2, 0, 0, "#5d7280")]);
      const im = new T.InstancedMesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), peds.length);
      const ring = new T.InstancedMesh(new T.BoxGeometry(0.54, 0.06, 0.46), new T.MeshBasicMaterial({ color: 0xffffff }), peds.length);
      const m4 = new T.Matrix4();
      peds.forEach((d, i) => { const y = d.row === 0 ? DECK : FING; m4.makeTranslation(d.p.x, y, d.p.z); im.setMatrixAt(i, m4); m4.makeTranslation(d.p.x, y + 1.0, d.p.z); ring.setMatrixAt(i, m4); ring.setColorAt(i, new T.Color(0x5a6a70)); });
      im.castShadow = true; scene.add(im, ring); out.pedRing = ring;
    })();

    /* ---------- boats ---------- */
    const BL = 8.2, BB = 2.2;
    function hullGeo() {
      const N = 18, pos = [], col = [], ind = [];
      const sec = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, x = -BL / 2 + t * BL;
        const hb = t < 0.55 ? BB / 2 * (0.84 + 0.16 * Math.sin(t / 0.55 * Math.PI / 2)) : BB / 2 * Math.pow(Math.cos((t - 0.55) / 0.45 * Math.PI / 2), 0.75);
        const sheer = 0.95 + 0.45 * Math.pow(Math.max(0, (t - 0.62) / 0.38), 2), keel = -0.32 + 0.22 * Math.pow(Math.max(0, (t - 0.7) / 0.3), 2);
        sec.push([[x, sheer, -hb], [x, 0.12, -hb * 0.82], [x, keel, 0], [x, 0.12, hb * 0.82], [x, sheer, hb]]);
      }
      const shade = [1, 0.78, 0.55, 0.78, 1];
      sec.forEach((s) => s.forEach((p, j) => { pos.push(...p); col.push(shade[j], shade[j], shade[j]); }));
      for (let i = 0; i < N; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 5; ind.push(a, b, a + 1, a + 1, b, b + 1); }
      const base = pos.length / 3; // transom
      sec[0].forEach((p) => { pos.push(...p); col.push(0.85, 0.85, 0.85); });
      ind.push(base, base + 1, base + 2, base, base + 2, base + 4, base + 2, base + 3, base + 4);
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new T.Float32BufferAttribute(col, 3)); g.setIndex(ind); g.computeVertexNormals();
      return g;
    }
    function fitGeo() { // floor, thwarts, battery box, electric outboard
      const fl = new T.Shape(); fl.moveTo(-BL / 2 + 0.15, -0.8); fl.lineTo(1.6, -0.86); fl.quadraticCurveTo(3.2, -0.5, 3.6, 0); fl.quadraticCurveTo(3.2, 0.5, 1.6, 0.86); fl.lineTo(-BL / 2 + 0.15, 0.8); fl.closePath();
      const fg = new T.ShapeGeometry(fl); fg.rotateX(-Math.PI / 2); fg.translate(0, 0.42, 0);
      return merge([
        colorize(fg, "#6d5a45"),
        boxAt(0.25, 0.08, BB * 0.86, -1.6, 0.9, 0, 0, "#8a7458"), boxAt(0.25, 0.08, BB * 0.8, 1.2, 0.95, 0, 0, "#8a7458"),
        boxAt(1.25, 0.5, 0.95, -0.3, 0.7, 0, 0, "#29343b"), boxAt(0.5, 0.06, 0.3, -0.3, 0.97, 0, 0, "#39c0e8"),
        boxAt(0.42, 0.55, 0.34, -BL / 2 - 0.22, 1.05, 0, 0, "#263038"), cylAt(0.05, 0.05, 1.3, -BL / 2 - 0.22, 0.25, 0, 6, "#3a434a"),
        boxAt(0.36, 0.16, 0.16, -BL / 2 - 0.2, -0.38, 0, 0, "#3a434a"), boxAt(0.08, 0.5, 0.06, -BL / 2 - 0.42, -0.38, 0, 0, "#59646c")
      ]);
    }
    const HULL = ["#efe9da", "#dfeaee", "#8fbcd2", "#4b88a6", "#c9694f"];
    const NB = J.boats.length;
    const hullM = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05, side: T.DoubleSide });
    const hulls = new T.InstancedMesh(hullGeo(), hullM, NB);
    const fits = new T.InstancedMesh(fitGeo(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), NB);
    const lights = new T.InstancedMesh(new T.SphereGeometry(0.13, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }), NB);
    const wakes = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(-0.5, 0, 0), new T.MeshBasicMaterial({ map: wakeTex(), transparent: true, depthWrite: false, opacity: 0.8 }), NB);
    hulls.castShadow = fits.castShadow = true; hulls.receiveShadow = true; wakes.renderOrder = 2;
    [hulls, fits, lights, wakes].forEach((m) => { m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); });
    hulls.name = "boats";

    // channel centreline (between the outer berth tips and the town shore) + sea route
    const CH_RAW = [[880, 586], [887, 590.6], [892.8, 595.1], [900.9, 601], [911.2, 608.8], [922.4, 617.4], [935.1, 627], [947.8, 636.2], [960.4, 645.4], [974.2, 655.5], [990.4, 666], [1004.2, 673.6], [1011.1, 677.9], [1019.7, 684.2], [1029.9, 692.4], [1042.3, 702.3], [1056.9, 713.1], [1064.1, 718.3], [1073.2, 725.9], [1087.3, 737.8], [1108.4, 751], [1129.3, 759.8], [1145.2, 764.5], [1158.3, 768.6], [1168.3, 771.6], [1178.9, 775.4], [1191.9, 780.4], [1203, 790]];
    const SEA_RAW = [[1203, 790], [1214, 809], [1244, 823], [1272, 836], [1306, 840], [1336, 829], [1353, 812], [1361, 794], [1369, 773], [1381, 756], [1396, 747], [1411, 738], [1428, 727], [1440, 710], [1447, 688], [1470, 665], [1500, 640], [1540, 612], [1590, 580], [1680, 525], [1800, 455]];
    const chan = new Poly(smoothPts(CH_RAW.map(([x, y]) => W(x, y)), 160));
    const sea = new Poly(smoothPts(SEA_RAW.map(([x, y]) => W(x, y)), 220));
    out.chan = chan; out.sea = sea;
    const V_REV = 0.7, V_CH = 2.2, V_SEA = 4.5, PIVOT = 8, LANE = 2.4;

    function lanePts(poly, s0, s1, step, side) { // samples from s0 to s1 (either direction), offset to starboard
      const pts = [], dir = Math.sign(s1 - s0) || 1, n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / step));
      for (let i = 0; i <= n; i++) {
        const s = s0 + (s1 - s0) * i / n, a = poly.at(s), l = Math.hypot(a.dx, a.dz) || 1;
        const tx = a.dx / l * dir, tz = a.dz / l * dir; // travel direction
        pts.push({ x: a.x + (-tz) * LANE * side, z: a.z + tx * LANE * side });
      }
      return pts;
    }
    // per-boat keyframes [tSec, x, z, heading, speed]
    const boats = J.boats.map(([x, y, a, ci, row, order], i) => {
      const B = W(x, y), bx = -Math.cos(a * D2R), bz = -Math.sin(a * D2R); // bow direction (towards the spine)
      // reverse straight out until the lane line of the channel is reached
      let E = null, bestD = 1e9;
      for (let k = 6; k <= 45; k += 0.5) { const px = B.x - bx * k, pz = B.z - bz * k, n = chan.nearest(px, pz); if (n.d < bestD) { bestD = n.d; E = { x: px, z: pz, s: n.s, k }; } }
      const hBerth = yawOf(bx, bz);
      const sJoin = Math.min(chan.len, E.s + 6);
      // outbound
      const ob = [];
      ob.push([0, B.x, B.z, hBerth, 0]);
      let t = E.k / V_REV; ob.push([t, E.x, E.z, hBerth, V_REV]);
      const path1 = [{ x: E.x, z: E.z }].concat(lanePts(chan, sJoin, chan.len, 4, 1).slice(1), lanePts(sea, 0, sea.len, 6, 1).slice(1));
      const h0 = yawOf(path1[1].x - E.x, path1[1].z - E.z);
      t += PIVOT; ob.push([t, E.x, E.z, h0, 0.3]);
      for (let k = 1; k < path1.length; k++) {
        const p = path1[k], q = path1[k - 1], L = Math.hypot(p.x - q.x, p.z - q.z), inSea = k > path1.length - Math.ceil(sea.len / 6) - 1;
        const v = inSea ? V_SEA : V_CH; t += L / v; ob.push([t, p.x, p.z, yawOf(p.x - q.x, p.z - q.z), v]);
      }
      // inbound (mirror: sea -> channel -> pivot -> forward into the berth)
      const path2 = lanePts(sea, sea.len, 0, 6, 1).concat(lanePts(chan, chan.len, sJoin, 4, 1).slice(1), [{ x: E.x, z: E.z }]);
      const ib = []; let u = 0;
      ib.push([0, path2[0].x, path2[0].z, yawOf(path2[1].x - path2[0].x, path2[1].z - path2[0].z), V_SEA]);
      const nSea = Math.ceil(sea.len / 6) + 1;
      for (let k = 1; k < path2.length; k++) {
        const p = path2[k], q = path2[k - 1], L = Math.hypot(p.x - q.x, p.z - q.z), v = k < nSea ? V_SEA : V_CH;
        u += L / v; ib.push([u, p.x, p.z, yawOf(p.x - q.x, p.z - q.z), v]);
      }
      u += PIVOT; ib.push([u, E.x, E.z, hBerth, 0.3]);
      u += E.k / 1.0; ib.push([u, B.x, B.z, hBerth, 0]);
      return { i, B, bow: v3(bx, 0, bz), hBerth, row, order, color: new T.Color(HULL[ci]), ob, ib, tOut: t, tIn: u, ped: peds.find((p) => p.row === row && p.pen === Math.floor((124 - order) / 5)) };
    });
    out.boats = boats; out.rows = boats.map((b) => b.row);
    boats.forEach((b, i) => { hulls.setColorAt(i, b.color); fits.setColorAt(i, new T.Color(1, 1, 1)); lights.setColorAt(i, new T.Color(0x3ddc97)); });

    function sampleKeys(K, t) {
      if (t <= K[0][0]) return K[0];
      if (t >= K[K.length - 1][0]) return K[K.length - 1];
      let lo = 0, hi = K.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (K[m][0] <= t) lo = m; else hi = m; }
      const a = K[lo], b = K[hi], f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      let dh = b[3] - a[3]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + dh * f, b[4]];
    }

    /* cables: pedestal head -> bow, 8 points with sag */
    const CS = 8;
    const cablePos = new Float32Array(NB * (CS - 1) * 2 * 3), cableCol = new Float32Array(NB * (CS - 1) * 2 * 3);
    const cg = new T.BufferGeometry(); cg.setAttribute("position", new T.BufferAttribute(cablePos, 3)); cg.setAttribute("color", new T.BufferAttribute(cableCol, 3));
    const cables = new T.LineSegments(cg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    cables.frustumCulled = false; scene.add(cables);

    /* ---------- energy flow ribbons ---------- */
    const flowMat = (hex) => new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new T.Color(hex) }, uAmt: { value: 0 }, uDir: { value: 1 }, uLen: { value: 100 } },
      vertexShader: "varying float vS; uniform float uLen; void main(){ vS = uv.x * uLen; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying float vS; uniform float uTime, uAmt, uDir; uniform vec3 uColor; void main(){ float d = fract((vS - uTime * (6.0 + 18.0 * uAmt) * uDir) / 7.0); float dash = smoothstep(0.0, 0.25, d) * smoothstep(1.0, 0.55, d); float a = (0.18 + 0.82 * dash) * clamp(uAmt * 1.4, 0.0, 1.0); gl_FragColor = vec4(uColor * (0.6 + 1.6 * dash), a); }"
    });
    function flow(ptsImg, hex, y, r, worldPts) {
      const pts = (worldPts || ptsImg.map(([x, yy]) => W(x, yy))).map((p) => v3(p.x, p.y || y, p.z));
      const curve = new T.CatmullRomCurve3(pts, false, "centripetal", 0.3);
      const L = curve.getLength();
      const g = new T.TubeGeometry(curve, Math.max(16, Math.round(L / 2)), r, 6, false);
      const m = flowMat(hex); m.uniforms.uLen.value = L;
      const mesh = new T.Mesh(g, m); mesh.renderOrder = 4; mesh.visible = false; scene.add(mesh);
      return mesh;
    }
    const feeder = (pts) => {
      const c = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
      return [c, [(c[0] + S.solarHub[0]) / 2, (c[1] + S.solarHub[1]) / 2], S.solarHub];
    };
    const spineEdge = spine.map((p, i) => { const [nx, nz] = out.landSide(i); return v3(p.x + nx * 1.75, DECK - 0.2, p.z + nz * 1.75); });
    out.flows = {
      // each block's feeder starts at the centroid of its own tables and runs to the inverter station,
      // so it stays inside the fenced solar area (the fence is the tables' convex hull + 12 m)
      pvA: flow(feeder(S.solarBlocks.A), "#f5b83d", 0.5, 0.32),
      pvB: flow(feeder(S.solarBlocks.B), "#f5b83d", 0.5, 0.32),
      pvC: flow(feeder(S.solarBlocks.C), "#f5b83d", 0.5, 0.32),
      pvMain: flow([S.solarHub, [1236, 700], [1270, 745], [1300, 758], [1307, 765]], "#f5b83d", 0.5, 0.5),
      inv: flow([[1310, 771], [1320, 771]], "#f5b83d", 0.6, 0.45),
      grid: flow(null, "#a58bff", 0, 0.45, out.gridPoles.slice().reverse().map((p) => v3(p.x, 8.6, p.z)).concat([W(1312, 790, 3), W(1327, 771, 2.2)])),
      jetty: flow(null, "#4cc9f0", 0, 0.24, [W(1327, 771, 0.6), W(1312, 786, 0.6), W(1262, 788, 0.6), W(1228, 764, 0.6), W(S.landing[0], S.landing[1], DECK + 0.15)].concat(spineEdge.slice().reverse()))
    };

    /* ---------- per-frame update ---------- */
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e3 = new T.Euler(), sc1 = v3(1, 1, 1), zero = v3(0, 0, 0), tmp = v3(0, 0, 0);
    const cRed = new T.Color(0xe5484d), cAmb = new T.Color(0xf5b83d), cGrn = new T.Color(0x3ddc97), cTmp = new T.Color();
    const cCh = new T.Color(0x4cc9f0), cIdle = new T.Color(0x5b646a), cPedIdle = new T.Color(0x5a6a70);
    const pedBusy = new Uint8Array(peds.length);
    out.boatPose = new Array(NB);

    out.update = function (st) {
      // st: { tMin (0..1440 float), clock (real seconds), sim (model output), night (0..1) }
      const { tMin, clock, sim, night } = st;
      const M = 1440, m = Math.floor(tMin) % M, f = tMin - Math.floor(tMin), m2 = (m + 1) % M;
      pedBusy.fill(0);
      let ci = 0;
      for (let i = 0; i < NB; i++) {
        const b = boats[i], dep = sim.sch.dep[i], ret = sim.sch.ret[i];
        let pose = null, state = "berth", speed = 0;
        if (dep >= 0) {
          const eOut = (tMin - dep) * 60, eIn = b.tIn - (ret - tMin) * 60;
          if (eOut >= 0 && eOut <= b.tOut) { pose = sampleKeys(b.ob, eOut); state = "out"; }
          else if (tMin >= dep && tMin < ret && (ret - tMin) * 60 > b.tIn) state = "sea";
          else if (tMin < ret && (ret - tMin) * 60 <= b.tIn) { pose = sampleKeys(b.ib, eIn); state = "in"; }
        }
        let x, z, h, y = 0, roll = 0, pitch = 0;
        if (state === "sea") { m4.compose(zero, q.identity(), zero); hulls.setMatrixAt(i, m4); fits.setMatrixAt(i, m4); lights.setMatrixAt(i, m4); wakes.setMatrixAt(i, m4); out.boatPose[i] = { state, soc: sim.boatSoc[i * M + m] }; continue; }
        if (pose) { x = pose[1]; z = pose[2]; h = pose[3]; speed = pose[4]; }
        else { x = b.B.x; z = b.B.z; h = b.hBerth; }
        y = 0.05 * Math.sin(clock * 1.3 + i * 0.7) + (speed > 1 ? 0.06 : 0);
        roll = 0.025 * Math.sin(clock * 0.9 + i * 1.3); pitch = speed > 1 ? -0.03 : 0.012 * Math.sin(clock * 1.1 + i);
        e3.set(roll, h, pitch, "YXZ"); q.setFromEuler(e3);
        tmp.set(x, y, z); m4.compose(tmp, q, sc1);
        hulls.setMatrixAt(i, m4); fits.setMatrixAt(i, m4);
        // status light above the battery box
        const soc = sim.boatSoc[i * M + m] * (1 - f) + sim.boatSoc[i * M + m2] * f;
        const kw = sim.boatKw[i * M + m];
        const lx = x + Math.cos(h) * -0.3, lz = z - Math.sin(h) * -0.3;
        const ls = 1 + 0.5 * night;
        m4.makeScale(ls, ls, ls).setPosition(lx, y + 1.2, lz); lights.setMatrixAt(i, m4);
        if (soc < 0.35) cTmp.copy(cRed).lerp(cAmb, soc / 0.35); else cTmp.copy(cAmb).lerp(cGrn, Math.min(1, (soc - 0.35) / 0.5));
        if (kw > 0.05) cTmp.multiplyScalar(0.75 + 0.5 * (0.5 + 0.5 * Math.sin(clock * 4 + i)));
        if (speed > 0.2 && night > 0.3) cTmp.setRGB(1.6, 1.6, 1.5);
        lights.setColorAt(i, cTmp);
        // wake while moving fast enough
        if (speed > 1) {
          const len = 6 + speed * 3.2, wid = 2.4 + speed * 0.9;
          e3.set(0, h, 0, "YXZ"); q.setFromEuler(e3);
          tmp.set(x - Math.cos(h) * (BL / 2 - 0.3), 0.22, z + Math.sin(h) * (BL / 2 - 0.3));
          m4.compose(tmp, q, v3(len, 1, wid)); wakes.setMatrixAt(i, m4);
        } else { m4.compose(zero, q.identity(), zero); wakes.setMatrixAt(i, m4); }
        out.boatPose[i] = { state, x, z, h, soc, kw, speed };
        // cable when moored
        const base = i * (CS - 1) * 6;
        if (state === "berth" && b.ped) {
          const a = b.ped.top, bowx = x + Math.cos(h) * (BL / 2 - 0.7), bowz = z - Math.sin(h) * (BL / 2 - 0.7), bowy = y + 1.15;
          const charging = kw > 0.05; if (charging) pedBusy[peds.indexOf(b.ped)] = 1;
          const L = Math.hypot(bowx - a.x, bowz - a.z), sag = 0.25 + L * 0.06;
          let prev = null;
          for (let s = 0; s < CS; s++) {
            const t = s / (CS - 1), px = a.x + (bowx - a.x) * t, pz = a.z + (bowz - a.z) * t, py = a.y + (bowy - a.y) * t - Math.sin(Math.PI * t) * sag;
            if (prev) { cablePos.set([prev[0], prev[1], prev[2], px, py, pz], base + (s - 1) * 6); }
            prev = [px, py, pz];
          }
          const pulse = charging ? 0.55 + 0.45 * Math.max(0, Math.sin(clock * 5 - i)) : 1;
          const cc = charging ? cCh : cIdle;
          for (let s = 0; s < (CS - 1) * 2; s++) cableCol.set([cc.r * pulse, cc.g * pulse, cc.b * pulse], base + s * 3);
        } else cablePos.fill(0, base, base + (CS - 1) * 6);
      }
      hulls.instanceMatrix.needsUpdate = fits.instanceMatrix.needsUpdate = lights.instanceMatrix.needsUpdate = wakes.instanceMatrix.needsUpdate = true;
      lights.instanceColor.needsUpdate = true;
      cg.attributes.position.needsUpdate = cg.attributes.color.needsUpdate = true;
      peds.forEach((p, i) => out.pedRing.setColorAt(i, pedBusy[i] ? cCh : cPedIdle));
      out.pedRing.instanceColor.needsUpdate = true;

      // energy flows
      const F = out.flows, P = sim.p, pv = sim.pv[m], toLoad = sim.pvLoad[m] + sim.grid[m];
      const amt = (kw, ref) => Math.min(1, kw / ref);
      const setF = (fl, a, dir) => { fl.visible = a > 0.005; fl.material.uniforms.uAmt.value = a; fl.material.uniforms.uDir.value = dir; fl.material.uniforms.uTime.value = clock; };
      const pvA = amt(pv, P.pvKwp * 0.7);
      setF(F.pvA, pvA, 1); setF(F.pvB, pvA, 1); setF(F.pvC, pvA, 1); setF(F.pvMain, pvA, 1);
      setF(F.inv, pvA, 1);
      // grid line: import flows in (violet), export flows out (amber)
      const gnet = sim.grid[m] - sim.export[m];
      F.grid.material.uniforms.uColor.value.set(gnet >= 0 ? 0xa58bff : 0xf5b83d);
      setF(F.grid, amt(Math.abs(gnet), Math.max(200, P.gridKw * 0.6)), gnet >= 0 ? 1 : -1);
      setF(F.jetty, amt(toLoad, 900), 1);

      // night lights
      out.uNight.value = night;
      const bl = new T.Color().setRGB(0.2 + 2.2 * night, 0.2 + 1.9 * night, 0.2 + 1.4 * night);
      for (let i = 0; i < out.lamps.n; i++) out.lamps.bulbs.setColorAt(i, bl);
      out.lamps.bulbs.instanceColor.needsUpdate = true;
      out.lamps.pools.material.opacity = 0.55 * night;
      // inverter status LEDs: green while producing, grey at night; anemometer turns
      const on = pv > 1;
      out.leds.forEach((l, i) => l.material.color.set(on ? (i % 3 === 2 && Math.sin(clock * 6 + i) > 0 ? 0x1f7a52 : 0x3ddc97) : 0x55606a));
      out.anemometer.rotation.y = clock * 5;

      // water ripple
      waterMat.normalMap.offset.set((clock * 0.004) % 1, (clock * 0.0025) % 1);
    };

    out.pickBoat = function (raycaster) {
      hulls.computeBoundingSphere();
      const hit = raycaster.intersectObject(hulls, false)[0];
      return hit ? hit.instanceId : -1;
    };
    out.waterMat = waterMat; out.groundMat = groundMat; out.hulls = hulls;
    out.G = G; out.W = W; out.spine = spine;
    return out;
  }

  window.World = { build };
})();
