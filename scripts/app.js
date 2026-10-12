/* Manapad 3D simulation — renderer, sky/day cycle, camera, UI, time loop. */
(function () {
  "use strict";
  const T = window.THREE, EM = window.EnergyModel;
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const fmt = (x) => Math.round(x).toLocaleString("en-IN");
  const hhmm = (m) => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = Math.floor(m % 60); return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- renderer / scene ---------- */
  const canvas = $("c");
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.fog = new T.Fog(0xbfd4e2, 900, 3600);
  const camera = new T.PerspectiveCamera(42, innerWidth / innerHeight, 1, 24000);
  const controls = new T.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.485; controls.minDistance = 6; controls.maxDistance = 2200;
  controls.screenSpacePanning = false;

  // sky + stars
  const sky = new T.Sky(); sky.scale.setScalar(12000); scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 7; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
  const stars = (() => {
    const n = 2200, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = Math.random() * 2 * Math.PI, v = Math.acos(Math.random() * 0.95), r = 9000; p.set([r * Math.sin(v) * Math.cos(u), r * Math.cos(v), r * Math.sin(v) * Math.sin(u)], i * 3); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(p, 3));
    const s = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(s); return s;
  })();

  // lights
  const sun = new T.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  const SH = renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048;
  sun.shadow.mapSize.set(SH, SH);
  Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 10, far: 2400 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const moon = new T.DirectionalLight(0x9db8ff, 0); moon.position.set(-400, 700, 300); scene.add(moon);
  const hemi = new T.HemisphereLight(0xcfe3ff, 0x8a7a60, 0.8); scene.add(hemi);

  // environment from the sky (reflections on water + panels)
  const pmrem = new T.PMREMGenerator(renderer);
  const envScene = new T.Scene();
  let envRT = null, envSunY = 99;
  function refreshEnv(sunDir) {
    if (Math.abs(sunDir.y - envSunY) < 0.015 && envRT) return;
    envSunY = sunDir.y;
    scene.remove(sky); envScene.add(sky);
    const rt = pmrem.fromScene(envScene, 0, 1, 20000);
    envScene.remove(sky); scene.add(sky);
    if (envRT) envRT.dispose();
    envRT = rt; scene.environment = rt.texture;
  }

  // post: bloom for night lights
  const composer = new T.EffectComposer(renderer);
  composer.addPass(new T.RenderPass(scene, camera));
  const bloom = new T.UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.55, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new T.OutputPass());
  let useBloom = true;

  /* ---------- load textures, build world ---------- */
  function loadTex(src, srgb) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const t = new T.Texture(img); if (srgb) t.colorSpace = T.SRGBColorSpace; t.needsUpdate = true; res(t); };
      img.onerror = rej; img.src = src;
    });
  }

  let world, sim, params = Object.assign({}, EM.DEFAULTS);
  let tMin = 630, speed = 120, playing = !reduced, clock = 0;

  Promise.all([loadTex(window.TEX.sat, true), loadTex(window.TEX.water, false)]).then(([sat, waterMask]) => {
    world = window.World.build({ scene, renderer, sat, waterMask });
    rerun();
    buildParams(); buildLabels();
    setView("overview", true);
    updateSky(tMin);
    refreshEnv(sunDir);
    $("loading").classList.add("done");
    if (!playing) setPlay(false);
    requestAnimationFrame(loop);
  }).catch((e) => { $("loading").querySelector("p").textContent = "Could not build the 3D scene: " + e; console.error(e); });

  /* ---------- simulation ---------- */
  function rerun() {
    sim = EM.run(params, world.rows);
    drawChart(); showResults();
  }

  /* ---------- sun position + day/night ---------- */
  const LAT = 8.5 * Math.PI / 180, DEC = -7 * Math.PI / 180;   // Manapad, mid-October
  const sunDir = new T.Vector3();
  let night = 0, altDeg = 0;
  function updateSky(m) {
    const noon = (params.sunrise + params.sunset) / 2;
    const H = ((m / 60) - noon) * 15 * Math.PI / 180;
    const sinAlt = Math.sin(LAT) * Math.sin(DEC) + Math.cos(LAT) * Math.cos(DEC) * Math.cos(H);
    const alt = Math.asin(sinAlt);
    let az = Math.acos(clamp((Math.sin(DEC) - Math.sin(alt) * Math.sin(LAT)) / (Math.cos(alt) * Math.cos(LAT)), -1, 1));
    if (H > 0) az = 2 * Math.PI - az;                 // azimuth from north, clockwise
    sunDir.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
    altDeg = alt * 180 / Math.PI;
    su.sunPosition.value.copy(sunDir);
    su.rayleigh.value = 1.2 + 1.8 * (1 - smooth(0, 25, altDeg));
    su.turbidity.value = 6 + 4 * (1 - smooth(0, 25, altDeg));
    const day = smooth(-4, 8, altDeg);
    night = 1 - smooth(-7, 2, altDeg);
    const tgt = controls.target;
    sun.position.copy(tgt).addScaledVector(sunDir, 1200); sun.target.position.copy(tgt);
    sun.intensity = 2.3 * day;
    sun.color.setHSL(0.09, 0.8 * (1 - smooth(4, 30, altDeg)) + 0.05, 0.62 + 0.3 * smooth(4, 30, altDeg));
    sun.castShadow = day > 0.05 && shadowsOn;
    moon.intensity = 0.55 * night;
    hemi.intensity = 0.22 + 0.5 * day;
    hemi.color.setHSL(0.58, 0.45, 0.35 + 0.45 * day);
    hemi.groundColor.setHSL(0.1, 0.25, 0.12 + 0.3 * day);
    stars.material.opacity = night;
    scene.environmentIntensity = 0.12 + 0.88 * day;
    renderer.toneMappingExposure = 0.58 + 0.3 * night;
    // fog colour follows the horizon: day haze -> sunset -> night
    const fc = new T.Color(0x0b1622).lerp(new T.Color(0xe2a27a), smooth(-6, 1, altDeg) * (1 - smooth(4, 18, altDeg)) * 0.9).lerp(new T.Color(0xbfd4e2), smooth(6, 20, altDeg));
    scene.fog.color.copy(fc);
    scene.background = null;
    world && world.waterMat && (world.waterMat.color.setHSL(0.52, 0.6, 0.06 + 0.12 * day));
  }

  /* ---------- camera views ---------- */
  const VIEWS = {
    overview: { p: [470, 250, 120], t: [-20, 0, 40] },
    jetty: { p: [-5, 34, -70], t: [-95, 0, 25] },
    solar: { p: [175, 115, 175], t: [40, 0, -25] },
    station: { p: [250, 32, 165], t: [200, 3, 122] },
    mouth: { p: [330, 105, 10], t: [205, 0, 175] },
    walk: null
  };
  let tween = null, follow = -1;
  function setView(name, instant) {
    follow = -1; updateFollowBtn();
    document.querySelectorAll(".views button[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
    let p, t;
    if (name === "walk") {
      const s = world.spine, a = s[14], b = s[24];
      p = new T.Vector3(a.x, 3.1, a.z); t = new T.Vector3(b.x, 1.6, b.z);
      const back = p.clone().sub(t).setY(0).normalize(); p.addScaledVector(back, 6);
    } else { p = new T.Vector3(...VIEWS[name].p); t = new T.Vector3(...VIEWS[name].t); }
    if (instant || reduced) { camera.position.copy(p); controls.target.copy(t); controls.update(); tween = null; return; }
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, s: 0 };
  }
  document.querySelectorAll(".views button[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  function stepTween(dt) {
    if (!tween) return;
    tween.s = Math.min(1, tween.s + dt / 1.8);
    const e = tween.s < 0.5 ? 4 * tween.s ** 3 : 1 - Math.pow(-2 * tween.s + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.s >= 1) tween = null;
  }
  controls.addEventListener("start", () => { tween = null; });

  /* ---------- follow a boat ---------- */
  function updateFollowBtn() { $("followBtn").classList.toggle("on", follow >= 0); }
  function startFollow(i) {
    follow = i; tween = null; updateFollowBtn();
    document.querySelectorAll(".views button[data-view]").forEach((b) => b.classList.remove("on"));
    const ps = world.boatPose[i];
    if (ps && ps.x !== undefined) {
      const back = new T.Vector3(-Math.cos(ps.h), 0, Math.sin(ps.h));
      camera.position.set(ps.x + back.x * 30, 16, ps.z + back.z * 30);
      controls.target.set(ps.x, 1, ps.z);
    }
    openCard(i);
  }
  $("followBtn").addEventListener("click", () => {
    if (follow >= 0) { follow = -1; updateFollowBtn(); return; }
    // the boat that will next be under way (leaving or arriving)
    let best = -1, bestDt = 1e9;
    for (let i = 0; i < world.boats.length; i++) {
      const d = sim.sch.dep[i], r = sim.sch.ret[i]; if (d < 0) continue;
      const ps = world.boatPose[i];
      if (ps && (ps.state === "out" || ps.state === "in")) { best = i; bestDt = -1; break; }
      for (const ev of [d, r - world.boats[i].tIn / 60]) { const dt = ((ev - tMin) % 1440 + 1440) % 1440; if (dt < bestDt) { bestDt = dt; best = i; } }
    }
    if (best < 0) return;
    if (bestDt > 0.5) { tMin = (tMin + bestDt - 0.2 + 1440) % 1440; toast(`Jumped to ${hhmm(tMin)}, when the next boat moves`); }
    startFollow(best);
  });
  function stepFollow() {
    if (follow < 0) return;
    const ps = world.boatPose[follow];
    if (!ps || ps.state === "sea") { toast("That boat is out at sea now. Follow stopped."); follow = -1; updateFollowBtn(); return; }
    const nt = new T.Vector3(ps.x, 1, ps.z), d = nt.clone().sub(controls.target);
    controls.target.add(d); camera.position.add(d);
  }

  /* ---------- picking ---------- */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  let downAt = null;
  canvas.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const i = world.pickBoat(ray);
    if (i >= 0) openCard(i);
  });
  let card = -1;
  function openCard(i) { card = i; $("boatcard").hidden = false; fillCard(); }
  $("bcClose").addEventListener("click", () => { card = -1; $("boatcard").hidden = true; });
  $("bcFollow").addEventListener("click", () => { if (card >= 0) { const ps = world.boatPose[card]; if (ps.state === "sea") toast("This boat is at sea; it will be visible again when it comes back."); else startFollow(card); } });
  function fillCard() {
    if (card < 0) return;
    const b = world.boats[card], ps = world.boatPose[card] || {}, d = sim.sch.dep[card], r = sim.sch.ret[card];
    const slot = (124 - b.order) % 5 + 1, pen = Math.floor((124 - b.order) / 5) + 1;
    $("bcTitle").textContent = `Berth ${b.row === 0 ? "A" : "B"}-${String(pen).padStart(2, "0")}-${slot}`;
    const st = { berth: ps.kw > 0.05 ? `Moored · charging ${ps.kw.toFixed(1)} kW` : (d < 0 ? "Moored · not fishing today" : "Moored · plugged in"), out: "Leaving for the fishing grounds", in: "Returning to the jetty", sea: "At sea" }[ps.state] || "—";
    const rows = [["Status", st], ["Battery", `${Math.round((ps.soc || 0) * 100)} %  of ${params.packKwh} kWh`], ["Tier", b.row === 0 ? "Inner (next to the walkway)" : "Outer (leaves first, returns last)"]];
    if (d >= 0) rows.push(["Leaves", hhmm(d)], ["Returns", hhmm(r)], ["Trip energy", `${sim.sch.trip[card].toFixed(1)} kWh`]);
    $("bcBody").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    $("bcSoc").style.width = `${Math.round((ps.soc || 0) * 100)}%`;
    $("bcSoc").style.background = (ps.soc || 0) < 0.35 ? "var(--red)" : (ps.soc || 0) < 0.7 ? "var(--pv)" : "var(--ok)";
  }

  /* ---------- labels ---------- */
  const labels = [];
  function buildLabels() {
    const box = $("labels");
    const mk = (anchor, c, title, cls, maxD = 1600) => { const d = document.createElement("div"); d.className = "lbl" + (cls ? " " + cls : ""); d.style.setProperty("--c", c); d.innerHTML = `<b>${title}</b><span></span>`; box.appendChild(d); const L = { d, s: d.querySelector("span"), a: anchor, maxD }; labels.push(L); return L; };
    const A = world.anchors;
    labels.jetty = mk(A.jetty, "var(--load)", "Charging jetty · 250 berths");
    labels.station = mk(A.station, "var(--pv)", "Solar inverter station");
    labels.monitor = mk(A.monitor, "var(--muted)", "Monitoring station", "static", 420);
    labels.pv = mk(A.solar, "var(--pv)", "Solar field");
    labels.grid = mk(A.grid, "var(--grid)", "Grid connection · route assumed", "", 700);
    labels.room = mk(A.room, "var(--muted)", "Charging control room", "static", 380);
    labels.room.s.textContent = "switchgear · metering · chargers";
    labels.monitor.s.textContent = "SCADA · weather station · CCTV";
  }
  const pv3 = new T.Vector3();
  function placeLabels(show) {
    const placed = [];
    for (const L of labels) { // array order = priority; a label that would overlap a higher one is hidden
      if (!show) { L.d.style.display = "none"; continue; }
      pv3.copy(L.a).project(camera);
      let vis = pv3.z < 1 && Math.abs(pv3.x) < 1.1 && Math.abs(pv3.y) < 1.1 && camera.position.distanceTo(L.a) < L.maxD;
      const x = (pv3.x * 0.5 + 0.5) * innerWidth, y = (-pv3.y * 0.5 + 0.5) * innerHeight;
      const w = L.w || 200, h = 44, r = [x - w / 2, y - h - 8, x + w / 2, y];
      if (vis && placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) vis = false;
      L.d.style.display = vis ? "" : "none";
      if (vis) { placed.push(r); L.d.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; if (!L.w) L.w = L.d.offsetWidth || 200; }
    }
  }

  /* ---------- live readouts ---------- */
  function readouts() {
    const m = Math.floor(tMin) % 1440;
    const pv = sim.pv[m], grid = sim.grid[m], load = sim.load[m], exp = sim.export[m], cut = sim.curtail[m];
    $("kPv").textContent = fmt(pv);
    $("kPvSub").textContent = pv > 1 ? `${fmt(sim.pvLoad[m])} kW straight to boats` : "night · inverters idle";
    $("kGrid").textContent = fmt(grid);
    $("kExp").textContent = fmt(exp + cut);
    $("kExpK").textContent = cut > 1 && exp < 1 ? "Solar curtailed" : "Solar exported";
    $("kLoad").textContent = fmt(load);
    let sea = 0, mov = 0, ch = 0, full = 0;
    for (const p of world.boatPose) { if (!p) continue; if (p.state === "sea") sea++; else if (p.state === "in" || p.state === "out") mov++; else if (p.kw > 0.05) ch++; else if (p.soc > 0.97) full++; }
    $("kCharging").textContent = `${ch} boat${ch === 1 ? "" : "s"} plugged in and charging`;
    $("kSea").textContent = sea; $("kMov").textContent = mov; $("kFull").textContent = full;
    $("clk").textContent = hhmm(tMin);
    let ph;
    if (mov > 0 && sim.sch.dep.some((d, i) => d >= 0 && world.boatPose[i] && world.boatPose[i].state === "out")) ph = "Boats leaving for the fishing grounds";
    else if (mov > 0) ph = "Boats returning to their berths";
    else if (sea > 0) ph = pv > 5 ? (exp > 1 ? "Fleet at sea · solar exported to the grid" : "Fleet at sea · solar has no load") : "Fleet at sea";
    else if (ch > 0) ph = pv > 5 ? (grid > 1 ? "Charging from solar + grid" : "Charging from the sun") : "Night charging from the grid";
    else ph = pv > 5 ? "Fleet moored and full" : "Fleet moored and full · ready for the morning";
    $("phase").textContent = ph;
    if (labels.pv) {
      labels.pv.s.textContent = pv > 1 ? `${fmt(pv)} kW generating` : "night · no output";
      labels.station.s.textContent = pv > 1 ? `2 inverters · ${fmt(pv)} kW AC` : "inverters idle (night)";
      labels.grid.s.textContent = params.gridOn ? (grid > 1 ? `importing ${fmt(grid)} kW` : exp > 1 ? `exporting ${fmt(exp)} kW` : "standby") : "disconnected";
      labels.jetty.s.textContent = `${ch} charging · ${fmt(load)} kW`;
    }
    if (card >= 0) fillCard();
  }

  /* ---------- 24 h chart ---------- */
  const chart = $("chart"), cur = $("cursor");
  function sizeCanvas(c) { const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr); return dpr; }
  const PADL = 34, PADB = 16, PADT = 4, PADR = 34;
  function drawChart() {
    const dpr = sizeCanvas(chart); sizeCanvas(cur);
    const g = chart.getContext("2d"), w = chart.width, h = chart.height;
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement), col = (n) => css.getPropertyValue(n).trim();
    const X0 = PADL * dpr, X1 = w - PADR * dpr, Y0 = h - PADB * dpr, Y1 = PADT * dpr;
    let max = 0; for (let m = 0; m < 1440; m++) max = Math.max(max, sim.pv[m], sim.load[m] + sim.unmet[m]);
    max = Math.max(100, Math.ceil(max / 250) * 250);
    const x = (m) => X0 + (X1 - X0) * m / 1440, y = (kw) => Y0 - (Y0 - Y1) * kw / max;
    g.font = `${10 * dpr}px IBM Plex Mono, monospace`; g.fillStyle = "rgba(147,163,174,.9)"; g.strokeStyle = "rgba(244,240,230,.08)"; g.lineWidth = 1;
    for (let hr = 0; hr <= 24; hr += 3) { g.beginPath(); g.moveTo(x(hr * 60), Y1); g.lineTo(x(hr * 60), Y0); g.stroke(); if (hr < 24) g.fillText(String(hr).padStart(2, "0") + ":00", x(hr * 60) + 3 * dpr, h - 3 * dpr); }
    for (const f of [0.5, 1]) { g.beginPath(); g.moveTo(X0, y(max * f)); g.lineTo(X1, y(max * f)); g.stroke(); g.fillText(fmt(max * f), 2 * dpr, y(max * f) + 9 * dpr); }
    g.fillText("kW", 2 * dpr, Y0 - 2 * dpr);
    // stacked supply to boats
    // solar surplus (exported or curtailed): light band between solar used and solar output
    g.beginPath(); g.moveTo(x(0), y(sim.pvLoad[0]));
    for (let m = 0; m < 1440; m += 2) g.lineTo(x(m), y(sim.pv[m]));
    for (let m = 1438; m >= 0; m -= 2) g.lineTo(x(m), y(sim.pvLoad[m]));
    g.closePath(); g.globalAlpha = 0.22; g.fillStyle = col("--pv"); g.fill(); g.globalAlpha = 1;
    const layers = [[sim.pvLoad, col("--pv")], [sim.grid, col("--grid")]];
    const base = new Float32Array(1440);
    for (const [arr, c] of layers) {
      g.beginPath(); g.moveTo(x(0), y(base[0]));
      for (let m = 0; m < 1440; m += 2) g.lineTo(x(m), y(base[m] + arr[m]));
      for (let m = 1438; m >= 0; m -= 2) g.lineTo(x(m), y(base[m]));
      g.closePath(); g.globalAlpha = 0.78; g.fillStyle = c; g.fill(); g.globalAlpha = 1;
      for (let m = 0; m < 1440; m++) base[m] += arr[m];
    }
    // unmet (charging held back)
    g.beginPath(); let on = false;
    for (let m = 0; m < 1440; m += 2) { if (sim.unmet[m] > 1) { const yy = y(base[m] + sim.unmet[m]); if (!on) { g.moveTo(x(m), yy); on = true; } else g.lineTo(x(m), yy); } else on = false; }
    g.strokeStyle = col("--red"); g.lineWidth = 1.5 * dpr; g.setLineDash([3 * dpr, 2 * dpr]); g.stroke(); g.setLineDash([]);
    // solar output line
    g.beginPath(); for (let m = 0; m < 1440; m += 2) (m ? g.lineTo : g.moveTo).call(g, x(m), y(sim.pv[m]));
    g.strokeStyle = col("--pv"); g.lineWidth = 1.6 * dpr; g.stroke();
    chart._x = x; chart._dpr = dpr;
  }
  function drawCursor() {
    const g = cur.getContext("2d"), dpr = chart._dpr || 1;
    g.clearRect(0, 0, cur.width, cur.height);
    if (!chart._x) return;
    const xx = chart._x(tMin);
    g.strokeStyle = "rgba(244,240,230,.9)"; g.lineWidth = 1.5 * dpr; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, cur.height - PADB * dpr); g.stroke();
    g.fillStyle = "#f4f0e6"; g.beginPath(); g.arc(xx, 4 * dpr, 3.5 * dpr, 0, 7); g.fill();
  }
  // map scrubber range to the plotted x range
  const scrub = $("scrub");
  scrub.addEventListener("input", () => {
    const r = scrub.getBoundingClientRect();
    tMin = clamp(Number(scrub.value), 0, 1439.9);
  });
  scrub.addEventListener("pointerdown", (e) => scrubAt(e));
  scrub.addEventListener("pointermove", (e) => { if (e.buttons) scrubAt(e); });
  function scrubAt(e) {
    const r = scrub.getBoundingClientRect(), fx = clamp((e.clientX - r.left - PADL) / (r.width - PADL - PADR), 0, 0.99999);
    tMin = fx * 1440; e.preventDefault();
  }

  /* ---------- assumptions panel ---------- */
  const PARAMS = [
    ["pvKwp", "Solar field size", 250, 3000, 50, (v) => `${fmt(v)} kWp`, "≈ 67 tables in the drawn layout; real capacity depends on module choice and setbacks"],
    ["sky", "Sky", null, null, null, null, null, [[1, "Clear"], [0.85, "Typical"], [0.7, "Hazy"], [0.5, "Overcast / monsoon"]]],
    ["gridOn", "Grid connection", null, null, null, null, null, [[true, "Available"], [false, "None (off-grid)"]]],
    ["exportOn", "Surplus solar", null, null, null, null, null, [[true, "Exported to the grid"], [false, "Curtailed"]]],
    ["gridKw", "Grid connection limit", 0, 2500, 50, (v) => `${fmt(v)} kW`, "applies to import and export"],
    ["boats", "Boats fishing today", 0, 250, 1, (v) => `${v} of 250`],
    ["tripKwh", "Energy per trip (average)", 5, 60, 1, (v) => `${v} kWh`, "each boat varies ±20 % around this"],
    ["packKwh", "Boat battery (usable)", 10, 80, 1, (v) => `${v} kWh`],
    ["chargerKw", "Charging power per boat", 1, 22, 0.5, (v) => `${v} kW`],
    ["departFrom", "Boats leave from", 0, 12, 0.25, (v) => hhmm(v * 60)],
    ["departTo", "… until", 0, 12, 0.25, (v) => hhmm(v * 60)],
    ["returnFrom", "Boats return from", 6, 23.5, 0.25, (v) => hhmm(v * 60)],
    ["returnTo", "… until", 6, 23.75, 0.25, (v) => hhmm(v * 60)]
  ];
  let rerunTimer = 0;
  function buildParams() {
    const box = $("params"); box.innerHTML = "";
    PARAMS.forEach(([key, label, min, max, step, f, hint, opts]) => {
      const row = document.createElement("div"); row.className = "prm";
      const id = "p_" + key;
      if (opts) {
        row.innerHTML = `<label for="${id}">${label}</label><select id="${id}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>`;
        const sel = row.querySelector("select"); sel.value = String(params[key]);
        sel.addEventListener("change", () => { params[key] = typeof opts[0][0] === "boolean" ? sel.value === "true" : Number(sel.value); schedule(); });
      } else {
        row.innerHTML = `<label for="${id}">${label}</label><output id="${id}o"></output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}">${hint ? `<span class="hint">${hint}</span>` : ""}`;
        const inp = row.querySelector("input"), o = row.querySelector("output");
        o.textContent = f(params[key]);
        inp.addEventListener("input", () => {
          params[key] = Number(inp.value);
          // keep the windows ordered
          if (key === "departFrom" && params.departTo < params.departFrom) params.departTo = params.departFrom;
          if (key === "departTo" && params.departFrom > params.departTo) params.departFrom = params.departTo;
          if (key === "returnFrom" && params.returnTo < params.returnFrom) params.returnTo = params.returnFrom;
          if (key === "returnTo" && params.returnFrom > params.returnTo) params.returnFrom = params.returnTo;
          if (params.returnFrom < params.departTo + 1) { params.returnFrom = params.departTo + 1; params.returnTo = Math.max(params.returnTo, params.returnFrom); }
          syncParams(); schedule();
        });
      }
      box.appendChild(row);
    });
  }
  function syncParams() {
    PARAMS.forEach(([key, , , , , f, , opts]) => { const el = $("p_" + key); if (!el) return; el.value = String(params[key]); if (!opts) $("p_" + key + "o").textContent = f(params[key]); });
  }
  function schedule() { clearTimeout(rerunTimer); rerunTimer = setTimeout(rerun, 120); }
  $("reset").addEventListener("click", () => { params = Object.assign({}, EM.DEFAULTS); syncParams(); rerun(); });
  function showResults() {
    const k = sim.kpi, P = params;
    const share = k.load > 0 ? Math.round(k.solarShare * 100) : 0;
    const rows = [
      ["Boat charging demand", `${fmt(k.demand)} kWh`, true],
      ["Solar generated", `${fmt(k.pv)} kWh`],
      ["  used by boats directly", `${fmt(k.pvLoad)} kWh`],
      ["  exported to the grid", `${fmt(k.export)} kWh`],
      ["  curtailed", `${fmt(k.curtail)} kWh`],
      ["Grid import", `${fmt(k.grid)} kWh`],
      ["Net from the grid (import − export)", `${fmt(k.netGrid)} kWh`, true],
      ["Boat energy from the sun", `${share} %`, true],
      ["Peak charging load", `${fmt(k.peakKw)} kW`],
      ["Boats not full at departure", `${k.depShort}${k.depShort ? ` (${fmt(k.depShortKwh)} kWh short)` : ""}`, k.depShort > 0]
    ];
    $("results").innerHTML = rows.map(([a, b, hl]) => `<dt>${a.replace(/^  /, "&nbsp;&nbsp;↳ ")}</dt><dd class="${hl ? "hl" : ""}">${b}</dd>`).join("");
    const w = [];
    if (P.tripKwh * 1.2 > P.packKwh) w.push("Some trips need more energy than the boat battery holds, so those boats come back empty.");
    if (k.depShort > 0) w.push(`${k.depShort} boats leave before they are full. Add solar, grid capacity or charging power.`);
    if (!P.gridOn && k.unmet > 1) w.push("Off-grid with no storage: boats can only charge while the sun is up (dashed red line in the chart).");
    if (k.curtail > 1) w.push(`${fmt(k.curtail)} kWh of solar is wasted because nothing can take it while the fleet is at sea.`);
    $("warn").hidden = !w.length; $("warn").innerHTML = w.join("<br>");
  }

  /* ---------- panel + toggles + keys ---------- */
  const panel = $("panel"), pbtn = $("panelBtn");
  const setPanel = (o) => { panel.hidden = !o; pbtn.hidden = o; pbtn.setAttribute("aria-expanded", String(o)); };
  pbtn.addEventListener("click", () => setPanel(true)); $("panelClose").addEventListener("click", () => setPanel(false));
  let labelsOn = true, flowOn = true, shadowsOn = true;
  $("tLabels").addEventListener("change", (e) => { labelsOn = e.target.checked; });
  $("tFlow").addEventListener("change", (e) => { flowOn = e.target.checked; });
  $("tTown").addEventListener("change", (e) => { world.buildings.visible = e.target.checked; world.trees.forEach((t) => (t.visible = e.target.checked)); });
  $("tShadow").addEventListener("change", (e) => { shadowsOn = e.target.checked; });
  $("tGlow").addEventListener("change", (e) => { useBloom = e.target.checked; });
  function setPlay(p) { playing = p; $("play").textContent = p ? "❚❚" : "▶"; $("play").setAttribute("aria-label", p ? "Pause" : "Play"); }
  $("play").addEventListener("click", () => setPlay(!playing));
  document.querySelectorAll(".speeds button").forEach((b) => b.addEventListener("click", () => {
    speed = Number(b.dataset.speed); document.querySelectorAll(".speeds button").forEach((x) => x.classList.toggle("on", x === b)); setPlay(true);
  }));
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.target.type !== "range" || e.target.tagName === "SELECT") return;
    const k = e.key;
    if (k === " ") { setPlay(!playing); e.preventDefault(); }
    else if (k === "ArrowRight") { tMin = (tMin + 15) % 1440; e.preventDefault(); }
    else if (k === "ArrowLeft") { tMin = (tMin - 15 + 1440) % 1440; e.preventDefault(); }
    else if (k >= "1" && k <= "6") setView(["overview", "jetty", "solar", "station", "mouth", "walk"][Number(k) - 1]);
    else if (k === "7") $("followBtn").click();
    else if (k === "h" || k === "H") document.body.classList.toggle("hide-ui");
    else if (k === "f" || k === "F") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
    else if (k === "Escape") { $("bcClose").click(); setPanel(false); }
  });
  let toastT = 0;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth, innerHeight);
    if (sim) drawChart();
  });

  /* ---------- main loop ---------- */
  let last = performance.now(), uiAcc = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
    if (playing) tMin = (tMin + dt * speed / 60) % 1440;
    stepTween(dt);
    controls.update();
    updateSky(tMin);
    refreshEnv(sunDir);
    world.update({ tMin, clock, sim, night });
    Object.values(world.flows).forEach((f) => { if (!flowOn) f.visible = false; });
    stepFollow();
    placeLabels(labelsOn);
    uiAcc += dt; if (uiAcc > 0.12) { uiAcc = 0; readouts(); scrub.value = String(Math.floor(tMin)); }
    drawCursor();
    bloom.strength = 0.25 + 0.55 * night;
    if (useBloom && night > 0.05) composer.render(); else renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  window.__sim = { get world() { return world; }, get sim() { return sim; }, setTime: (m) => (tMin = m), setPlay, setView, camera, controls, renderer };
})();
