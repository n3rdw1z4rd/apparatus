import { clamp, Rng } from '@n3rdw1z4rd/core';

/* ------------------------------------------------------------------ */
/* A scene is plain data: everything needed to rebuild the world.       */
/*                                                                      */
/* Units: positions and sizes are world pixels (y points down); one     */
/* PX_PER_M pixels is one meter for the physics, so gravity and the     */
/* rest of the physical parameters are in SI units.                     */
/* ------------------------------------------------------------------ */

/** World pixels per physics meter (one default grid cell = one meter). */
export const PX_PER_M = 32;

export type PartShape = 'box' | 'ball';

export interface PartDef {
    shape: PartShape;
    /** center, world px */
    x: number;
    y: number;
    /** box size, world px */
    w?: number;
    h?: number;
    /** ball radius, world px */
    r?: number;
    /** radians, clockwise */
    angle?: number;
    color?: string;
    /** immovable (walls, floors, pegs) */
    fixed?: boolean;
    friction?: number;
    /** restitution, 0 = dead, 1 = perfectly bouncy */
    bounce?: number;
    /** kg/m² */
    density?: number;
    /** free-form label scripts can look parts up by */
    tag?: string;
    /** made by the script's build(); replaced the next time build runs */
    gen?: boolean;
}

export interface SceneConfig {
    v: 1;
    name: string;
    /** seeds `scene.rng` / `world.rng` for scripts */
    seed: number;
    /** m/s², +y is down */
    gravity: { x: number; y: number };
    /** grid cell size in world px */
    grid: number;
    snap: boolean;
    parts: PartDef[];
    /** an ES module with optional build / setup / step exports */
    script: string;
}

export const PART_DEFAULTS = {
    friction: 0.5,
    bounce: 0.1,
    density: 1,
} as const;

export const PALETTE = ['#e8554e', '#f2a541', '#f4d35e', '#3fd1a4', '#4ea8de', '#9b6dde', '#e86fb0', '#d3d3d3'];
export const FIXED_COLOR = '#5b6b73';

export function randomSeed(): number {
    return (Math.random() * 0x7fffffff) | 0;
}

/* ------------------------------------------------------------------ */
/* Normalization: anything from a URL, a file or a script is untrusted  */
/* ------------------------------------------------------------------ */

const num = (v: unknown, fallback: number, min = -1e6, max = 1e6): number =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;

const COLOR_RE = /^#[0-9a-f]{3,8}$|^[a-z]{3,20}$|^(rgb|hsl)a?\([\d\s.,%]+\)$/i;

export function normalizePart(raw: any): PartDef | null {
    if (!raw || typeof raw !== 'object') return null;
    const shape: PartShape = raw.shape === 'ball' || raw.shape === 'circle' ? 'ball' : 'box';
    const part: PartDef = {
        shape,
        x: num(raw.x, 0),
        y: num(raw.y, 0),
    };

    if (shape === 'box') {
        part.w = num(raw.w ?? raw.width, PX_PER_M, 1, 1e5);
        part.h = num(raw.h ?? raw.height, PX_PER_M, 1, 1e5);
    } else {
        part.r = num(raw.r ?? raw.radius, PX_PER_M / 2, 0.5, 5e4);
    }

    const angle = num(raw.angle ?? raw.rotation, 0, -1e3, 1e3);
    if (angle) part.angle = angle;
    if (typeof raw.color === 'string' && COLOR_RE.test(raw.color)) part.color = raw.color;
    if (raw.fixed) part.fixed = true;
    if (raw.friction !== undefined) part.friction = num(raw.friction, PART_DEFAULTS.friction, 0, 10);
    if (raw.bounce !== undefined) part.bounce = num(raw.bounce, PART_DEFAULTS.bounce, 0, 2);
    if (raw.density !== undefined) part.density = num(raw.density, PART_DEFAULTS.density, 0.001, 1000);
    if (typeof raw.tag === 'string' && raw.tag) part.tag = raw.tag.slice(0, 40);
    if (raw.gen) part.gen = true;

    return part;
}

export function normalizeScene(raw: any): SceneConfig {
    const base = defaultScene();
    if (!raw || typeof raw !== 'object') return base;

    return {
        v: 1,
        name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : base.name,
        seed: num(raw.seed, base.seed, 0, 0x7fffffff) | 0,
        gravity: {
            x: num(raw.gravity?.x, 0, -100, 100),
            y: num(raw.gravity?.y, 9.81, -100, 100),
        },
        grid: num(raw.grid, PX_PER_M, 4, 256),
        snap: raw.snap !== undefined ? !!raw.snap : true,
        parts: Array.isArray(raw.parts) ? raw.parts.slice(0, 5000).map(normalizePart).filter((p: PartDef | null): p is PartDef => !!p) : [],
        script: typeof raw.script === 'string' ? raw.script : '',
    };
}

/** Drops default-valued fields so links stay short. */
function compactPart(p: PartDef): PartDef {
    const out: any = { shape: p.shape, x: round(p.x), y: round(p.y) };
    if (p.shape === 'box') {
        out.w = round(p.w!);
        out.h = round(p.h!);
    } else {
        out.r = round(p.r!);
    }
    if (p.angle) out.angle = Math.round(p.angle * 1e4) / 1e4;
    if (p.color) out.color = p.color;
    if (p.fixed) out.fixed = true;
    if (p.friction !== undefined && p.friction !== PART_DEFAULTS.friction) out.friction = p.friction;
    if (p.bounce !== undefined && p.bounce !== PART_DEFAULTS.bounce) out.bounce = p.bounce;
    if (p.density !== undefined && p.density !== PART_DEFAULTS.density) out.density = p.density;
    if (p.tag) out.tag = p.tag;
    if (p.gen) out.gen = true;
    return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function compactScene(scene: SceneConfig): SceneConfig {
    return { ...scene, parts: scene.parts.map(compactPart) };
}

/* ------------------------------------------------------------------ */
/* URL codec: JSON → deflate-raw → base64url (same as particles)        */
/* ------------------------------------------------------------------ */

async function pipeBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
    const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

export async function encodeScene(scene: SceneConfig): Promise<string> {
    const json = new TextEncoder().encode(JSON.stringify(compactScene(scene)));
    return toBase64Url(await pipeBytes(json, new CompressionStream('deflate-raw')));
}

export async function decodeScene(str: string): Promise<SceneConfig> {
    const bytes = await pipeBytes(fromBase64Url(str), new DecompressionStream('deflate-raw'));
    return normalizeScene(JSON.parse(new TextDecoder().decode(bytes)));
}

/** Small stable hash, used to remember which scripts the user has trusted. */
export function hashString(str: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + ':' + str.length;
}

/* ------------------------------------------------------------------ */
/* Presets                                                              */
/* ------------------------------------------------------------------ */

const G = PX_PER_M;

function floor(width = 64 * G, y = 8 * G): PartDef {
    return { shape: 'box', x: 0, y, w: width, h: G, color: FIXED_COLOR, fixed: true, tag: 'floor' };
}

export function defaultScene(): SceneConfig {
    return {
        v: 1,
        name: 'sandbox',
        seed: 1,
        gravity: { x: 0, y: 9.81 },
        grid: G,
        snap: true,
        parts: [
            floor(),
            { shape: 'box', x: G * 0.5, y: G * 0.5, w: G, h: G, color: '#e8554e', fixed: true },
            { shape: 'ball', x: G * 6.5, y: -G * 3.5, r: G / 2, color: '#f2a541', bounce: 0.6 },
            { shape: 'box', x: G * 3, y: G * 2.5, w: G * 4, h: G * 3, color: '#4ea8de' },
            { shape: 'box', x: -G * 8, y: -G * 7.5, w: G * 8, h: G, color: '#e86fb0' },
            { shape: 'box', x: G * 8, y: -G * 7.5, w: G * 8, h: G, color: '#e86fb0' },
        ],
        script: '',
    };
}

function pyramid(): SceneConfig {
    const parts: PartDef[] = [floor()];
    const rows = 12;
    for (let row = 0; row < rows; row++) {
        const n = rows - row;
        for (let i = 0; i < n; i++) {
            parts.push({
                shape: 'box',
                x: (i - (n - 1) / 2) * G,
                y: 8 * G - G / 2 - G / 2 - row * G,
                w: G, h: G,
                color: PALETTE[row % PALETTE.length],
                friction: 0.7,
            });
        }
    }
    parts.push({ shape: 'ball', x: -24 * G, y: -6 * G, r: G, color: '#d3d3d3', density: 8, tag: 'wrecking-ball' });
    parts.push({ shape: 'box', x: -26 * G, y: -4.5 * G, w: 10 * G, h: G / 2, angle: 0.35, color: FIXED_COLOR, fixed: true });
    return { ...defaultScene(), name: 'pyramid', parts };
}

function dominoes(): SceneConfig {
    const parts: PartDef[] = [floor(80 * G)];
    const count = 30;
    for (let i = 0; i < count; i++) {
        parts.push({
            shape: 'box',
            x: -18 * G + i * 1.25 * G,
            y: 8 * G - G / 2 - G,
            w: G / 4, h: G * 2,
            color: PALETTE[i % PALETTE.length],
            friction: 0.4,
            bounce: 0,
        });
    }
    // a ramp and a ball to tip the first one
    parts.push({ shape: 'box', x: -24 * G, y: 4 * G, w: 8 * G, h: G / 2, angle: 0.5, color: FIXED_COLOR, fixed: true });
    parts.push({ shape: 'ball', x: -27 * G, y: 0, r: G / 2, color: '#f4d35e', density: 4 });
    return { ...defaultScene(), name: 'dominoes', parts };
}

const PLINKO_SCRIPT = `// Plinko: build() lays out the pegs, step() keeps dropping balls.
// Press "run build" to regenerate the board, then play (space).

export function build(scene) {
    const g = scene.grid;
    const rows = 12, cols = 15;
    for (let row = 0; row < rows; row++) {
        const offset = row % 2 ? g : 0;
        for (let col = 0; col < cols - (row % 2); col++) {
            scene.ball({ x: (col - cols / 2) * g * 2 + g + offset, y: row * g * 1.6 - 4 * g, r: 4, fixed: true, color: '#5b6b73', bounce: 0.4 });
        }
    }
    // bins
    for (let i = -8; i <= 8; i++) {
        scene.box({ x: i * g * 2, y: 18 * g, w: 4, h: g * 3, fixed: true, color: '#5b6b73' });
    }
    scene.box({ x: 0, y: 20 * g, w: 40 * g, h: g, fixed: true, color: '#5b6b73', tag: 'floor' });
}

let next = 0;

export function step(world, dt) {
    next -= dt;
    if (next > 0 || world.bodies.length > 600) return;
    next = 0.25;
    world.spawn({
        shape: 'ball',
        x: (world.rng.nextFloat() - 0.5) * 64,
        y: -8 * 32,
        r: 9,
        bounce: 0.3,
        color: world.rng.pick(['#e8554e', '#f2a541', '#f4d35e', '#3fd1a4', '#4ea8de', '#9b6dde']),
        tag: 'drop',
    });
}
`;

const FAN_SCRIPT = `// A fan: every part tagged "fan" blows on whatever is in front of it
// (to its right, rotated with the part). Drag the fan around in build mode,
// or change its angle in the "part" tab.

export function step(world, dt) {
    for (const fan of world.find('fan')) {
        const dirX = Math.cos(fan.angle), dirY = Math.sin(fan.angle);
        for (const b of world.bodies) {
            if (b.fixed || b === fan) continue;
            const dx = b.x - fan.x, dy = b.y - fan.y;
            const along = dx * dirX + dy * dirY;          // distance in front
            const across = Math.abs(-dx * dirY + dy * dirX); // distance to the side
            if (along < 0 || along > 400 || across > fan.h) continue;
            const strength = 1800 * (1 - along / 400);    // px/s²
            b.accelerate(dirX * strength, dirY * strength);
        }
    }
}
`;

function fan(): SceneConfig {
    const parts: PartDef[] = [floor()];
    parts.push({ shape: 'box', x: -14 * G, y: 6 * G, w: G, h: 3 * G, color: '#3fd1a4', fixed: true, tag: 'fan' });
    for (let i = 0; i < 12; i++) {
        parts.push({ shape: 'ball', x: -10 * G + (i % 4) * G, y: 6 * G - Math.floor(i / 4) * G, r: G / 3, color: PALETTE[i % PALETTE.length], density: 0.3 });
    }
    parts.push({ shape: 'box', x: 4 * G, y: 4 * G, w: G, h: 7 * G, color: FIXED_COLOR, fixed: true, tag: 'wall' });
    return { ...defaultScene(), name: 'fan', parts, script: FAN_SCRIPT };
}

function plinko(): SceneConfig {
    // The board is generated by the script's build() when the preset loads.
    return { ...defaultScene(), name: 'plinko', parts: [], script: PLINKO_SCRIPT };
}

export const PRESETS: { id: string; label: string; make: () => SceneConfig }[] = [
    { id: 'sandbox', label: 'sandbox', make: defaultScene },
    { id: 'pyramid', label: 'pyramid', make: pyramid },
    { id: 'dominoes', label: 'dominoes', make: dominoes },
    { id: 'plinko', label: 'plinko', make: plinko },
    { id: 'fan', label: 'fan', make: fan },
];

/** Scripts that ship with the app never need a review. */
export const BUILTIN_SCRIPTS = new Set([PLINKO_SCRIPT, FAN_SCRIPT].map(hashString));

/** A seeded RNG for scripts, so a scene's random layout is reproducible. */
export function sceneRng(seed: number): Rng {
    return new Rng(seed || 1);
}
