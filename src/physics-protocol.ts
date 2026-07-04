// Shared types between the main thread (PhysicsWorld client) and the physics
// worker (physics-worker.ts). Neither side should hand-roll message shapes —
// everything crossing the worker boundary is described here.

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface Quat {
    x: number;
    y: number;
    z: number;
    w: number;
}

export type BodyType = 'fixed' | 'dynamic' | 'kinematic';

export type ColliderDesc =
    | { shape: 'box'; halfExtents: Vec3; offset?: Vec3; rotation?: Quat }
    | { shape: 'ball'; radius: number; offset?: Vec3; rotation?: Quat }
    | { shape: 'capsule'; halfHeight: number; radius: number; offset?: Vec3; rotation?: Quat }
    | { shape: 'cylinder'; halfHeight: number; radius: number; offset?: Vec3; rotation?: Quat };

export interface BodyDesc {
    type: BodyType;
    position: Vec3;
    rotation?: Quat;
    colliders: ColliderDesc[];
}

// Joint types are part of the protocol now so both sides agree on the shape,
// but the worker only needs to accept/reject these for now — see
// physics-worker.ts for the "not implemented yet" stub.
export type JointType = 'fixed' | 'revolute' | 'prismatic' | 'spherical';

export interface JointDesc {
    type: JointType;
    bodyA: number;
    bodyB: number;
    anchorA: Vec3;
    anchorB: Vec3;
    axis?: Vec3;
    limits?: [number, number];
}

// Commands: main thread -> worker
export type PhysicsCommand =
    | { cmd: 'createWorld'; gravity: Vec3 }
    | { cmd: 'setGravity'; gravity: Vec3 }
    | { cmd: 'addBody'; id: number; desc: BodyDesc }
    | { cmd: 'removeBody'; id: number }
    | { cmd: 'addJoint'; id: number; desc: JointDesc }
    | { cmd: 'removeJoint'; id: number }
    | { cmd: 'applyImpulse'; id: number; impulse: Vec3; point?: Vec3 }
    | { cmd: 'applyTorqueImpulse'; id: number; torque: Vec3 }
    | { cmd: 'setLinvel'; id: number; velocity: Vec3 }
    | { cmd: 'setAngvel'; id: number; velocity: Vec3 }
    | { cmd: 'start' }
    | { cmd: 'pause' }
    | { cmd: 'clear' };

// Events: worker -> main thread
export type PhysicsEvent =
    | { type: 'ready' }
    | { type: 'step'; buffer: Float32Array } // [id, x, y, z, qx, qy, qz, qw] per body
    | { type: 'collision'; a: number; b: number; started: boolean }
    | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

// One float count per body in the step buffer: id + position(3) + quaternion(4)
export const STEP_STRIDE = 8;
