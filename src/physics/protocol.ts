import type { PartDef } from '../core/scene';

/* Messages between the main thread (PhysicsClient) and physics.worker.ts. */

/** A behaviour attached to a body (see src/graph/behaviors.ts): its module runs in the worker. */
export interface BehaviorRef {
    type: string;
    /** the graph node it came from (for error reports) */
    node: string;
    params: Record<string, unknown>;
    source: string;
}

export interface BodyInit {
    id: number;
    /** the scene entity it was made from (behaviours look bodies up by it: world.get) */
    key?: string;
    part: PartDef;
    behaviors?: BehaviorRef[];
}

/**
 * A joint between two bodies, or a body and the world (b: null). Worker convention: px, +y down,
 * radians clockwise on screen. Anchors are local to each body (a point in the world when b is null).
 */
export interface JointInit {
    kind: 'anchor' | 'rope' | 'spring';
    a: number;
    b: number | null;
    anchorA: Vec2;
    anchorB: Vec2;
    /** anchor: hinge (revolute) or welded (fixed) */
    hinge?: boolean;
    /** anchor (welded): b's angle minus a's, as placed */
    relAngle?: number;
    /** anchor (hinge): rad/s, the worker's sense */
    motor?: number;
    /** rope: max length; spring: rest length (px) */
    length?: number;
    stiffness?: number;
    damping?: number;
    collide: boolean;
}

export interface Vec2 {
    x: number;
    y: number;
}

export interface PointerMsg {
    /** world px */
    x: number;
    y: number;
    down: boolean;
    /** over the canvas */
    active: boolean;
    /** body being dragged during play, or null */
    grab: number | null;
}

export type ToWorker =
    | { t: 'play'; bodies: BodyInit[]; joints?: JointInit[]; gravity: Vec2; timeScale: number; paused: boolean; seed: number; grid: number; script: string | null }
    | { t: 'stop' }
    | { t: 'pause'; paused: boolean }
    | { t: 'step' }
    | { t: 'params'; gravity: Vec2; timeScale: number }
    | ({ t: 'pointer' } & PointerMsg)
    | { t: 'build'; id: number; script: string; parts: PartDef[]; grid: number; seed: number };

export interface SpawnedBody {
    id: number;
    part: PartDef;
}

export type FromWorker =
    | { t: 'ready' }
    | {
        t: 'frame';
        /** [id, x, y, angle] per body, world px / radians */
        data: Float32Array;
        time: number;
        frame: number;
        /** ms spent in the last step (script + physics) */
        stepMs: number;
        spawned: SpawnedBody[];
        removed: number[];
        /** set once when the running script failed and was stopped */
        scriptError?: string;
        /** bodies behaviours switched off / on since the last frame: [id, enabled] */
        toggled?: [number, boolean][];
        /** behaviours that threw and were switched off (on that body) */
        behaviorErrors?: { node: string; type: string; message: string }[];
    }
    | { t: 'built'; id: number; parts?: PartDef[]; error?: string };

/** Ids the worker hands to bodies spawned by scripts (scene parts use their entity ids). */
export const SPAWN_ID_BASE = 1_000_000;
