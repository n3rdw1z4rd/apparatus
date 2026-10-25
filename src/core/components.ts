import { component, field, type ThreeEntity, type World } from '@n3rdw1z4rd/core/three';
import { FIXED_COLOR, normalizePart, PALETTE, PART_DEFAULTS, type PartDef, type PartShape } from './scene';

/* ------------------------------------------------------------------ */
/* Components                                                           */
/*                                                                      */
/* Entities are three.js objects in core's World; position and angle    */
/* live on the Object3D (three.js convention: +y up, angles counter-    */
/* clockwise). Sizes are world px (PX_PER_M px = 1 m).                  */
/* ------------------------------------------------------------------ */

@component('Shape')
export class Shape {
    @field({ options: ['box', 'ball'] }) kind: PartShape = 'box';
    /** box size, world px */
    @field({ min: 1, step: 1, showIf: (s: Shape) => s.kind === 'box' }) w = 32;
    @field({ min: 1, step: 1, showIf: (s: Shape) => s.kind === 'box' }) h = 32;
    /** ball radius, world px */
    @field({ label: 'radius', min: 0.5, step: 1, showIf: (s: Shape) => s.kind === 'ball' }) r = 16;
}

@component('RigidBody')
export class RigidBody {
    @field() fixed = false;
    @field({ min: 0, max: 2, step: 0.05 }) friction: number = PART_DEFAULTS.friction;
    @field({ min: 0, max: 1.2, step: 0.05 }) bounce: number = PART_DEFAULTS.bounce;
    @field({ min: 0.1, max: 20, step: 0.1 }) density: number = PART_DEFAULTS.density;
}

@component('Look')
export class Look {
    @field({ type: 'color' }) color = PALETTE[0];
}

@component('Meta')
export class Meta {
    /** free-form label scripts look parts up by */
    @field() tag = '';
    /** made by the script's build(); replaced the next time build runs */
    @field({ hidden: true }) gen = false;
    /** spawned by a script during play; gone when play stops */
    @field({ hidden: true, transient: true }) spawned = false;
}

/* ------------------------------------------------------------------ */
/* Parts (the scene / script / physics format) <-> entities             */
/*                                                                      */
/* PartDef keeps its original convention — world px, +y DOWN, angles   */
/* clockwise — because shared links, presets, scene scripts and the     */
/* physics worker all speak it. The flip happens here and nowhere else. */
/* ------------------------------------------------------------------ */

export function addPart(world: World, part: PartDef, opts: { spawned?: boolean } = {}): ThreeEntity {
    const e = world.create(part.tag ?? '');
    e.position.set(part.x, -part.y, 0);
    e.rotation.z = -(part.angle ?? 0);
    world.addComponent(e, Shape, { kind: part.shape, w: part.w ?? 32, h: part.h ?? 32, r: part.r ?? 16 });
    world.addComponent(e, RigidBody, {
        fixed: !!part.fixed,
        friction: part.friction ?? PART_DEFAULTS.friction,
        bounce: part.bounce ?? PART_DEFAULTS.bounce,
        density: part.density ?? PART_DEFAULTS.density,
    });
    const index = world.query(Shape).length;
    world.addComponent(e, Look, { color: part.color ?? (part.fixed ? FIXED_COLOR : PALETTE[index % PALETTE.length]) });
    world.addComponent(e, Meta, { tag: part.tag ?? '', gen: !!part.gen, spawned: !!opts.spawned });
    return e;
}

export function partOf(world: World, e: ThreeEntity): PartDef | null {
    const s = world.getComponent<Shape>(e, Shape);
    const b = world.getComponent<RigidBody>(e, RigidBody);
    if (!s || !b) return null;
    const l = world.getComponent<Look>(e, Look);
    const m = world.getComponent<Meta>(e, Meta);

    return normalizePart({
        shape: s.kind,
        x: e.position.x,
        y: -e.position.y,
        angle: -e.rotation.z,
        w: s.w, h: s.h, r: s.r,
        color: l?.color,
        fixed: b.fixed, friction: b.friction, bounce: b.bounce, density: b.density,
        tag: m?.tag || undefined,
        gen: m?.gen || undefined,
    });
}

/** Every part, in creation (= draw) order. */
export function partEntities(world: World): ThreeEntity[] {
    return world.query(Shape);
}

/** The scene's parts — excluding anything spawned during play. */
export function partsOf(world: World): PartDef[] {
    const parts: PartDef[] = [];
    for (const e of partEntities(world)) {
        if (world.getComponent<Meta>(e, Meta)?.spawned) continue;
        const p = partOf(world, e);
        if (p) parts.push(p);
    }
    return parts;
}

/* ------------------------------------------------------------------ */
/* Geometry (editor coordinates: +y up)                                 */
/* ------------------------------------------------------------------ */

/** Axis-aligned bounds of a part, world px. */
export function boundsOf(e: ThreeEntity, s: Shape): { minX: number; minY: number; maxX: number; maxY: number } {
    const { x, y } = e.position;
    if (s.kind === 'ball') return { minX: x - s.r, minY: y - s.r, maxX: x + s.r, maxY: y + s.r };
    const c = Math.abs(Math.cos(e.rotation.z));
    const n = Math.abs(Math.sin(e.rotation.z));
    const hw = (s.w * c + s.h * n) / 2;
    const hh = (s.w * n + s.h * c) / 2;
    return { minX: x - hw, minY: y - hh, maxX: x + hw, maxY: y + hh };
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
