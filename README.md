# apparatus

A browser-based visual scene editor for 2D physics, built in TypeScript. You lay the scene out as a **node graph**: every node is a small function you can open and rewrite, and what the graph evaluates to is the scene. A Viewport node runs it with [Rapier](https://rapier.rs). Press play and the scene simulates; edit the graph and it updates in place.

### [Live Demo](https://apparatus.n3rdw1z4rd.cloud)

The original sandbox editor is still there: the **legacy editor** link in the top bar ([`legacy.html`](https://apparatus.n3rdw1z4rd.cloud/legacy.html)).

## The idea: the graph is the scene

- **Nodes are functions.** Inputs are pins, settings are widgets on the node, results come out of the output pins. A Box node takes a position, size, angle and color and outputs an entity; a Rigid Body node takes an entity and outputs it again, now simulated.
- **Every node is code.** ✎ on any node (built-ins included) opens its source: an ES module with its interface (`inputs`, `params`, `outputs`) and a `run()` function. Save it as a new node type, or as a custom version of the original.
- **Lists broadcast.** Wire a list of 50 points into a Box's `at` and you get 50 boxes. Two lists pair up item by item, the longest wins.
- **The output is a scene.** A Scene node collects entities plus gravity, a background and an optional Camera, and a Viewport node runs it: resizable, full screen with ⤢, ▶ to play.

## Features

- **Evaluation in a worker**: the graph is evaluated off the main thread, lazily (only what an output needs) and memoized. A script node stuck in a loop gets the worker restarted after 3 s and script nodes paused.
- **Node states**: borders show each node's state in 1980s-stereo LED colors: ok, error (with the message in the node's footer), slow, or skipped (it depends on something that failed). Errors stay local: in a multi input, a failed source is left out and the rest carries on.
- **Enable / disable** any node (⏻, or `m`); **animate** per node (⟳): animated nodes re-evaluate every frame while playing (a Time node drives them).
- **Selection**: shift-drag a box around nodes to move, copy, cut, paste, duplicate or delete them; frame them in a **group**; or collapse them into a **subgraph**: one reusable node whose pins are the wires that crossed the selection. Double-click it to go inside, edit, come back out; every instance follows.
- **Behaviours**: nodes that run on a body every physics step, and react when it touches things (see below).
- **Joints**: Anchor (hinge, with an optional motor, or weld), Rope and Spring.
- **Camera**: follows an entity while playing, with smoothing and a deadzone.
- **Sensors**: Rigid Body's `sensor` checkbox makes a zone that detects overlaps but blocks nothing.
- **Examples** menu: Sandbox (the default), Plinko, Pyramid, Dominoes, Wave, Rain, Spiral, Fan, Dropper, Cradle, Car, Marble run, Marble maze, Magnet.
- **Saving**: the graph autosaves in your browser; **export** / **import** it as JSON. Undo / redo for everything.
- **Shared scripts never auto-run**: a graph you import that contains script nodes shows a banner to review or trust them first.

## Nodes

| Category  | Nodes |
| --------- | ----- |
| values    | Number, Vec2, Color, Text, Time (animation clock) |
| math      | Math, Wave, Remap, Split / Offset (vec2) |
| lists     | Range, Grid 2D (optionally staggered), Random, Count, Merge, Pick |
| shapes    | Box, Ball |
| scene     | Move, Tag, Scene, Camera |
| physics   | Rigid Body (fixed, friction, bounce, density, sensor), Anchor, Rope, Spring |
| behaviour | Behave (gives an entity behaviours), Push, Fan, Attract, Follow Pointer, Spawner, Bumper, Booster, Teleport, Remove on Enter, Switch |
| output    | Viewport |

Anything you write (**scripts** in the top bar, or ✎ and save) shows up in the node menu too. A new node starts from a template:

```js
export const title = 'Double';
export const inputs = { value: { type: 'number', default: 1 } };
export const outputs = { value: 'number' };

export function run({ value }, params, ctx) {
    return { value: value * 2 };
}
```

Pin types: `number`, `vec2`, `color`, `string`, `boolean`, `entity`, `scene`, `behavior`, `camera`, and lists of them (`vec2[]`, ...).

## Behaviours

A behaviour node is a module that exports hooks instead of `run`. Wire it into **Behave** with an entity (and give that entity a Rigid Body); while the Viewport plays, the physics worker runs the hooks on that body:

```js
export const title = 'Hop';
export const inputs = { height: { type: 'number', default: 300 } };

export function enter(self, other, world, { height }, state, hit) {
    // every time something lands on it, bounce it up
    if (hit.normal.y > 0.5) other.impulse(0, height);
}
```

| Hook | When |
| ---- | ---- |
| `setup(self, world, params, state)` | once, when play starts |
| `step(self, world, dt, params, state)` | every physics step (60 per second) |
| `enter(self, other, world, params, state, hit)` | another body starts touching this one (or overlapping it, if either is a sensor) |
| `exit(self, other, world, params, state, hit)` | ... and stops |

- `self` / `other`: a body: `id`, `tag`, `shape`, `x`, `y`, `angle`, `vx`, `vy`, `w`, `h`, `r`, `fixed`, `sensor`, `alive`, `enabled`; `accelerate(ax, ay)` (px/s², this step), `impulse(dvx, dvy)`, `setVelocity(vx, vy)`, `spin(degreesPerSecond)`, `moveTo(x, y)`, `setFixed(fixed)`, `setEnabled(on)` (off: out of the simulation and the view), `remove()`
- `hit`: `{ normal: { x, y }` (unit, from self toward other)`, speed` (px/s they met at)`, sensor }`
- `world`: `bodies`, `find(tag)`, `get(entity)` (the body made from an entity wired into this node), `spawn(entity)`, `gravity` (assignable), `pointer { x, y, down, active }`, `time`, `frame`, `rng`
- `params`: the node's inputs and params; `state`: your own object, one per body, kept between calls

Coordinates are the editor's: world pixels, +y up, angles in degrees counter-clockwise. A behaviour that throws is switched off on that body and its node turns red; the rest of the scene keeps playing.

## Controls

**Graph**

| Input | Action |
| ----- | ------ |
| drag empty space | pan (a three-finger drag on a Mac trackpad counts) |
| scroll (two fingers on a trackpad) | pan |
| pinch, ⌘ / ctrl + scroll | zoom |
| shift + drag | select nodes in a box |
| drag from a pin | wire it (drop on empty space to add a node there) |
| double-click or right-click empty space, `a` | add a node |
| double-click a subgraph's header | go inside (`esc` to come back out) |
| `⌘/ctrl + z`, `⌘/ctrl + shift + z` / `⌘/ctrl + y` | undo, redo |
| `⌘/ctrl + c` / `x` / `v`, `⌘/ctrl + d` | copy, cut, paste, duplicate |
| `⌘/ctrl + a`, `⌘/ctrl + g` | select all, group the selection |
| `del` / `backspace` | delete the selection (or the selected wire) |
| `m` | enable / disable the selection |
| `f` | fit every node in view |

**Viewport**

| Input | Building | Playing |
| ----- | -------- | ------- |
| ▶ / ■ | play | stop (everything snaps back to the graph) |
| ⤢ | full screen (`space` plays / stops, `esc` leaves) | |
| ⌖ | fit the scene | fit the scene |
| double-click | fit the scene | with a Camera: hand the view back to it; otherwise fit |
| drag | pan | grab and throw a body (or the pointer for behaviours) |
| scroll | pan | pan (takes over from a Camera) |
| pinch, ⌘ / ctrl + scroll | zoom | zoom |

## Running locally

```bash
npm install
npm run dev
```

`npm run build` writes a static site to `dist/` (`index.html` is the graph editor, `legacy.html` the legacy editor); serve it from any static web server.

To work against a local checkout of [`@n3rdw1z4rd/core`](https://github.com/n3rdw1z4rd/core), link it: `npm link ../core` (after `npm run build` in core).

## Tech stack

- **TypeScript** (strict), **Vite**
- **[@n3rdw1z4rd/smoke-ui-node-graph](https://github.com/n3rdw1z4rd/smoke-ui-node-graph)**: the node graph editor itself (canvas, widgets, selection, groups, subgraphs, code panel, undo, evaluation in a worker); apparatus plugs its Viewport node, previews and examples into it
- **[@n3rdw1z4rd/core](https://www.npmjs.com/package/@n3rdw1z4rd/core)**:
  - `core/graph`: the graph document format, node registry, evaluator, script nodes and subgraphs
  - `core/three`: `World` (entities are three.js objects with schema components), `Renderer`, `EditorCamera`, `AdaptiveGrid`, `pickEntity`
  - `Clock`, `Rng`, `WorkerInterface`, `log`, math helpers
- **[three.js](https://threejs.org)** renders the viewports (an orthographic camera; 3D output comes later)
- **[Rapier](https://rapier.rs)** (`@dimforge/rapier2d`, WASM) for physics, in a Web Worker, with behaviours running next to it
- **[smoke-ui](https://github.com/n3rdw1z4rd/smoke-ui)** for the reactive UI; **CodeMirror 6** for code

## How it works

1. **The graph is a document.** Nodes, links, groups, subgraphs and your scripts, as JSON (`n3rdw1z4rd.graph`). Every edit is an undoable change to it.
2. **A worker evaluates it.** The evaluation worker compiles script nodes (from `data:` URL imports), evaluates only what the outputs need, and reports each node's result, state and timing back. The canvas draws the states; a node's footer shows a preview of its output.
3. **The Viewport runs the scene.** The scene the graph evaluates to (plain data: entities with shapes, bodies, behaviours and joints) is diffed by entity id into a three.js `World`, so editing a value updates the view in place instead of rebuilding it.
4. **Play hands the bodies to Rapier.** Bodies, joints and behaviours go to the physics worker, which steps at 60 Hz, runs behaviour hooks (and dispatches collision events to the bodies that listen), and posts positions back in a transferred buffer. Animated nodes keep re-evaluating meanwhile. Stop puts everything back as the graph says.

## Project structure

```
src/graph/                   # apparatus's graph editor (index.html), on smoke-ui-node-graph
├── main.tsx                 # configures the editor: nodes, worker, examples menu, Viewport plugin
├── viewport.ts              # the Viewport node's body: engine, play, full screen, picking, outlines
├── previews.ts              # footer previews for scenes, entities, behaviours, cameras
├── editor/
│   ├── examples.ts          # the Examples menu
│   └── highlight.ts         # which node made an entity; the entities a selection runs through
├── scene-nodes.ts           # Box, Ball, Rigid Body, Move, Tag, Scene, Camera, Viewport
├── joints.ts                # Anchor, Rope, Spring
├── behaviors.ts             # the behaviour nodes, their API, and the behaviour module kind
├── engine.ts                # runs a scene: World diffing, play / stop, camera, input
├── joint-view.ts            # draws ropes, springs and anchors
├── highlight-view.ts        # outlines around selected entities
└── eval.worker.ts           # evaluates the graph off the main thread (serveGraphEvaluation)
src/physics/                 # Rapier + behaviours in a Web Worker (shared by both editors)
src/render/renderer.ts       # three.js scene drawing (shared)
src/main.tsx, app/, ui/,
input/, core/                # the legacy editor (legacy.html)
```

## Legacy editor

The original apparatus: place parts by hand, press play, and optionally drive the scene with a script. It lives at [`legacy.html`](https://apparatus.n3rdw1z4rd.cloud/legacy.html).

- **Build** mode: place boxes, balls and walls (snapped to the grid), drag them, tweak size, angle, color, friction, bounce, density in the inspector, pin them in place
- **Play** mode: Rapier simulates the scene; grab and throw bodies; stop and everything snaps back
- A dockable control panel (scene, parts, tree, inspector, physics, view, script, share, layout), a mobile-friendly action bar, presets (sandbox, pyramid, dominoes, plinko, fan)
- The whole scene lives in the URL (`?s=`, deflated JSON) and exports / imports as JSON

**Keyboard:** `space` play / stop · `p` pause · `.` one step · `esc` stop or deselect · `b` / `o` / `w` add a box / ball / wall · `d` duplicate · `del` delete · `[` / `]` rotate 15° · `f` fit · `g` / `r` move / rotate gizmo · `v` 2D / 3D view · `e` script editor · `tab` panel · `h` hide the UI

**Scene scripts** are ES modules with optional `build(scene)` (generates parts), `setup(world)` and `step(world, dt)` (run during play, in the physics worker). Units are world pixels with y pointing down, and seconds:

```js
export function build(scene) {
    const g = scene.grid;
    for (let i = 0; i < 10; i++) scene.box({ x: i * 2 * g, y: -i * g, w: 2 * g, h: g, fixed: true });
}

export function step(world, dt) {
    for (const fan of world.find('fan')) { /* … */ }
}
```

`scene` has `box(opts)`, `ball(opts)`, `parts`, `grid` and a seeded `rng`; `world` has `bodies` (with `accelerate`, `impulse`, `setVelocity`, `moveTo`, `remove`), `find(tag)`, `spawn(part)`, `gravity`, `pointer`, `time`, `frame` and `rng`. A script that throws is stopped (play carries on), one stuck in a loop gets the worker replaced after 3 s, and shared scripts never run until you trust them.

---

*Part of a long-running collection of from-scratch graphics and simulation experiments; the shared engine code lives in [`@n3rdw1z4rd/core`](https://www.npmjs.com/package/@n3rdw1z4rd/core).*
