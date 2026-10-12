# Simulation notes

## 1. Coordinates and sources

- All site geometry comes from `scripts/site-geometry.js`, the same file the presentation uses. Coordinates are pixels of the original 1842 × 910 screenshot. At the screenshot's scale bar (~100 px ≈ 100 m), **1 px ≈ 1 m**, so the 3D model uses metres directly: world X = x − 1100, world Z = y − 650, Y up.
- The satellite image (`assets/manapad-satellite.jpg`) covers x 215–1636, y 62–882 and is the ground texture. It is mirrored outward beyond its edges and faded with haze. The mirrored copies are not real terrain.
- The town blocks and trees are **generated from image colour** (`tools/build-scenery.py`): 8-px grid cells that look like roofs become blocks with random heights; vegetation pixels become palms or round trees. A 30-px strip along the water is left clear, because the image shows boats pulled up on the beach there.
- The water mask is a colour classification of the image (teal/blue hues), cleaned of small blobs such as blue roof tarps.

## 2. Energy and fleet model (`scripts/energy-model.js`)

The model uses a one-minute step. It runs three identical days and shows the third, so the battery's charge at midnight is the steady-state value rather than a guess.

**Solar.** The clear-sky shape is `0.9 × sin(π·x)^1.15` between sunrise (06:06) and sunset (18:06). It is multiplied by the sky factor (clear 1.0, typical 0.85, hazy 0.7, overcast 0.5) and the performance ratio (0.78). At "typical" this gives about 4.4 kWh/kWp/day, a reasonable fixed-tilt figure for coastal Tamil Nadu outside the monsoon.

**Fleet.** Boats leave between `departFrom` and `departTo` and return between `returnFrom` and `returnTo`, with a gentle peak in each window. Each boat's trip uses `tripKwh` ±20 %. A boat plugs in 2 minutes after it berths and draws up to `chargerKw`, tapering above 90 % charge.

**Dispatch, in priority order:**
1. Solar → boats.
2. Surplus solar → battery, limited by PCS power and the 95 % charge ceiling.
3. Anything left over is spilled (curtailed or exported; the model does not distinguish the two).
4. Any shortfall → battery, down to the 10 % floor, then grid up to the import limit.
5. If all of that is still short, every charging boat is slowed by the same fraction. This "held-back" charging is the dashed red line in the chart.

The battery is never charged from the grid. All battery energy is therefore solar, and the "Boat energy from the sun" figure is (solar → boats + battery → boats) ÷ energy delivered to boats.

**Starting assumptions (illustrative, all adjustable).**

| Assumption | Value | Why this starting value |
|---|---|---|
| Solar field | 1,000 kWp | The 67 drawn tables cover ~5,600 m²; at ~200 Wp/m² that is ~1.1 MWp |
| Sky / performance ratio | typical (0.85) / 0.78 | Coastal haze, soiling, heat |
| Battery | 2,000 kWh usable, 1,000 kW PCS | Sized to absorb most of the midday solar surplus |
| Grid import limit | 800 kW | Placeholder; the connection is not known |
| Boats | 250, 22 kWh per trip, 30 kWh usable battery | ~5.5 MWh/day, consistent with the deck's earlier estimate |
| Charging power | 7 kW per boat | AC pedestal class |
| Departures / returns | 03:00–06:00 / 10:00–15:00 | Typical day-fishing pattern for small FRP boats; to be confirmed with the fishers |
| Sun | Manapad 8.5° N, mid-October | Sunrise and sunset move by about ±0.4 h over the year |

**Result for the starting values** (one typical day): boat demand 5,516 kWh; solar 4,362 kWh, of which 2,623 kWh goes straight to boats and 1,738 kWh into the battery; battery delivers 1,569 kWh; grid 1,324 kWh; **76 % of boat energy from the sun**; peak charging load 1,516 kW. Every boat is full before it leaves. The 800 kW grid limit briefly holds charging back between about 14:30 and 15:05.

## 3. Findings from building the layout in 3D

The 3D model makes some properties of the drawn layout physical. They are worth checking before the layout goes further.

| # | Finding | Severity | Confidence | What the simulation does |
|---|---|---|---|---|
| 1 | **Inner berths are boxed in.** In the deck's layout the inner tier of boats sits between the walkway spine and a continuous pontoon, with the outer tier outside the pontoon. An inner boat cannot get out past the pontoon or through the outer boat behind it. | Critical | Certain | The pontoon is replaced by **open water between long finger piers**, so an inner boat can reverse straight out once the outer boat in its slot has gone. Berths are assigned **last in, first out**: the outer tier takes the earliest departures and the latest returns. Real fleets do not arrive in a tidy order, so this needs a mooring plan (or a single tier). |
| 2 | **The pinch.** Between about x 925 and x 1000 the free water between the outer berth tips and the town beach is only ~10–14 m. On this image part of that strip is beach with boats pulled up. About 12 % of route samples fall on non-water pixels, mostly there and at the mouth bar. | Major | Likely | Boats run a two-way, ±2.4 m lane on the channel centreline. The clearance to every moored hull is ≥ 7.5 m (checked), but the boats pass over pixels the image shows as beach. Channel width and depth need a survey. |
| 3 | **Midday charging peak.** With the return window at 10:00–15:00, up to ~230 boats charge at once (around 14:10), giving ~1.5 MW. That is more than the solar field produces. | Major | Certain (given the assumptions) | Shown in the chart. Staggered or managed charging (a lower per-boat kW over a longer window) cuts the peak, and the model will show it if you lower "Charging power per boat". |
| 4 | **Solar alone does not cover 250 boats.** At ~22 kWh per trip, demand (~5.5 MWh/day) exceeds typical-day solar from ~1 MWp (~4.4 MWh). In monsoon conditions it is about half. | Major | Likely | The default case needs ~1.3 MWh/day from the grid. Off-grid, most boats leave short. |
| 5 | **Berth pitch.** 2.9 m per boat leaves ~0.7 m between 2.2 m hulls. | Minor | Certain | Drawn as is. |
| 6 | Town blocks, tree positions and heights are generated, not surveyed. | Minor | Certain | Context only. |

## 4. Validation

| Check | Result |
|---|---|
| Energy balance: solar = to boats + to battery + spilled, every minute | 0.000 kWh residual |
| Battery charge at the end of the day equals the charge at the start (steady state) | ✅ |
| Boat routes vs. moored hulls: minimum clearance from any route point to any other boat's hull | 7.6 m |
| Routes on water pixels (water mask) | 88 %; the rest is at the mouth bar (surf classified as non-water) and the pinch (finding 2) |
| Outbound trip time per boat | 3.6–6.7 min (reverse 0.7 m/s, pivot 8 s, channel 2.2 m/s, sea 4.5 m/s) |
| Loads from `file://` with no network | ✅ (all images embedded as data URIs; fonts bundled) |
| Console errors | none |
| Views checked at day (10:30, 13:00) and night (04:10, 20:30, 21:00), 1600 × 900 and 420 × 860 | ✅ |
