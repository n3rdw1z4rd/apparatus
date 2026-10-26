import { addNode, connect, createGraph, type GraphDoc, type GraphNode, type NodeRegistry } from '@n3rdw1z4rd/core/graph';

/* ------------------------------------------------------------------ */
/* Example graphs (the Examples menu). Coordinates are the editor's:    */
/* world px, +y up, angles in degrees counter-clockwise. The first is   */
/* the default: the original apparatus sandbox scene.                   */
/* ------------------------------------------------------------------ */

export interface Example {
    id: string;
    label: string;
    description: string;
    make: (registry: NodeRegistry) => GraphDoc;
}

const G = 32;
const FIXED = '#5b6b73';
const PALETTE = ['#e8554e', '#f2a541', '#f4d35e', '#3fd1a4', '#4ea8de', '#9b6dde', '#e86fb0', '#d3d3d3'];

type Node = GraphNode;

/** A small DSL for laying out example graphs. */
function builder(registry: NodeRegistry) {
    const g = createGraph();
    const add = (type: string, x: number, y: number, values: Record<string, unknown> = {}) => {
        const def = registry.get(type);
        if (!def) throw new Error(`example uses an unknown node type: ${type}`);
        return addNode(g, def, [x, y], values);
    };
    const link = (a: Node, out: string, b: Node, inp: string) => connect(g, registry, { node: a.id, port: out }, { node: b.id, port: inp });
    /** shape → Rigid Body, at column x, row y; returns the body */
    const body = (shape: Node, x: number, y: number, values: Record<string, unknown> = {}) => {
        const b = add('physics/body', x, y, values);
        link(shape, 'entity', b, 'entity');
        return b;
    };
    /** Scene + Viewport, wired */
    const output = (x: number, y: number, inputs: Node[], sceneValues: Record<string, unknown> = {}) => {
        const scene = add('scene/scene2d', x, y, sceneValues);
        for (const n of inputs) link(n, 'entity', scene, 'entities');
        const view = add('output/viewport', x + 250, Math.max(0, y - 180));
        view.size = [520, 440];
        link(scene, 'scene', view, 'scene');
        return scene;
    };
    /** adds a script node type to the graph (with its source) and registers it for layout */
    const script = (type: string, source: string, spec: Parameters<NodeRegistry['register']>[0]) => {
        g.scripts = { ...(g.scripts ?? {}), [type]: source };
        if (!registry.get(type)) registry.register(spec);
    };
    return { g, add, link, body, output, script };
}

/* ── sandbox: the original apparatus scene ───────────────────────── */

function sandbox(registry: NodeRegistry): GraphDoc {
    const { g, add, body, output } = builder(registry);
    const row = 200;
    const parts = [
        body(add('shape/box', 0, 0, { at: { x: 0, y: -8 * G }, size: { x: 64 * G, y: G }, color: FIXED }), 240, 0, { fixed: true }),
        body(add('shape/box', 0, row, { at: { x: G / 2, y: -G / 2 }, size: { x: G, y: G }, color: '#e8554e' }), 240, row, { fixed: true }),
        body(add('shape/ball', 0, row * 2, { at: { x: 6.5 * G, y: 3.5 * G }, radius: G / 2, color: '#f2a541' }), 240, row * 2, { bounce: 0.6 }),
        body(add('shape/box', 0, row * 3, { at: { x: 3 * G, y: -2.5 * G }, size: { x: 4 * G, y: 3 * G }, color: '#4ea8de' }), 240, row * 3),
        body(add('shape/box', 0, row * 4, { at: { x: -8 * G, y: 7.5 * G }, size: { x: 8 * G, y: G }, color: '#e86fb0' }), 240, row * 4),
        body(add('shape/box', 0, row * 5, { at: { x: 8 * G, y: 7.5 * G }, size: { x: 8 * G, y: G }, color: '#e86fb0' }), 240, row * 5),
    ];
    output(500, 480, parts);
    return g;
}

/* ── plinko ──────────────────────────────────────────────────────── */

function plinko(registry: NodeRegistry): GraphDoc {
    const { g, add, link, body, output } = builder(registry);
    const pegGrid = add('list/grid2d', 0, 0, { cols: 13, rows: 7, spacing: { x: 40, y: 40 }, center: { x: 0, y: 20 }, stagger: true });
    const peg = add('shape/ball', 260, 0, { radius: 4, color: FIXED });
    link(pegGrid, 'points', peg, 'at');
    const pegs = body(peg, 500, 0, { fixed: true });

    const floor = body(add('shape/box', 260, 230, { at: { x: 0, y: -200 }, size: { x: 620, y: 20 }, color: FIXED }), 500, 230, { fixed: true });

    const dropGrid = add('list/grid2d', 0, 420, { cols: 7, rows: 2, spacing: { x: 22, y: 22 }, center: { x: 6, y: 210 } });
    const drop = add('shape/ball', 260, 420, { radius: 8, color: '#f2a541' });
    link(dropGrid, 'points', drop, 'at');
    const balls = body(drop, 500, 420, { bounce: 0.4 });

    // an animated spinner (no body: it only draws, so the graph keeps driving it while playing)
    const time = add('value/time', 0, 650);
    const turn = add('math/math', 260, 650, { b: 90, op: '×' });
    const spinner = add('shape/box', 500, 650, { at: { x: 0, y: 280 }, size: { x: 120, y: 8 }, color: '#3fd1a4' });
    link(time, 'time', turn, 'a');
    link(turn, 'result', spinner, 'angle');

    output(760, 300, [pegs, floor, balls, spinner]);
    return g;
}

/* ── pyramid (a script node lays out the rows) ───────────────────── */

const PYRAMID_SCRIPT = `// Pyramid: the box positions of a stacked pyramid, and a color per row.
export const title = 'Pyramid';
export const description = 'points and row colors for a stacked pyramid';
export const inputs = {
    rows: { type: 'number', default: 12, min: 1, step: 1 },
    size: { type: 'number', default: 32, min: 1 },
    base: { type: 'vec2', default: { x: 0, y: -224 } },
};
export const outputs = { points: 'vec2[]', colors: 'color[]' };

const PALETTE = ${JSON.stringify(PALETTE)};

export function run({ rows, size, base }) {
    const points = [], colors = [];
    for (let row = 0; row < rows; row++) {
        const n = rows - row;
        for (let i = 0; i < n; i++) {
            points.push({ x: base.x + (i - (n - 1) / 2) * size, y: base.y + row * size });
            colors.push(PALETTE[row % PALETTE.length]);
        }
    }
    return { points, colors };
}
`;

function pyramid(registry: NodeRegistry): GraphDoc {
    const { g, add, link, body, output, script } = builder(registry);
    script('examples/pyramid', PYRAMID_SCRIPT, {
        type: 'examples/pyramid', title: 'Pyramid', category: 'scripts', source: PYRAMID_SCRIPT,
        inputs: { rows: { type: 'number', default: 12 }, size: { type: 'number', default: 32 }, base: { type: 'vec2', default: { x: 0, y: -224 } } },
        outputs: { points: 'vec2[]', colors: 'color[]' },
        run: () => ({}),
    });
    const layout = add('examples/pyramid', 0, 0);
    const box = add('shape/box', 260, 0, { size: { x: G, y: G } });
    link(layout, 'points', box, 'at');
    link(layout, 'colors', box, 'color');
    const boxes = body(box, 500, 0, { friction: 0.7 });

    const floor = body(add('shape/box', 260, 230, { at: { x: 0, y: -8 * G }, size: { x: 64 * G, y: G }, color: FIXED }), 500, 230, { fixed: true });
    const ramp = body(add('shape/box', 260, 440, { at: { x: -26 * G, y: 4.5 * G }, size: { x: 10 * G, y: G / 2 }, angle: -20, color: FIXED }), 500, 440, { fixed: true });
    const ball = body(add('shape/ball', 260, 660, { at: { x: -24 * G, y: 6 * G }, radius: G, color: '#d3d3d3' }), 500, 660, { density: 8 });
    output(760, 300, [boxes, floor, ramp, ball]);
    return g;
}

/* ── dominoes ────────────────────────────────────────────────────── */

const PALETTE_SCRIPT = `// Palette: n colors, cycling through the apparatus palette.
export const title = 'Palette';
export const inputs = { count: { type: 'number', default: 8, min: 0, step: 1 } };
export const outputs = { colors: 'color[]' };

const PALETTE = ${JSON.stringify(PALETTE)};

export function run({ count }) {
    return { colors: Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => PALETTE[i % PALETTE.length]) };
}
`;

function dominoes(registry: NodeRegistry): GraphDoc {
    const { g, add, link, body, output, script } = builder(registry);
    script('examples/palette', PALETTE_SCRIPT, {
        type: 'examples/palette', title: 'Palette', category: 'scripts', source: PALETTE_SCRIPT,
        inputs: { count: { type: 'number', default: 8 } }, outputs: { colors: 'color[]' }, run: () => ({}),
    });
    const row = add('list/grid2d', 0, 0, { cols: 30, rows: 1, spacing: { x: 1.25 * G, y: G }, center: { x: 4, y: -6.5 * G } });
    const colors = add('examples/palette', 0, 230, { count: 30 });
    const domino = add('shape/box', 260, 0, { size: { x: G / 4, y: 2 * G } });
    link(row, 'points', domino, 'at');
    link(colors, 'colors', domino, 'color');
    const dominos = body(domino, 500, 0, { friction: 0.4, bounce: 0 });

    const floor = body(add('shape/box', 260, 330, { at: { x: 0, y: -8 * G }, size: { x: 80 * G, y: G }, color: FIXED }), 500, 330, { fixed: true });
    const ramp = body(add('shape/box', 260, 540, { at: { x: -24 * G, y: -4 * G }, size: { x: 8 * G, y: G / 2 }, angle: -28.6, color: FIXED }), 500, 540, { fixed: true });
    const ball = body(add('shape/ball', 260, 760, { at: { x: -27 * G, y: 0 }, radius: G / 2, color: '#f4d35e' }), 500, 760, { density: 4 });
    output(760, 300, [dominos, floor, ramp, ball]);
    return g;
}

/* ── wave: animation with broadcasting, no physics ───────────────── */

function wave(registry: NodeRegistry): GraphDoc {
    const { g, add, link, output } = builder(registry);
    const row = add('list/grid2d', 0, 0, { cols: 32, rows: 1, spacing: { x: 20, y: 20 } });
    const split = add('vec2/split', 260, 0);
    link(row, 'points', split, 'vec');
    const time = add('value/time', 0, 250);
    const phase = add('math/math', 260, 160, { b: 0.004, op: '×' });   // x × 0.004
    link(split, 'x', phase, 'a');
    const t = add('math/math', 500, 160, { op: '+' });                  // time + phase
    link(time, 'time', t, 'a');
    link(phase, 'result', t, 'b');
    const w = add('math/wave', 740, 160, { period: 1.5, amplitude: 80 });
    link(t, 'result', w, 't');
    const at = add('value/vec2', 980, 0);
    link(split, 'x', at, 'x');
    link(w, 'value', at, 'y');
    const box = add('shape/box', 1220, 0, { size: { x: 14, y: 14 }, color: '#4ea8de' });
    link(at, 'vec', box, 'at');
    const spin = add('math/math', 980, 300, { b: 120, op: '×' });
    link(w, 'value', spin, 'a');
    link(spin, 'result', box, 'angle');
    output(1460, 300, [box]);
    return g;
}

/* ── rain: seeded random positions and sizes ─────────────────────── */

function rain(registry: NodeRegistry): GraphDoc {
    const { g, add, link, body, output } = builder(registry);
    const xs = add('list/random', 0, 0, { count: 60, min: -300, max: 300, seed: 1 });
    const ys = add('list/random', 0, 230, { count: 60, min: 200, max: 900, seed: 2 });
    const rs = add('list/random', 0, 460, { count: 60, min: 4, max: 13, seed: 3 });
    const at = add('value/vec2', 260, 0);
    link(xs, 'numbers', at, 'x');
    link(ys, 'numbers', at, 'y');
    const drop = add('shape/ball', 500, 0, { color: '#4ea8de' });
    link(at, 'vec', drop, 'at');
    link(rs, 'numbers', drop, 'radius');
    const drops = body(drop, 740, 0, { bounce: 0.35 });

    const left = body(add('shape/box', 500, 260, { at: { x: -150, y: 40 }, size: { x: 320, y: 12 }, angle: -15, color: FIXED }), 740, 260, { fixed: true });
    const right = body(add('shape/box', 500, 480, { at: { x: 160, y: -100 }, size: { x: 320, y: 12 }, angle: 15, color: FIXED }), 740, 480, { fixed: true });
    const floor = body(add('shape/box', 500, 700, { at: { x: 0, y: -260 }, size: { x: 760, y: 20 }, color: FIXED }), 740, 700, { fixed: true });
    output(1000, 300, [drops, left, right, floor]);
    return g;
}

/* ── spiral: a script node writes the layout ─────────────────────── */

const SPIRAL_SCRIPT = `// Spiral: points along an Archimedean spiral. Edit me (✎) and save to see the scene change.
export const title = 'Spiral';
export const description = 'points along a spiral';
export const inputs = {
    count: { type: 'number', default: 70, min: 2, step: 1 },
    turns: { type: 'number', default: 3, step: 0.25 },
    radius: { type: 'number', default: 230 },
    center: { type: 'vec2', default: { x: 0, y: 20 } },
};
export const outputs = { points: 'vec2[]' };

export function run({ count, turns, radius, center }) {
    const points = [];
    for (let i = 1; i < count; i++) {
        const t = i / (count - 1);
        const a = t * turns * Math.PI * 2;
        points.push({ x: center.x + Math.cos(a) * radius * t, y: center.y + Math.sin(a) * radius * t });
    }
    return { points };
}
`;

function spiral(registry: NodeRegistry): GraphDoc {
    const { g, add, link, body, output, script } = builder(registry);
    script('examples/spiral', SPIRAL_SCRIPT, {
        type: 'examples/spiral', title: 'Spiral', category: 'scripts', source: SPIRAL_SCRIPT,
        inputs: { count: { type: 'number', default: 70 }, turns: { type: 'number', default: 3 }, radius: { type: 'number', default: 230 }, center: { type: 'vec2', default: { x: 0, y: 20 } } },
        outputs: { points: 'vec2[]' }, run: () => ({}),
    });
    const layout = add('examples/spiral', 0, 0);
    const peg = add('shape/ball', 260, 0, { radius: 5, color: '#9b6dde' });
    link(layout, 'points', peg, 'at');
    const pegs = body(peg, 500, 0, { fixed: true });

    const dropGrid = add('list/grid2d', 0, 300, { cols: 9, rows: 3, spacing: { x: 18, y: 18 }, center: { x: 0, y: 340 } });
    const drop = add('shape/ball', 260, 300, { radius: 7, color: '#f4d35e' });
    link(dropGrid, 'points', drop, 'at');
    const balls = body(drop, 500, 300, { bounce: 0.5 });
    const floor = body(add('shape/box', 260, 540, { at: { x: 0, y: -300 }, size: { x: 700, y: 20 }, color: FIXED }), 500, 540, { fixed: true });
    output(760, 300, [pegs, balls, floor]);
    return g;
}

export const EXAMPLES: Example[] = [
    { id: 'sandbox', label: 'Sandbox', description: 'the original apparatus scene', make: sandbox },
    { id: 'plinko', label: 'Plinko', description: 'pegs from a staggered grid, balls to drop, an animated spinner', make: plinko },
    { id: 'pyramid', label: 'Pyramid', description: 'a script node stacks the boxes; a wrecking ball rolls in', make: pyramid },
    { id: 'dominoes', label: 'Dominoes', description: 'a row of dominoes, a ramp and a ball to start it', make: dominoes },
    { id: 'wave', label: 'Wave', description: 'animation only: time + broadcasting moves a row of boxes', make: wave },
    { id: 'rain', label: 'Rain', description: 'seeded random positions and sizes, two ramps', make: rain },
    { id: 'spiral', label: 'Spiral', description: 'a script node lays the pegs out on a spiral', make: spiral },
];

export const DEFAULT_EXAMPLE = EXAMPLES[0];
