import { portTypes, type BehaviorValue, type NodeRegistry, type NodeSpec } from '@n3rdw1z4rd/core/graph';
import { BEHAVIOR_NODES } from './behaviors';
import { JOINT_NODES, type JointData } from './joints';
import { PALETTE, PART_DEFAULTS } from '../core/scene';
import { SCENE_SOURCES } from './scene-sources';

/* ------------------------------------------------------------------ */
/* 2D scene nodes: the graph evaluates to a SceneData object that the  */
/* engine runs. Coordinates are editor coordinates: world px, +y up,    */
/* angles in degrees counter-clockwise.                                 */
/* ------------------------------------------------------------------ */

export interface BodyData {
    fixed: boolean;
    friction: number;
    bounce: number;
    density: number;
    /** detects overlaps (for behaviours' enter / exit) but nothing collides with it */
    sensor?: boolean;
}

export interface EntityData {
    /** stable across evaluations: `<node id>:<index>` — the engine diffs scenes by it */
    id: string;
    shape: 'box' | 'ball';
    x: number;
    y: number;
    /** degrees, counter-clockwise */
    angle: number;
    w: number;
    h: number;
    r: number;
    color: string;
    tag: string;
    /** simulated by the physics when play starts; without one it only draws (and can animate) */
    body: BodyData | null;
    /** behaviours (from Behave): they run on the body while playing */
    behaviors?: BehaviorValue[];
    /** joints (from Anchor, Rope, Spring) to other entities or the world */
    joints?: JointData[];
}

/** How the Viewport's camera behaves while playing (from the Camera node). */
export interface CameraData {
    /** the entity to follow (its id), or null: look at `at` */
    follow: string | null;
    /** what to call the followed entity (its tag, or its shape) */
    followName?: string;
    at: Vec2;
    /** world px the view shows top to bottom (0: keep the zoom as it is) */
    view: number;
    /** seconds to catch up (0: stick to it) */
    smooth: number;
    /** how far (world px) the followed entity can stray from the center before the camera moves */
    deadzone: Vec2;
}

export interface SceneData {
    kind: 'scene2d';
    entities: EntityData[];
    /** null: the camera is yours (pan / zoom) */
    camera?: CameraData | null;
    /** m/s², +y up */
    gravity: { x: number; y: number };
    background: string;
}

type Vec2 = { x: number; y: number };
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v: any, d: Vec2 = { x: 0, y: 0 }): Vec2 => ({ x: num(v?.x, d.x), y: num(v?.y, d.y) });
const isEntity = (v: any): v is EntityData => !!v && typeof v === 'object' && typeof v.id === 'string' && (v.shape === 'box' || v.shape === 'ball');

portTypes.define('entity', '#d3d3d3');
portTypes.define('scene', '#f4d35e');
portTypes.define('behavior', '#ff7f9f');
portTypes.define('camera', '#9b6dde');

export const SCENE_NODES: NodeSpec[] = [
    {
        type: 'shape/box',
        title: 'Box',
        description: 'a rectangle centered on `at`',
        inputs: {
            at: { type: 'vec2', default: { x: 0, y: 0 } },
            size: { type: 'vec2', default: { x: 64, y: 32 } },
            angle: { type: 'number', default: 0, step: 15 },
            color: { type: 'color', default: PALETTE[4] },
        },
        outputs: { entity: 'entity' },
        run: ({ at, size, angle, color }, _p, ctx) => {
            const p = vec(at);
            const s = vec(size, { x: 64, y: 32 });
            return { entity: entity(`${ctx.nodeId}:${ctx.index}`, 'box', p, num(angle), { w: Math.max(1, s.x), h: Math.max(1, s.y) }, color) };
        },
    },
    {
        type: 'shape/ball',
        title: 'Ball',
        inputs: {
            at: { type: 'vec2', default: { x: 0, y: 0 } },
            radius: { type: 'number', default: 16, min: 0.5, step: 1 },
            color: { type: 'color', default: PALETTE[0] },
        },
        outputs: { entity: 'entity' },
        run: ({ at, radius, color }, _p, ctx) => ({
            entity: entity(`${ctx.nodeId}:${ctx.index}`, 'ball', vec(at), 0, { r: Math.max(0.5, num(radius, 16)) }, color),
        }),
    },
    {
        type: 'physics/body',
        title: 'Rigid Body',
        description: 'makes an entity simulated when the viewport plays (a sensor only detects what overlaps it: nothing collides with it)',
        inputs: { entity: 'entity' },
        params: {
            fixed: { type: 'boolean', default: false },
            friction: { type: 'number', default: PART_DEFAULTS.friction, min: 0, max: 2, step: 0.05 },
            bounce: { type: 'number', default: PART_DEFAULTS.bounce, min: 0, max: 1.2, step: 0.05 },
            density: { type: 'number', default: PART_DEFAULTS.density, min: 0.1, max: 20, step: 0.1 },
            sensor: { type: 'boolean', default: false },
        },
        outputs: { entity: 'entity' },
        run: ({ entity: e }, { fixed, friction, bounce, density, sensor }) => {
            if (!isEntity(e)) throw new Error('needs an entity');
            const body: BodyData = { fixed: !!fixed, friction: num(friction, 0.5), bounce: num(bounce, 0.1), density: Math.max(0.01, num(density, 1)), sensor: !!sensor };
            return { entity: { ...e, body } };
        },
    },
    {
        type: 'scene/move',
        title: 'Move',
        description: 'offsets and turns an entity',
        inputs: {
            entity: 'entity',
            by: { type: 'vec2', default: { x: 0, y: 0 } },
            turn: { type: 'number', default: 0, step: 15 },
        },
        outputs: { entity: 'entity' },
        run: ({ entity: e, by, turn }) => {
            if (!isEntity(e)) throw new Error('needs an entity');
            const d = vec(by);
            return { entity: { ...e, x: e.x + d.x, y: e.y + d.y, angle: e.angle + num(turn) } };
        },
    },
    {
        type: 'scene/tag',
        title: 'Tag',
        description: 'labels an entity (scripts find entities by tag)',
        inputs: { entity: 'entity' },
        params: { tag: { type: 'string', default: '' } },
        outputs: { entity: 'entity' },
        run: ({ entity: e }, { tag }) => {
            if (!isEntity(e)) throw new Error('needs an entity');
            return { entity: { ...e, tag: String(tag ?? '').slice(0, 40) } };
        },
    },
    {
        type: 'scene/scene2d',
        title: 'Scene',
        description: 'collects entities (wire in as many as you like) and world settings',
        inputs: {
            entities: { type: 'entity[]', multi: true, optional: true },
            gravity: { type: 'vec2', default: { x: 0, y: -9.81 } },
            camera: { type: 'camera', optional: true },
        },
        params: { background: { type: 'color', default: '#111111' } },
        outputs: { scene: 'scene' },
        run: ({ entities, gravity, camera }, { background }) => {
            const list = (entities as unknown[]).filter(isEntity);
            const seen = new Set<string>();
            // the same entity wired in twice would collide in the engine: suffix duplicates
            const unique = list.map((e) => {
                let id = e.id;
                for (let k = 2; seen.has(id); k++) id = `${e.id}#${k}`;
                seen.add(id);
                return id === e.id ? e : { ...e, id };
            });
            // a joint's other end has to be in the scene too
            for (const e of unique) for (const j of e.joints ?? []) {
                if (j.to !== null && !seen.has(j.to)) throw new Error(`a ${j.kind} on ${e.tag || e.id} joins ${j.to}, which isn't in this scene: wire it in too`);
            }
            const cam = camera && typeof camera === 'object' ? (camera as CameraData) : null;
            if (cam?.follow != null && !seen.has(cam.follow)) throw new Error(`the camera follows ${cam.follow}, which isn't in this scene: wire it in too`);
            const scene: SceneData = { kind: 'scene2d', entities: unique, gravity: vec(gravity, { x: 0, y: -9.81 }), background: String(background ?? '#111111'), camera: cam };
            return { scene };
        },
    },
    {
        type: 'scene/camera',
        title: 'Camera',
        description: 'steers the Viewport while playing: follows an entity (or looks at `at`); pan to take over, double-click to hand it back',
        inputs: {
            follow: { type: 'entity', optional: true },
            at: { type: 'vec2', default: { x: 0, y: 0 } },
            view: { type: 'number', default: 480, min: 0, step: 20 },
            smooth: { type: 'number', default: 0.25, min: 0, step: 0.05 },
            deadzone: { type: 'vec2', default: { x: 40, y: 30 } },
        },
        outputs: { camera: 'camera' },
        run: ({ follow, at, view, smooth, deadzone }) => {
            if (follow != null && !isEntity(follow)) throw new Error('`follow` needs an entity (or nothing, to look at `at`)');
            const dz = vec(deadzone, { x: 40, y: 30 });
            const camera: CameraData = {
                follow: follow ? follow.id : null,
                followName: follow ? follow.tag || follow.shape : undefined,
                at: vec(at),
                view: Math.max(0, num(view, 480)),
                smooth: Math.max(0, num(smooth, 0.25)),
                deadzone: { x: Math.max(0, dz.x), y: Math.max(0, dz.y) },
            };
            return { camera };
        },
    },
    {
        type: 'output/viewport',
        title: 'Viewport',
        description: 'runs the scene: preview while building, ▶ to play',
        output: true,
        inputs: { scene: 'scene' },
        outputs: {},
        run: ({ scene }) => {
            if (!scene || scene.kind !== 'scene2d') throw new Error('needs a scene');
        },
    },
];

function entity(id: string, shape: 'box' | 'ball', at: Vec2, angle: number, size: { w?: number; h?: number; r?: number }, color: unknown): EntityData {
    return {
        id, shape, x: at.x, y: at.y, angle,
        w: size.w ?? 32, h: size.h ?? 32, r: size.r ?? 16,
        color: typeof color === 'string' ? color : '#cccccc',
        tag: '',
        body: null,
    };
}

export function registerSceneNodes(registry: NodeRegistry): void {
    // each carries its source (a script module) so the editor can show and fork it
    for (const spec of SCENE_NODES) registry.register({ ...spec, source: spec.source ?? SCENE_SOURCES[spec.type] });
    for (const spec of JOINT_NODES) registry.register(spec);
    for (const spec of BEHAVIOR_NODES) registry.register(spec);
}
