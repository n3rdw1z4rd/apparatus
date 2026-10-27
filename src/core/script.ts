/**
 * A scene script is a plain ES module. Every export is optional:
 *
 *   export function build(scene) { ... }     // generate parts ("run build")
 *   export function setup(world) { ... }     // when Play starts
 *   export function step(world, dt) { ... }  // every physics step during Play
 *
 * Scripts are compiled and run inside the physics worker, so a script stuck
 * in a loop can't freeze the page (the worker is replaced).
 */
export interface ScriptHooks {
    build?: (scene: any) => void;
    setup?: (world: any) => void;
    step?: (world: any, dt: number) => void;
}

export const HOOK_NAMES = ['build', 'setup', 'step'] as const;

export async function compileScript(source: string): Promise<ScriptHooks> {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));

    try {
        const mod = await import(/* @vite-ignore */ url);
        const hooks: ScriptHooks = {};

        for (const name of HOOK_NAMES) {
            if (mod[name] === undefined) continue;
            if (typeof mod[name] !== 'function') throw new Error(`export "${name}" must be a function`);
            (hooks as any)[name] = mod[name];
        }

        return hooks;
    } finally {
        URL.revokeObjectURL(url);
    }
}

export function describeError(err: unknown): string {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    return String(err);
}

/** Cheap check (no compile) for which hooks a source seems to export. */
export function exportsHook(source: string, name: (typeof HOOK_NAMES)[number]): boolean {
    return new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b|export\\s+(const|let|var)\\s+${name}\\b`).test(source);
}

/* ------------------------------------------------------------------ */
/* Examples                                                             */
/* ------------------------------------------------------------------ */

export const API_DOC = `// ── Scene script ────────────────────────────────────────────────
// A plain ES module, run in the physics worker. Every export is optional.
// Units: world pixels (y down), seconds; one grid cell (scene.grid px) is 1 m.
//
//   build(scene)        "run build": generate parts. They're marked as
//                       generated and replaced the next time build runs;
//                       parts you placed by hand are kept.
//     scene.box({ x, y, w, h, angle?, color?, fixed?, friction?, bounce?, density?, tag? })
//     scene.ball({ x, y, r, ...same options })
//     scene.parts       the hand-placed parts (read-only copies)
//     scene.grid        grid cell size, px
//     scene.rng         seeded: nextFloat(), range(a, b), pick(array), chance(p)
//
//   setup(world)        when Play starts
//   step(world, dt)     every physics step during Play
//     world.bodies      every body: { id, tag, shape, x, y, angle, vx, vy,
//                       w, h, r, fixed, accelerate(ax, ay), impulse(dvx, dvy),
//                       setVelocity(vx, vy), moveTo(x, y), remove() }
//     world.find(tag)   bodies with that tag
//     world.spawn(part) add a part while playing (same fields as scene.box)
//     world.gravity     { x, y } m/s² — assignable
//     world.pointer     { x, y, down, active } in world px
//     world.time, world.frame, world.rng
// ─────────────────────────────────────────────────────────────────
`;

export const SCRIPT_EXAMPLES: { name: string; source: string }[] = [
    {
        name: 'Template',
        source: `${API_DOC}
export function build(scene) {
    // e.g. a row of boxes:
    // for (let i = 0; i < 5; i++) scene.box({ x: i * scene.grid, y: 0, w: scene.grid, h: scene.grid });
}

export function setup(world) {}

export function step(world, dt) {}
`,
    },
    {
        name: 'Staircase (build)',
        source: `${API_DOC}
export function build(scene) {
    const g = scene.grid;
    for (let i = 0; i < 10; i++) {
        scene.box({ x: -6 * g + i * 2 * g, y: 7 * g - i * g, w: 2 * g, h: g, fixed: true, color: '#5b6b73' });
    }
    for (let i = 0; i < 6; i++) {
        scene.ball({ x: 12 * g - i * g, y: -6 * g - i * g, r: g / 3, color: scene.rng.pick(['#e8554e', '#f2a541', '#3fd1a4']), bounce: 0.5 });
    }
}
`,
    },
    {
        name: 'Random tower (build)',
        source: `${API_DOC}
export function build(scene) {
    const g = scene.grid;
    let y = 7 * g;
    for (let i = 0; i < 14; i++) {
        const w = scene.rng.range(2, 6) * g;
        const h = scene.rng.range(1, 2) * g / 2;
        y -= h / 2;
        scene.box({ x: (scene.rng.nextFloat() - 0.5) * g, y, w, h, color: scene.rng.pick(['#e8554e', '#f2a541', '#f4d35e', '#4ea8de', '#9b6dde']) });
        y -= h / 2;
    }
}
`,
    },
    {
        name: 'Pointer magnet (step)',
        source: `${API_DOC}
// Hold the pointer down on empty space during Play to pull everything toward it.
export function step(world, dt) {
    const p = world.pointer;
    if (!p.down) return;
    for (const b of world.bodies) {
        if (b.fixed) continue;
        const dx = p.x - b.x, dy = p.y - b.y;
        const d = Math.max(32, Math.hypot(dx, dy));
        b.accelerate(dx / d * 2500, dy / d * 2500);
    }
}
`,
    },
    {
        name: 'Rain (step)',
        source: `${API_DOC}
let t = 0;
export function step(world, dt) {
    t -= dt;
    if (t > 0 || world.bodies.length > 400) return;
    t = 0.05;
    world.spawn({ shape: 'ball', x: (world.rng.nextFloat() - 0.5) * 1200, y: -500, r: 4 + world.rng.nextFloat() * 6, color: '#4ea8de', bounce: 0.2 });
}
`,
    },
    {
        name: 'Gravity flip (step)',
        source: `${API_DOC}
// Gravity rotates slowly around the circle.
export function step(world) {
    const a = world.time * 0.5 + Math.PI / 2;
    world.gravity = { x: Math.cos(a) * 9.81, y: Math.sin(a) * 9.81 };
}
`,
    },
];
