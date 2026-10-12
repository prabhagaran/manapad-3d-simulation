# Manapad Coastal Energy Hub — 3D simulation

An interactive 3D model of the **conceptual** solar + BESS hub and 250-berth charging jetty at Manapad, Thoothukudi District, Tamil Nadu, running through a full day: boats leave before dawn, the solar field fills the battery, boats come back, plug in and charge, and the battery and grid cover the evening.

The site sits on the same satellite image and traced geometry as the presentation (`manapad-presentation`), so every zone, table, berth and route is in the same place. Energy figures come from adjustable assumptions in the app, not from a design. Nothing here claims the site is surveyed, designed or approved.

## Run it

No build step and no server needed.

1. Keep the folder structure intact.
2. Double-click `index.html` (current Chrome, Edge, Firefox or Safari; needs WebGL).
3. Press **F** for full screen.

If the browser blocks local files, serve the folder instead: `python3 -m http.server 8000`, then open `http://localhost:8000`.

## Folder

```
manapad-3d-simulation/
├── index.html                  page markup and UI text
├── README.md
├── .gitignore
├── .nojekyll                   lets GitHub Pages serve the files as-is
├── docs/
│   └── SIMULATION_NOTES.md     model, assumptions, layout findings, validation
├── styles/
│   ├── sim.css                 interface styles (same palette and type as the deck)
│   └── fonts.css               bundled fonts (OFL), work offline
├── scripts/
│   ├── vendor/three.bundle.js  three.js r169 + addons as one classic script (MIT)
│   ├── site-geometry.js        traced zones, solar tables, jetty, berths (copied from the deck)
│   ├── scenery-data.js         generated: town blocks + trees (from image colour)
│   ├── texture-data.js         generated: satellite image + water mask as data URIs
│   ├── energy-model.js         one-day energy + fleet simulation (no graphics)
│   ├── world.js                3D builders: ground, water, town, solar, BESS, jetty, boats, flows
│   └── app.js                  renderer, sky and sun, cameras, UI, time loop
├── assets/
│   ├── manapad-satellite.jpg   the satellite image (same file as the deck)
│   └── water-mask.png          generated water mask for the animated sea surface
└── tools/
    ├── build-scenery.py        regenerates scenery-data.js, texture-data.js, water-mask.png
    └── three-entry.js          entry file used to rebuild the three.js bundle
```

## Controls

| Key / control | Action |
|---|---|
| Drag · right-drag · wheel | Orbit · pan · zoom |
| 1–6 or the left buttons | Overview · Jetty · Solar field · BESS · Channel mouth · On the jetty (eye level) |
| 7 or **Follow a boat** | Follows the next boat to move; jumps the clock forward if none is moving |
| Click a boat | Berth, status, battery level, departure and return times; **Follow this boat** |
| Space | Play / pause |
| ← → | Back / forward 15 minutes |
| Timeline | Drag across the 24 h chart to scrub; speed buttons: real time, 30×, 120×, 600× |
| **Assumptions & results** | Change any assumption; the day is re-simulated instantly |
| H | Hide all panels (clean view for screenshots) |
| F | Full screen |
| Esc | Close the boat card and panel |

The app follows the operating system's "reduce motion" setting: it starts paused and camera moves are instant.

## What you see

- **Satellite ground** with an animated translucent water surface on the water areas; the image is mirrored outward and faded by haze, so there is no hard edge.
- **Town**: about 4,500 building blocks and 1,700 trees generated from the image colour. Roofs show the real satellite pixels. Heights are random (3–9.5 m) and windows light up at night. This is context, not a survey.
- **Solar field**: the 67 tables of the deck layout (14 × 5.6 m, 10° tilt, facing SSW) with legs, an inverter station and a perimeter fence.
- **BESS compound**: four 40 ft battery containers on plinths with HVAC units, a PCS skid with transformer, a fenced gravel pad, the charging control room and an assumed grid pole line.
- **Jetty**: the spine walkway on piles, 26 long finger piers, shore bridges, lamp posts and one charging pedestal per pen of five berths.
- **250 boats** (8.2 × 2.2 m FRP hulls with a battery box and electric outboard). Each has a status light (red → amber → green by charge, pulsing while charging) and a cable to its pedestal that glows cyan while charging. Boats reverse out, turn, run the channel on the starboard side, cross the mouth and leave for sea; on return they come in the same way and nose into their berth.
- **Energy flow**: animated lines from the solar blocks to the PCS, between the PCS and the battery (direction shows charge or discharge), from the grid, and along the jetty feeder. Speed and brightness follow the power.
- **Day and night**: the sun position for Manapad in mid-October, sky, haze, stars, lamp light on the deck and water, and lit windows.

## Editing

- **Assumption defaults:** `DEFAULTS` at the top of `scripts/energy-model.js`. The slider ranges are in `PARAMS` in `scripts/app.js`.
- **Camera views:** `VIEWS` in `scripts/app.js` (camera position and target in metres; world X = image x − 1100, Z = image y − 650).
- **Site geometry:** `scripts/site-geometry.js`. It is a copy of the deck's file, so update both if the layout changes.
- **Channel line and sea route:** `CH_RAW` and `SEA_RAW` in `scripts/world.js` (image pixels).
- **Town and trees:** run `python3 tools/build-scenery.py` (needs `numpy` and `opencv-python`) after replacing `assets/manapad-satellite.jpg`.
- **three.js bundle:** `npm i three@0.169.0 esbuild`, then `npx esbuild tools/three-entry.js --bundle --minify --format=iife --outfile=scripts/vendor/three.bundle.js`.

## Publishing

Like the deck, this works on GitHub Pages as-is (`.nojekyll` is included). Put the folder in its own repository, or in a subfolder of the deck's repository, and push it.
