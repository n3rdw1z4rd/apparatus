# apparatus — architecture

Apparatus is becoming a browser **visual scene editor / IDE**: build a scene out of entities
and components, attach scripts (code or node graphs), press play. The original 2D physics
sandbox survives as sample scenes (sandbox, pyramid, dominoes, plinko, fan) — and as the
regression test: if plinko still runs, the generalization worked.

This file records the decisions; it changes when they do.

## Decisions

| Area | Decision |
| --- | --- |
| Rendering | **three.js for everything.** 3D from the start; a "2D" scene is the same renderer with an `OrthographicCamera`, locked z, and Rapier2D. |
| Entities | **`@n3rdw1z4rd/core/three` `World`** — entities are `Object3D`s with components in `userData` (core's `three/ecs`). |
| Ids | **`Object3D.uuid`**, saved with the scene, so references (graphs, `entity` fields) survive save/load. |
| Hierarchy | **The three.js scene graph.** Parenting is `World.reparent`; the hierarchy panel walks `World.childrenOf`. |
| Transform | **On the `Object3D`** (`position`/`rotation`/`scale`). No Transform component. |
| Components | **Declared with a schema** — a class with `@component` / `@field` (standard decorators), or `defineComponent()` for plain data. The inspector, serializer and graph nodes are generated from schemas. |
| Decorators | Lowered by `decorators()` from `@n3rdw1z4rd/core/vite` (Vite 8's Oxc doesn't lower standard decorators). |
| Scene format | `World.serialize()` → `SceneDoc` (plain JSON: entities depth-first + `meta`). Unknown component types are kept as saved. Old `PartDef` scenes/links are migrated on load. |
| Rendering of components | Visuals are **rebuilt from components** by render systems (non-entity child meshes); only entities are saved. |
| Scripts & physics | **Stay in the worker** (watchdog + trust gate). The worker owns a plain-data mirror of the entities, runs physics and scripts, and posts transforms back each frame; the main thread applies them to the `Object3D`s. Build-mode edits happen on the main thread. |
| Physics | A **system**, not the app: runs for entities with a RigidBody. Backend per scene: Rapier2D or Rapier3D. |
| Scripts | **Per-entity script components** (plus an optional scene script), ES modules with `setup` / `step` (and `build` at scene level). |
| Graphs | **Compile to the same script modules** — visual and hand-written scripts are interchangeable, and a graph can be ejected to code. |
| Core | Everything reusable goes into `@n3rdw1z4rd/core`; three.js-related code into `core/src/three`. |
| Coordinates | The editor uses three.js conventions: **+y up, angles counter-clockwise**. The legacy `PartDef` format (shared links, presets, scene scripts, the physics worker) is still +y down / clockwise; `core/components.ts` (`addPart` / `partOf`) and the frame/pointer messages in `store.ts` / `stage-input.ts` are the only places that flip. Goes away when scenes move to `SceneDoc` (step 5) and scripts get the new API (step 6). |
| Linking core | During the refactor apparatus depends on `file:../core`; Vite's `resolve.dedupe: ['three']` keeps one three.js (core has its own in `node_modules`). Build core (`npm run build` in core) after changing it. Back to a version range once core is published. |
| Play / stop | Play snapshots the world (`World.serialize`); stop `load`s it back, so entities keep their uuids and the selection survives. The worker names bodies by number (1..n per play, spawned ≥ `SPAWN_ID_BASE`), mapped in `store.ts`. |
| UI | smoke-ui. The panel stays *described as data* (`controls.ts`) and rendered by `controls-dom`. |
| World → UI | `app/world-signals.ts` turns `World` events into two smoke-ui signals: `worldRevision` (any change; the inspector pulls on it) and `treeRevision` (structure and names; the tree rebuilds on it, at most once a frame). |
| Signals | **UI / editor state uses smoke-ui's `Signal`** — its `get()` registers reads with the tracker, which `computed` and JSX bindings rely on. A core `Signal` read inside `computed` is *not* tracked, so core signals don't appear in UI code. Core stays UI-agnostic: `World` reports changes through its own events (`world.on(...)`), and apparatus adapts those into smoke-ui signals for the panels. Core's `Signal` remains for non-UI uses (e.g. in workers). |
| ECS | **core's `three/ecs` + `World` is canonical** for apparatus (modified in core as needed). Core's class-keyed `ECS` stays for particles and other users; apparatus stops using it. |

## Plan

1. **Core** — `World` registry (uuid ids, component index, events, systems), component
   schemas + `@field`, scene serialization, `decorators()` Vite plugin. ✅ (core
   `feature/scene-editor`)
2. **Renderer** — three.js renderer (World root is the scene; part visuals are rebuilt from
   components), core `EditorCamera` (ortho 2D view / perspective orbitable 3D view, `v`),
   `AdaptiveGrid`, raycast picking (`pickEntity`), `TransformControls` gizmo (`g` / `r`).
   Apparatus moved off core's class-keyed ECS onto `World`. ✅
3. **Editor panels** — **tree** tab (every entity, nested by the three.js hierarchy; filter;
   tap to select, double-tap to inspect; `+ entity` adds an empty one) and an **inspector
   generated from component schemas** (`app/inspector.ts`: one control group per registered
   type, one control per field — number → slider when it has min and max, enum → choice,
   vec2/vec3 → x/y/z, `showIf` for conditional fields), remove (×) and add-component. ✅
   - Known gaps until step 5: shared links / JSON still use the legacy parts format, so empty
     entities and entities without a Shape + RigidBody aren't saved there; parenting isn't
     exposed (the 2D physics treats every part as top-level).
4. **Worker** — generic entity mirror; physics system with a per-scene Rapier backend.
5. **Port the presets** to the new scene model (migration for old links).
6. **Scripts** — per-entity script components.
7. **Graphs** — node graph document, editor, compiler → script modules.

## Node graph (`feature/node-graph`)

A second page, **`graph.html`**, where the scene *is* a node graph (the scene editor at
`index.html` keeps working alongside it).

| Area | Decision |
| --- | --- |
| Model | **Dataflow, like ComfyUI.** The graph evaluates to a `SceneData` object; the engine runs it (Godot-style: data in, engine runs). |
| Nodes | **A node is a function with a typed interface** — `inputs` (pins), `params` (widgets), `outputs`, `run(inputs, params, ctx)`. Logic is code, written by hand; the graph only wires data. Built-ins are TS (`defineNode`); **script nodes** are ES modules with the same exports, written in the editor and saved inside the graph document (`doc.scripts`). |
| Core | Format, types, registry, script compiler and evaluator live in **`@n3rdw1z4rd/core/graph`** (no DOM; tested in Node). Scene nodes, engine and editor live here. |
| Evaluation | Lazy (only what Output nodes need), memoized (only changed nodes and their downstream re-run), **list broadcasting** (a list into a plain pin runs the node per item), `type[]` list ports, `multi` list inputs (several links, concatenated), errors stay local. |
| Animation | **Optional per node, default off** (the Time node defaults on). While the viewport plays, animated nodes re-run every frame with `ctx.time` / `dt` / `frame` and their downstream follows; everything else stays cached. No animated node → no per-frame work. |
| Output | The **Viewport** node hosts the engine: live preview while building, ▶ to play (physics in the worker; physics owns bodies, the graph keeps driving everything else), resizable, full screen (`⤢`, esc to leave, space plays). |
| Engine | `src/graph/engine.ts`: diffs scene entities by id (`<node id>:<index>`) into a core `World`, draws with the existing three.js renderer, plays with the existing Rapier worker. |
| Editor | `src/graph/editor/`: DOM nodes + SVG wires, pan/zoom (drag, wheel, pinch), wire dragging with type checks (compatible pins light up), drop a wire on empty space → node menu filtered to nodes that take it, inline widgets for unconnected inputs (numbers scrub by dragging), undo/redo, autosave (localStorage), export/import JSON. Graphs from files don't run their scripts until trusted. |

Next: graph evaluation in a worker (watchdog for script nodes), behaviours (per-entity scripts
with exec flow), subgraphs, 3D output.
