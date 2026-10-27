# apparatus

A programmable 2D physics sandbox in TypeScript. Build a contraption out of boxes, balls, walls and pegs, press play, and watch [Rapier](https://rapier.rs) take over — or write a scene script that generates the contraption for you and drives it while it runs.

### [Live Demo](https://apparatus.n3rdw1z4rd.cloud)

## What's going on here

Apparatus has two modes:

- **Build** — place parts, drag them around (snapped to the grid), tweak their size, angle, color, friction, bounce and density, pin some of them in place.
- **Play** — the scene is handed to Rapier in a Web Worker and simulated at 60 steps/s. Grab bodies and throw them. Stop, and everything snaps back to how you built it.

A **scene** is plain data — gravity, grid, parts and an optional script — so it fits in a link, a JSON file, or a script's output.

## Features

- **Physics off the main thread** — Rapier (WASM) runs in a Web Worker, along with your scripts
- **Real units** — one grid cell is one meter, gravity is in m/s² (earth, moon, zero-g, flip, or anything in between, live)
- **Live control panel** (built with [smoke-ui](https://github.com/n3rdw1z4rd/smoke-ui)) — scene, parts, tree (the entity hierarchy), inspector (generated from component schemas), physics, view, script, share and layout tabs; everything applies instantly
- **Dockable panel** — dock it to any edge; on phones it's a resizable bottom sheet
- **Mobile and desktop** — thumb-sized action bar, touch drag, two-finger pan + pinch-zoom, long-press to inspect
- **Scene scripts** — `build()` generates parts, `setup()` / `step()` run during play; edited in a CodeMirror drawer and hot-swapped
- **Presets** — sandbox, pyramid, dominoes, plinko (script-built board + ball dropper), fan (a `step()` script)
- **Shareable scenes** — the whole scene lives in the URL; also export/import as JSON
- **Safety nets** — scripts run in the worker, errors stop the script (not the app), a script stuck in a loop gets the worker replaced after 3 s, and shared scripts never run until you trust them

## Controls

The **action bar** along the bottom has play/stop, pause, step, add box, add ball, delete, fit view, the script editor (it turns lime while a script is running), the panel toggle, and hide UI. The **panel** holds everything else.

**On the canvas**

| Input                                   | Build                         | Play                                            |
| --------------------------------------- | ----------------------------- | ----------------------------------------------- |
| click / tap a part                      | select it                     | —                                               |
| drag a part                             | move it (snaps to the grid)   | grab and throw it                               |
| drag empty space                        | pan                           | pan (or, while a script runs, `world.pointer`)  |
| right / middle drag, two fingers        | pan                           | pan                                             |
| scroll, pinch, ctrl+scroll              | zoom                          | zoom                                            |
| double-click / long-press a part        | open its inspector            | —                                               |
| double-click / double-tap empty space   | fit view                      | fit view                                        |
| drag a gizmo handle                     | move / rotate along it        | —                                               |
| 3D view: drag empty space, right drag   | orbit (shift: pan)            | orbit (shift: pan)                              |

**Keyboard**

| Key                     | Action                                   |
| ----------------------- | ---------------------------------------- |
| `space`                 | play / stop                              |
| `p`                     | pause / resume (while playing)           |
| `.`                     | one physics step                         |
| `esc`                   | stop, or deselect                        |
| `b` / `o` / `w`         | add a box / ball / wall                  |
| `d`                     | duplicate the selected part              |
| `del` / `backspace`     | delete the selected part                 |
| `[` / `]`               | rotate the selected part by 15°          |
| `f`                     | fit view                                 |
| `g`                     | move gizmo on / off                      |
| `r`                     | rotate gizmo on / off                    |
| `v`                     | 2D / 3D view                             |
| `e`                     | open the script editor                   |
| `tab`                   | show / hide the panel                    |
| `h`                     | hide the UI                              |

**Status bar:** mode · scene name · parts · render fps · physics steps per second (and ms per step) · simulated time.

## Scripting

Open the editor (`e`), pick an example or write your own, and press **run build** (`ctrl/⌘+enter`) or **save** (`ctrl/⌘+s`). A script is a plain ES module; every export is optional. Units are world pixels (y points down) and seconds.

```js
// "run build": generate parts. They're marked as generated and replaced the
// next time build runs; parts you placed by hand are kept. Moving or editing a
// generated part by hand makes it yours.
export function build(scene) {
    const g = scene.grid;
    for (let i = 0; i < 10; i++) {
        scene.box({ x: i * 2 * g, y: -i * g, w: 2 * g, h: g, fixed: true });
    }
}

// When play starts.
export function setup(world) {}

// Every physics step during play.
export function step(world, dt) {
    for (const fan of world.find('fan')) { /* … */ }
}
```

`scene` (in `build`):

| Member                  | What it is                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| `box(opts)`, `ball(opts)` | add a part: `{ x, y, w, h }` or `{ x, y, r }`, plus `angle`, `color`, `fixed`, `friction`, `bounce`, `density`, `tag` |
| `parts`                 | the hand-placed parts (copies)                                               |
| `grid`                  | grid cell size in px (= 1 m)                                                 |
| `rng`                   | seeded by the scene's seed: `nextFloat()`, `range(a, b)`, `pick(arr)`, `chance(p)`, … (core's `Rng`) |

`world` (in `setup` / `step`):

| Member                  | What it is                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| `bodies`                | every body: `{ id, tag, shape, x, y, angle, vx, vy, w, h, r, fixed }`        |
| body methods            | `accelerate(ax, ay)` (px/s², this step), `impulse(dvx, dvy)`, `setVelocity(vx, vy)`, `moveTo(x, y)`, `remove()` |
| `find(tag)`             | bodies with that tag (set tags in the inspector)                             |
| `spawn(part)`           | add a part while playing — gone again when play stops                       |
| `gravity`               | `{ x, y }` in m/s², assignable                                               |
| `pointer`               | `{ x, y, down, active }` in world px                                         |
| `time`, `frame`, `rng`  | simulated seconds, step number, seeded RNG                                   |

Built-in examples: template, staircase, random tower, pointer magnet, rain, gravity flip.

**Scripts run in the physics worker**, next to Rapier. Plain JavaScript works (`Math`, `console.log`, …), but there's no page: no `document`, `window` or `localStorage`.

Safety nets:
- a script that throws (in `setup` or `step`) is stopped; play carries on without it
- a `build()` that throws leaves the scene untouched and shows the error in the editor
- a script stuck in an infinite loop can't freeze the page: after 3 seconds without an answer the worker is replaced, play stops, and the script is turned off (its code stays in the editor)

**Shared scripts never auto-run.** If you open a link or import a file containing a script you haven't trusted, a banner lets you review, trust or ignore it. Scene parts generated by a script are stored in the scene, so a shared scene looks right even before you trust its script. Trusted scripts are remembered (by hash) in `localStorage`.

You can also poke at things from the browser console: `apparatus.store` exposes every signal and action (`apparatus.store.addNewPart('ball')`, `apparatus.store.gravityY.set(1.62)`, `apparatus.store.loadPreset('plinko')`, …), `apparatus.ecs` is the scene's ECS and `apparatus.camera` the view.

## Sharing

| Param    | Values                                         | Meaning                                                   |
| -------- | ---------------------------------------------- | --------------------------------------------------------- |
| `s`      | encoded scene                                  | The full scene: deflate-compressed JSON, base64url. The address bar updates as you build, so reload keeps your scene. |
| `preset` | `sandbox` `pyramid` `dominoes` `plinko` `fan`  | Start from a preset                                       |

**Copy link** puts the URL on your clipboard. **Export JSON** / **Import JSON** save and load the same scene as a readable file:

```json
{
  "v": 1, "name": "sandbox", "seed": 1,
  "gravity": { "x": 0, "y": 9.81 }, "grid": 32, "snap": true,
  "parts": [
    { "shape": "box", "x": 0, "y": 256, "w": 2048, "h": 32, "fixed": true, "color": "#5b6b73", "tag": "floor" },
    { "shape": "ball", "x": 208, "y": -112, "r": 16, "color": "#f2a541", "bounce": 0.6 }
  ],
  "script": ""
}
```

## Tech stack

- **TypeScript** (strict)
- **[Rapier](https://rapier.rs)** (`@dimforge/rapier2d`, WASM) for rigid-body physics, in a Web Worker
- **[@n3rdw1z4rd/core](https://www.npmjs.com/package/@n3rdw1z4rd/core)** — ECS, `CanvasRenderer`, `Clock`, `GestureRecognizer`, `WorkerInterface`, `Rng`, `log`, CSS reset
- **[smoke-ui](https://github.com/n3rdw1z4rd/smoke-ui)** + **smoke-ui-components** for the reactive UI
- **CodeMirror 6** for the script editor (lazy-loaded on first open)
- **Vite** for dev/build

## Running locally

```bash
npm install
npm run dev
```

To try it on a phone on the same network: `npm run dev` already listens on all interfaces. For production, serve the `dist/` folder from `npm run build` with any static web server.

## Project structure

```
src/
├── main.tsx                 # entry: app shell, stats, render loop, keyboard shortcuts, console handle
├── main.css                 # layout (floating dock, insets), controls, overlays
├── app/
│   ├── store.ts             # smoke-ui signals for all live state + every action (play/stop, edits, scripts, sharing)
│   ├── controls.ts          # the control panel described as data (DOM today, VR later)
│   ├── inspector.ts         # the selected part's fields as signals, synced both ways with the ECS
│   └── ui-state.ts          # dock edge / open / tab / sheet size (persisted)
├── core/
│   ├── scene.ts             # SceneConfig + PartDef types, normalization, URL/JSON codec, presets
│   ├── components.ts        # ECS components (Transform, Shape, Body, Look, Meta), picking, snapping
│   ├── camera.ts            # pan / zoom-at-point / fit
│   └── script.ts            # scene-script compiler (ES module hooks) + examples
├── physics/
│   ├── physics.worker.ts    # Rapier + scripts, running in a Web Worker
│   ├── physics-client.ts    # main-thread handle (extends core's WorkerInterface), hang detection
│   └── protocol.ts          # messages between the two
├── render/
│   └── renderer.ts          # draws grid + parts with core's CanvasRenderer (high-DPI aware)
├── input/
│   └── stage-input.ts       # mouse, touch, pinch and wheel on the canvas
└── ui/
    ├── dock.tsx             # the floating, dockable, tabbed panel
    ├── controls-dom.tsx     # renders app/controls.ts with smoke-ui-components
    ├── action-bar.tsx       # floating buttons
    ├── script-editor.tsx    # CodeMirror drawer
    ├── icons.tsx
    └── toast.ts
```

## How it works

1. **The scene is the source of truth.** Parts live in an ECS (core's, keyed by component class) while you build; the scene config is derived from it whenever it's needed — for the URL, an export, or play.
2. **Play hands the scene to the worker.** Each part becomes a Rapier body with an id; the worker steps at 60 Hz (scaled by the speed slider), runs the script's `step()` first, and posts `[id, x, y, angle]` per body in a transferred buffer.
3. **Stop restores.** The scene as it was when you pressed play is put back, so play is always a "what if".
4. **Scripts are modules.** The source is turned into a Blob URL and `import()`-ed in the worker; `build()` returns parts to the main thread, `setup()` / `step()` stay in the worker and talk to Rapier through small body handles in pixel units.
5. **Everything is a signal.** The panel, the action bar and the status bar bind straight to smoke-ui signals in `app/store.ts`; `app/controls.ts` describes the panel as data so a different renderer (VR, someday) can draw the same controls.

---

*Part of a long-running collection of from-scratch graphics and simulation experiments; the shared engine code lives in [`@n3rdw1z4rd/core`](https://www.npmjs.com/package/@n3rdw1z4rd/core).*
