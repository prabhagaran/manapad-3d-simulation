# Simulation notes

## 1. Coordinates and sources

- All site geometry comes from `scripts/site-geometry.js`, the same file the presentation uses. Coordinates are pixels of the original 1842 × 910 screenshot. At the screenshot's scale bar (~100 px ≈ 100 m), **1 px ≈ 1 m**, so the 3D model uses metres directly: world X = x − 1100, world Z = y − 650, Y up.
- The satellite image (`assets/manapad-satellite.jpg`) covers x 215–1636, y 62–882 and is the ground texture. It is mirrored outward beyond its edges and faded with haze. The mirrored copies are not real terrain.
- The town blocks and trees are **generated from image colour** (`tools/build-scenery.py`): 8-px grid cells that look like roofs become blocks with random heights; vegetation pixels become palms or round trees. A 30-px strip along the water is left clear, because the image shows boats pulled up on the beach there.
- The water mask is a colour classification of the image (teal/blue hues), cleaned of small blobs such as blue roof tarps.

## 2. Energy and fleet model (`scripts/energy-model.js`)

The model uses a one-minute step. It runs three identical days and shows the third, so each boat's charge at midnight is the steady-state value rather than a guess.

**No battery storage at the hub.** The hub was first modelled with a 2 MWh BESS; that has been removed. Solar goes through two central inverters straight to the chargers. The grid absorbs any surplus and covers any shortfall.

**Solar.** The clear-sky shape is `0.9 × sin(π·x)^1.15` between sunrise (06:06) and sunset (18:06). It is multiplied by the sky factor (clear 1.0, typical 0.85, hazy 0.7, overcast 0.5) and the performance ratio (0.78). At "typical" this gives about 4.4 kWh/kWp/day, a reasonable fixed-tilt figure for coastal Tamil Nadu outside the monsoon.

**Fleet.** Boats leave between `departFrom` and `departTo` and return between `returnFrom` and `returnTo`, with a gentle peak in each window. Each boat's trip uses `tripKwh` ±20 %. A boat plugs in 2 minutes after it berths and draws up to `chargerKw`, tapering above 90 % charge.

**Dispatch, in priority order:**
1. Solar → boats.
2. Surplus solar → grid export, up to the connection limit, if export is allowed. Otherwise, or beyond the limit, it is curtailed.
3. Any shortfall → grid import, up to the connection limit.
4. If that is still short, every charging boat is slowed by the same fraction. This "held-back" charging is the dashed red line in the chart.

"Boat energy from the sun" is solar → boats ÷ energy delivered to boats. Exported solar is reported separately, together with the net grid figure (import − export).

**Starting assumptions (illustrative, all adjustable).**

| Assumption | Value | Why this starting value |
|---|---|---|
| Solar field | 1,000 kWp | The 67 drawn tables cover ~5,600 m²; at ~200 Wp/m² that is ~1.1 MWp |
| Sky / performance ratio | typical (0.85) / 0.78 | Coastal haze, soiling, heat |
| Battery storage | none | Removed by decision; the hub runs solar + grid only |
| Surplus solar | exported to the grid | Assumes net metering or banking is available; switch to "Curtailed" if not |
| Grid connection limit | 1,000 kW, import and export | Placeholder; the connection is not known |
| Boats | 250, 22 kWh per trip, 30 kWh usable battery | ~5.5 MWh/day, consistent with the deck's earlier estimate |
| Charging power | 7 kW per boat | AC pedestal class |
| Departures / returns | 03:00–06:00 / 10:00–15:00 | Typical day-fishing pattern for small FRP boats; to be confirmed with the fishers |
| Sun | Manapad 8.5° N, mid-October | Sunrise and sunset move by about ±0.4 h over the year |

**Result for the starting values** (one typical day): boat demand 5,516 kWh; solar 4,362 kWh, of which 2,623 kWh goes straight to boats and 1,738 kWh is exported between about 06:00 and 12:00, while the fleet is at sea. Grid import is 2,893 kWh (net 1,154 kWh after export). **48 % of boat energy comes directly from the sun.** Peak charging load is 1,516 kW; grid import reaches the 1,000 kW limit around 14:10 and holds charging back for about 10 minutes. Every boat is full before it leaves.

With the earlier 2 MWh battery the same day gave 76 % solar and 1,324 kWh of grid import. Almost all the grid energy is drawn in the afternoon, not at night: the mismatch is the fleet being at sea while the sun is strongest.

## 3. Findings from building the layout in 3D

The 3D model makes some properties of the drawn layout physical. They are worth checking before the layout goes further.

| # | Finding | Severity | Confidence | What the simulation does |
|---|---|---|---|---|
| 1 | **Inner berths are boxed in.** In the deck's layout the inner tier of boats sits between the walkway spine and a continuous pontoon, with the outer tier outside the pontoon. An inner boat cannot get out past the pontoon or through the outer boat behind it. | Critical | Certain | The pontoon is replaced by **open water between long finger piers**, so an inner boat can reverse straight out once the outer boat in its slot has gone. Berths are assigned **last in, first out**: the outer tier takes the earliest departures and the latest returns. Real fleets do not arrive in a tidy order, so this needs a mooring plan (or a single tier). |
| 2 | **The pinch.** Between about x 925 and x 1000 the free water between the outer berth tips and the town beach is only ~10–14 m. On this image part of that strip is beach with boats pulled up. About 12 % of route samples fall on non-water pixels, mostly there and at the mouth bar. | Major | Likely | Boats run a two-way, ±2.4 m lane on the channel centreline. The clearance to every moored hull is ≥ 7.5 m (checked), but the boats pass over pixels the image shows as beach. Channel width and depth need a survey. |
| 3 | **Midday charging peak.** With the return window at 10:00–15:00, up to ~230 boats charge at once (around 14:10), giving ~1.5 MW. That is more than the solar field produces. | Major | Certain (given the assumptions) | Shown in the chart. Staggered or managed charging (a lower per-boat kW over a longer window) cuts the peak, and the model will show it if you lower "Charging power per boat". |
| 4 | **Solar alone does not cover 250 boats, and without storage the timing is wrong.** At ~22 kWh per trip, demand (~5.5 MWh/day) exceeds typical-day solar from ~1 MWp (~4.4 MWh). On top of that, 40 % of the solar arrives while the boats are at sea. | Critical | Likely | No battery: 48 % of boat energy from the sun, 2.9 MWh/day imported, 1.7 MWh/day exported. This works only if the grid connection can take ~1 MW both ways and export is credited. Off-grid, 242 of 250 boats leave short. |
| 5 | **Berth pitch.** 2.9 m per boat leaves ~0.7 m between 2.2 m hulls. | Minor | Certain | Drawn as is. |
| 6 | Town blocks, tree positions and heights are generated, not surveyed. | Minor | Certain | Context only. |

## 4. Validation

| Check | Result |
|---|---|
| Energy balance: solar = to boats + exported + curtailed, every minute | 0.000 kWh residual |
| Boat routes vs. moored hulls: minimum clearance from any route point to any other boat's hull | 7.6 m |
| Routes on water pixels (water mask) | 88 %; the rest is at the mouth bar (surf classified as non-water) and the pinch (finding 2) |
| Outbound trip time per boat | 3.6–6.7 min (reverse 0.7 m/s, pivot 8 s, channel 2.2 m/s, sea 4.5 m/s) |
| Loads from `file://` with no network | ✅ (all images embedded as data URIs; fonts bundled) |
| Console errors | none |
| Views checked at day (10:30, 13:00) and night (04:10, 20:30, 21:00), 1600 × 900 and 420 × 860 | ✅ |
