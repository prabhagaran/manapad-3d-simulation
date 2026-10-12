/* Manapad 3D simulation — energy + fleet model (pure, no graphics).
   One-minute time step. Runs several identical days and keeps the last one, so each
   boat's battery level at midnight is the steady-state value, not a guess.
   No battery storage at the hub: solar feeds the chargers directly through the inverters,
   any surplus is exported to the grid (or curtailed off-grid), any shortfall is imported.
   Every number in DEFAULTS is an ILLUSTRATIVE ASSUMPTION for exploring the concept,
   not design data. All of them are adjustable in the Assumptions panel. */
(function (root) {
  "use strict";

  const DEFAULTS = {
    pvKwp: 1000,        // solar field DC size (kWp)
    sky: 0.85,          // 1 = clear sky, 0.85 = typical, 0.5 = overcast / monsoon
    pr: 0.78,           // PV performance ratio (soiling, heat, inverter, cabling)
    gridOn: true,
    exportOn: true,     // surplus solar exported to the grid (net metering / banking); else curtailed
    gridKw: 1000,       // grid connection limit, import and export (kW)
    boats: 250,         // boats that fish today (the rest stay moored)
    tripKwh: 22,        // average energy one trip takes from the boat battery
    packKwh: 30,        // usable boat battery
    chargerKw: 7,       // per-boat charging power at the pedestal
    departFrom: 3, departTo: 6,     // hours: boats leave between these times
    returnFrom: 10, returnTo: 15,   // hours: boats come back between these times
    sunrise: 6.1, sunset: 18.1,     // Manapad, ~8.5° N (varies ±0.4 h over the year)
    berths: 250,
    seed: 11
  };

  const MIN = 1440;

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Solar fraction of nameplate for minute m (0..1439). Clear-sky shape with a
     0.9 peak, scaled by sky factor and performance ratio. */
  function pvFraction(p, m) {
    const h = m / 60;
    if (h <= p.sunrise || h >= p.sunset) return 0;
    const x = (h - p.sunrise) / (p.sunset - p.sunrise);
    return 0.9 * Math.pow(Math.sin(Math.PI * x), 1.15) * p.sky * p.pr;
  }

  /* Fleet schedule. Inner-row boats sit behind outer-row boats (two tiers per pen),
     so berths are assigned last-in, first-out: the earliest departures go to the
     outer row and the earliest returns to the inner row. Row index per berth comes
     from the site geometry (0 = inner, 1 = outer). */
  function schedule(p, rows) {
    const R = rng(p.seed);
    const n = p.berths;
    const active = Math.max(0, Math.min(n, Math.round(p.boats)));
    const tri = () => (R() + R()) / 2; // gentle peak in the middle of the window
    const deps = [], rets = [];
    for (let i = 0; i < active; i++) {
      deps.push(Math.round((p.departFrom + (p.departTo - p.departFrom) * tri()) * 60));
      rets.push(Math.round((p.returnFrom + (p.returnTo - p.returnFrom) * tri()) * 60));
    }
    deps.sort((a, b) => a - b); rets.sort((a, b) => a - b);
    // berths: outer row first for departures, inner row first for returns
    const outer = [], inner = [];
    for (let i = 0; i < n; i++) (rows[i] === 1 ? outer : inner).push(i);
    // decide which berths are active: spread evenly over both rows
    const order = [];
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    shuffle(outer); shuffle(inner);
    const nOuter = Math.round(active * outer.length / n);
    const actOuter = outer.slice(0, nOuter), actInner = inner.slice(0, active - nOuter);
    const dep = new Int16Array(n).fill(-1), ret = new Int16Array(n).fill(-1);
    const trip = new Float32Array(n);
    // departures: outer berths take the earliest times
    const depOrder = actOuter.concat(actInner);
    depOrder.forEach((b, k) => { dep[b] = deps[k]; });
    // returns: inner berths take the earliest times
    const retOrder = actInner.concat(actOuter);
    retOrder.forEach((b, k) => { ret[b] = rets[k]; });
    for (let i = 0; i < n; i++) trip[i] = dep[i] >= 0 ? p.tripKwh * (0.8 + 0.4 * R()) : 0;
    order.push(...depOrder);
    return { dep, ret, trip, active };
  }

  function run(params, rows) {
    const p = Object.assign({}, DEFAULTS, params || {});
    const n = p.berths;
    const sch = schedule(p, rows);
    const days = 3;
    const out = {
      p, sch,
      pv: new Float32Array(MIN), pvLoad: new Float32Array(MIN), export: new Float32Array(MIN),
      curtail: new Float32Array(MIN), grid: new Float32Array(MIN),
      load: new Float32Array(MIN), unmet: new Float32Array(MIN),
      boatSoc: new Float32Array(n * MIN), boatKw: new Float32Array(n * MIN),
      charging: new Uint16Array(MIN)
    };
    const bs = new Float32Array(n).fill(p.packKwh); // boat battery energy (kWh)
    const atBerth = new Uint8Array(n).fill(1);
    const want = new Float32Array(n);
    const dt = 1 / 60;
    let depShort = 0, depShortSum = 0;
    for (let d = 0; d < days; d++) {
      const last = d === days - 1;
      if (last) { depShort = 0; depShortSum = 0; }
      for (let m = 0; m < MIN; m++) {
        // fleet events
        for (let i = 0; i < n; i++) {
          if (sch.dep[i] === m) {
            if (last && bs[i] < p.packKwh * 0.98) { depShort++; depShortSum += p.packKwh - bs[i]; }
            atBerth[i] = 0;
          }
          if (sch.ret[i] === m) { atBerth[i] = 1; bs[i] = Math.max(0, bs[i] - sch.trip[i]); }
        }
        // demand: each plugged boat draws up to chargerKw until full (taper above 90 %)
        let load = 0;
        for (let i = 0; i < n; i++) {
          want[i] = 0;
          if (!atBerth[i] || (sch.ret[i] >= 0 && m < sch.ret[i] + 2 && m >= sch.ret[i])) continue; // 2 min to plug in
          const room = p.packKwh - bs[i];
          if (room <= 0.01) continue;
          const frac = bs[i] / p.packKwh;
          const kw = Math.min(p.chargerKw * (frac > 0.9 ? Math.max(0.25, (1 - frac) / 0.1) : 1), room / dt);
          want[i] = kw; load += kw;
        }
        const pv = p.pvKwp * pvFraction(p, m);
        let pvLoad = Math.min(pv, load);
        let surplus = pv - pvLoad, deficit = load - pvLoad;
        // surplus -> grid export (up to the connection limit) -> curtail
        const exp = p.gridOn && p.exportOn ? Math.min(surplus, p.gridKw) : 0;
        const curtail = surplus - exp;
        // deficit -> grid -> held back
        const grid = p.gridOn ? Math.min(deficit, p.gridKw) : 0;
        deficit -= grid;
        const unmet = Math.max(0, deficit);
        const served = load > 0 ? (load - unmet) / load : 1;
        let nch = 0;
        for (let i = 0; i < n; i++) {
          if (want[i] > 0) { const kw = want[i] * served; bs[i] = Math.min(p.packKwh, bs[i] + kw * dt); if (kw > 0.05) nch++; if (last) out.boatKw[i * MIN + m] = kw; }
          if (last) out.boatSoc[i * MIN + m] = bs[i] / p.packKwh;
        }
        if (last) {
          out.pv[m] = pv; out.pvLoad[m] = pvLoad; out.export[m] = exp; out.curtail[m] = curtail;
          out.grid[m] = grid; out.load[m] = load - unmet; out.unmet[m] = unmet;
          out.charging[m] = nch;
        }
      }
    }
    // daily totals (kWh)
    const sum = (a) => { let s = 0; for (let i = 0; i < MIN; i++) s += a[i]; return s * dt; };
    let peak = 0; for (let m = 0; m < MIN; m++) peak = Math.max(peak, out.load[m] + out.unmet[m]);
    out.kpi = {
      pv: sum(out.pv), pvLoad: sum(out.pvLoad), export: sum(out.export), curtail: sum(out.curtail),
      grid: sum(out.grid), load: sum(out.load), unmet: sum(out.unmet),
      peakKw: peak, depShort, depShortKwh: depShortSum, active: sch.active,
      demand: (() => { let s = 0; for (let i = 0; i < n; i++) s += sch.trip[i]; return s; })()
    };
    const k = out.kpi;
    k.solarShare = k.load > 0 ? k.pvLoad / k.load : 0;            // solar used directly by the boats
    k.netGrid = k.grid - k.export;                                  // < 0: the hub is a net exporter
    return out;
  }

  const api = { DEFAULTS, run, pvFraction, MIN };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.EnergyModel = api;
})(typeof window !== "undefined" ? window : globalThis);
