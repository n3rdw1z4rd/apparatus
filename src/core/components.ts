import type { ECS, Entity } from '@n3rdw1z4rd/core';
import { FIXED_COLOR, normalizePart, PALETTE, PART_DEFAULTS, type PartDef, type PartShape } from './scene';

/* ------------------------------------------------------------------ */
/* Components (core's ECS keys components by class)                     */
/* ------------------------------------------------------------------ */

export class Transform {
    constructor(public x = 0, public y = 0, public angle = 0) {}
}

export class Shape {
    constructor(
        public kind: PartShape = 'box',
        /** box size, world px */
        public w = 32,
        public h = 32,
        /** ball radius, world px */
        public r = 16,
    ) {}
}

export class Body {
    constructor(
        public fixed = false,
        public friction: number = PART_DEFAULTS.friction,
        public bounce: number = PART_DEFAULTS.bounce,
        public density: number = PART_DEFAULTS.density,
    ) {}
}

export class Look {
    constructor(public color = PALETTE[0]) {}
}

export class Meta {
    constructor(
        public tag = '',
        /** made by the script's build() */
        public gen = false,
        /** spawned by a script during play; gone when play stops */
        public spawned = false,
    ) {}
}

/* ------------------------------------------------------------------ */
/* Scene parts <-> entities                                             */
/* ------------------------------------------------------------------ */

export function addPart(ecs: ECS, part: PartDef, opts: { spawned?: boolean } = {}): Entity {
    const e = ecs.createEntity();
    ecs.addComponent(e, new Transform(part.x, part.y, part.angle ?? 0));
    ecs.addComponent(e, new Shape(part.shape, part.w ?? 32, part.h ?? 32, part.r ?? 16));
    ecs.addComponent(e, new Body(
        !!part.fixed,
        part.friction ?? PART_DEFAULTS.friction,
        part.bounce ?? PART_DEFAULTS.bounce,
        part.density ?? PART_DEFAULTS.density,
    ));
    ecs.addComponent(e, new Look(part.color ?? (part.fixed ? FIXED_COLOR : PALETTE[e % PALETTE.length])));
    ecs.addComponent(e, new Meta(part.tag ?? '', !!part.gen, !!opts.spawned));
    return e;
}

export function partOf(ecs: ECS, e: Entity): PartDef | null {
    const t = ecs.getComponent(e, Transform);
    const s = ecs.getComponent(e, Shape);
    const b = ecs.getComponent(e, Body);
    const l = ecs.getComponent(e, Look);
    const m = ecs.getComponent(e, Meta);
    if (!t || !s || !b) return null;

    return normalizePart({
        shape: s.kind,
        x: t.x, y: t.y, angle: t.angle,
        w: s.w, h: s.h, r: s.r,
        color: l?.color,
        fixed: b.fixed, friction: b.friction, bounce: b.bounce, density: b.density,
        tag: m?.tag || undefined,
        gen: m?.gen || undefined,
    });
}

/** Every part, in creation (= draw) order. */
export function partEntities(ecs: ECS): Entity[] {
    const out: Entity[] = [];
    for (const [e] of ecs.query(Transform, Shape)) out.push(e);
    return out.sort((a, b) => a - b);
}

/** The scene's parts — excluding anything spawned during play. */
export function partsOf(ecs: ECS): PartDef[] {
    const parts: PartDef[] = [];
    for (const e of partEntities(ecs)) {
        if (ecs.getComponent(e, Meta)?.spawned) continue;
        const p = partOf(ecs, e);
        if (p) parts.push(p);
    }
    return parts;
}

/* ------------------------------------------------------------------ */
/* Geometry                                                             */
/* ------------------------------------------------------------------ */

/** Whether the world point lies inside the part. */
export function containsPoint(t: Transform, s: Shape, x: number, y: number): boolean {
    const dx = x - t.x;
    const dy = y - t.y;

    if (s.kind === 'ball') return dx * dx + dy * dy <= s.r * s.r;

    const cos = Math.cos(-t.angle);
    const sin = Math.sin(-t.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= s.w / 2 && Math.abs(ly) <= s.h / 2;
}

/** Topmost (last drawn) part under the point, or null. */
export function pickAt(ecs: ECS, x: number, y: number, slop = 0): Entity | null {
    const entities = partEntities(ecs);
    for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        const t = ecs.getComponent(e, Transform)!;
        const s = ecs.getComponent(e, Shape)!;
        if (containsPoint(t, s, x, y)) return e;
    }
    if (slop > 0) {
        // Small things are hard to hit with a finger: accept a near miss.
        let best: Entity | null = null;
        let bestD = slop;
        for (const e of entities) {
            const t = ecs.getComponent(e, Transform)!;
            const s = ecs.getComponent(e, Shape)!;
            const d = Math.hypot(x - t.x, y - t.y) - (s.kind === 'ball' ? s.r : Math.min(s.w, s.h) / 2);
            if (d < bestD) {
                bestD = d;
                best = e;
            }
        }
        return best;
    }
    return null;
}

/** Axis-aligned bounds of a part, world px. */
export function boundsOf(t: Transform, s: Shape): { minX: number; minY: number; maxX: number; maxY: number } {
    if (s.kind === 'ball') return { minX: t.x - s.r, minY: t.y - s.r, maxX: t.x + s.r, maxY: t.y + s.r };
    const c = Math.abs(Math.cos(t.angle));
    const n = Math.abs(Math.sin(t.angle));
    const hw = (s.w * c + s.h * n) / 2;
    const hh = (s.w * n + s.h * c) / 2;
    return { minX: t.x - hw, minY: t.y - hh, maxX: t.x + hw, maxY: t.y + hh };
}

/**
 * Grid snapping that lines a box's edges up with the grid (so a 1×1 box
 * fills a cell) and puts a ball's center on a cell center or line.
 */
export function snapPosition(s: Shape, angle: number, x: number, y: number, grid: number): { x: number; y: number } {
    const quarter = Math.abs(Math.round(angle / (Math.PI / 2))) % 2 === 1;
    const w = s.kind === 'ball' ? s.r * 2 : quarter ? s.h : s.w;
    const h = s.kind === 'ball' ? s.r * 2 : quarter ? s.w : s.h;
    const snap = (c: number, size: number) => {
        const half = size / 2;
        return Math.round((c - half) / (grid / 2)) * (grid / 2) + half;
    };
    return { x: snap(x, w), y: snap(y, h) };
}
