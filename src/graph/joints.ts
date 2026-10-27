import type { NodeSpec } from '@n3rdw1z4rd/core/graph';

/* ------------------------------------------------------------------ */
/* Joint nodes: Anchor, Rope and Spring. Each passes an entity through  */
/* with a joint added (entity.joints); `to` is another entity in the    */
/* scene, or nothing for the world. The physics worker makes them       */
/* Rapier joints when play starts; the engine draws them.               */
/* Editor coordinates: world px, +y up, degrees counter-clockwise.      */
/* ------------------------------------------------------------------ */

type Vec2 = { x: number; y: number };

export interface JointData {
    kind: 'anchor' | 'rope' | 'spring';
    /** the graph node it came from */
    node: string;
    /** the other entity's id, or null: the world */
    to: string | null;
    /** on this entity: an offset from its center that turns with it (px). An anchor's pivot. */
    at: Vec2;
    /** rope / spring: on `to`, an offset from its center that turns with it — or, with no `to`, a point in the world */
    toAt: Vec2;
    /** anchor: swings / spins about the pivot (true) or is welded on (false) */
    hinge?: boolean;
    /** anchor (hinge): motor speed, degrees/s counter-clockwise (0: off) */
    motor?: number;
    /** rope: the most it stretches to; spring: its rest length. 0: the distance as placed (px) */
    length?: number;
    /** spring */
    stiffness?: number;
    damping?: number;
    /** do the two joined bodies still collide with each other */
    collide: boolean;
    color?: string;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v: any, d: Vec2 = { x: 0, y: 0 }): Vec2 => ({ x: num(v?.x, d.x), y: num(v?.y, d.y) });
const isEntity = (v: any) => !!v && typeof v === 'object' && typeof v.id === 'string' && (v.shape === 'box' || v.shape === 'ball');

function join(entity: any, to: any, joint: Omit<JointData, 'node' | 'to'>, nodeId: string) {
    if (!isEntity(entity)) throw new Error('needs an entity');
    if (to != null && !isEntity(to)) throw new Error('`to` needs an entity (or nothing, for the world)');
    if (to && to.id === entity.id) throw new Error("can't join an entity to itself");
    const j: JointData = { ...joint, node: nodeId, to: to ? to.id : null };
    return { entity: { ...entity, joints: [...(entity.joints ?? []), j] } };
}

/** the shared part of each joint's script module */
const JOIN_SOURCE = `// An entity's joints: entity.joints = [{ kind, node, to (an entity id, or null: the world),
//   at, toAt, hinge, motor, length, stiffness, damping, collide, color }] — see the Anchor,
//   Rope and Spring nodes. Every entity a joint names has to be in the scene too.
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v, d = { x: 0, y: 0 }) => ({ x: num(v?.x, d.x), y: num(v?.y, d.y) });
const isEntity = (v) => !!v && typeof v === 'object' && typeof v.id === 'string' && (v.shape === 'box' || v.shape === 'ball');

function join(entity, to, joint, nodeId) {
    if (!isEntity(entity)) throw new Error('needs an entity');
    if (to != null && !isEntity(to)) throw new Error('\`to\` needs an entity (or nothing, for the world)');
    if (to && to.id === entity.id) throw new Error("can't join an entity to itself");
    const j = { ...joint, node: nodeId, to: to ? to.id : null };
    return { entity: { ...entity, joints: [...(entity.joints ?? []), j] } };
}`;

const iface = (s: Pick<NodeSpec, 'title' | 'description' | 'inputs' | 'params' | 'outputs'>) => [
    `export const title = ${JSON.stringify(s.title)};`,
    `export const description = ${JSON.stringify(s.description)};`,
    `export const inputs = ${JSON.stringify(s.inputs, null, 4)};`,
    s.params ? `export const params = ${JSON.stringify(s.params, null, 4)};` : '',
    `export const outputs = ${JSON.stringify(s.outputs)};`,
].filter(Boolean).join('\n');

const node = (s: Omit<NodeSpec, 'source' | 'category' | 'outputs'> & { body: string }): NodeSpec => {
    const { body, ...spec } = s;
    const full = { ...spec, category: 'physics', outputs: { entity: 'entity' } } as NodeSpec;
    return { ...full, source: `${iface(full)}\n\n${JOIN_SOURCE}\n\n${body.trim()}\n` };
};

const TO = { type: 'entity', optional: true };

export const JOINT_NODES: NodeSpec[] = [
    node({
        type: 'physics/anchor',
        title: 'Anchor',
        description: 'pins an entity to another (or, with nothing in `to`, to the world) at a pivot: with hinge on it swings or spins there (a motor can drive it), off it is welded on',
        inputs: {
            entity: 'entity',
            to: TO,
            pivot: { type: 'vec2', default: { x: 0, y: 0 } },
            motor: { type: 'number', default: 0, step: 30 },
        },
        params: {
            hinge: { type: 'boolean', default: true },
            collide: { type: 'boolean', default: false },
        },
        run: ({ entity, to, pivot, motor }, { hinge, collide }, ctx) =>
            join(entity, to, { kind: 'anchor', at: vec(pivot), toAt: { x: 0, y: 0 }, hinge: !!hinge, motor: num(motor), collide: !!collide }, ctx.nodeId),
        body: `
// pivot: an offset from the entity's center (it turns with the entity); motor: degrees/s
export function run({ entity, to, pivot, motor }, { hinge, collide }, ctx) {
    return join(entity, to, { kind: 'anchor', at: vec(pivot), toAt: { x: 0, y: 0 }, hinge: !!hinge, motor: num(motor), collide: !!collide }, ctx.nodeId);
}`,
    }),
    node({
        type: 'physics/rope',
        title: 'Rope',
        description: 'ties an entity to another (or, with nothing in `to`, to a point in the world): it can get closer, but never further than `length` (0: as placed)',
        inputs: {
            entity: 'entity',
            to: TO,
            length: { type: 'number', default: 0, min: 0, step: 8 },
            at: { type: 'vec2', default: { x: 0, y: 0 } },
            toAt: { type: 'vec2', default: { x: 0, y: 0 } },
            color: { type: 'color', default: '#c8a46e' },
        },
        params: { collide: { type: 'boolean', default: true } },
        run: ({ entity, to, length, at, toAt, color }, { collide }, ctx) =>
            join(entity, to, { kind: 'rope', at: vec(at), toAt: vec(toAt), length: Math.max(0, num(length)), collide: !!collide, color: String(color ?? '#c8a46e') }, ctx.nodeId),
        body: `
// at: where it's tied on the entity (an offset from its center); toAt: on \`to\` (the same), or a
// point in the world when nothing is wired into \`to\`
export function run({ entity, to, length, at, toAt, color }, { collide }, ctx) {
    return join(entity, to, { kind: 'rope', at: vec(at), toAt: vec(toAt), length: Math.max(0, num(length)), collide: !!collide, color: String(color ?? '#c8a46e') }, ctx.nodeId);
}`,
    }),
    node({
        type: 'physics/spring',
        title: 'Spring',
        description: 'a spring between an entity and another (or a point in the world): it pulls and pushes toward `length` (0: as placed)',
        inputs: {
            entity: 'entity',
            to: TO,
            length: { type: 'number', default: 0, min: 0, step: 8 },
            stiffness: { type: 'number', default: 30, min: 0, step: 5 },
            damping: { type: 'number', default: 1, min: 0, step: 0.25 },
            at: { type: 'vec2', default: { x: 0, y: 0 } },
            toAt: { type: 'vec2', default: { x: 0, y: 0 } },
        },
        params: { collide: { type: 'boolean', default: true } },
        run: ({ entity, to, length, stiffness, damping, at, toAt }, { collide }, ctx) =>
            join(entity, to, {
                kind: 'spring', at: vec(at), toAt: vec(toAt), length: Math.max(0, num(length)),
                stiffness: Math.max(0, num(stiffness, 30)), damping: Math.max(0, num(damping, 1)), collide: !!collide,
            }, ctx.nodeId),
        body: `
// stiffness: 1/s² (how hard it pulls per px stretched, whatever the mass); damping: 1/s
export function run({ entity, to, length, stiffness, damping, at, toAt }, { collide }, ctx) {
    return join(entity, to, {
        kind: 'spring', at: vec(at), toAt: vec(toAt), length: Math.max(0, num(length)),
        stiffness: Math.max(0, num(stiffness, 30)), damping: Math.max(0, num(damping, 1)), collide: !!collide,
    }, ctx.nodeId);
}`,
    }),
];
