import { GetRapier, type Rapier } from "./lib/rapier";
import type { RigidBody, RigidBodyDesc, World } from "@dimforge/rapier3d";
import type {
    BodyDesc,
    ColliderDesc as ColliderDescInput,
    JointDesc,
    PhysicsCommand,
    PhysicsEvent,
    Vec3,
} from "./physics-protocol";
import { STEP_STRIDE } from "./physics-protocol";

// --- fixed-timestep simulation loop -----------------------------------
// The tick source (setInterval) and the physics rate are decoupled: we
// accumulate real elapsed time and step the world in fixed FIXED_DT
// increments, so the simulation stays correct even if the callback fires
// late (tab throttling, GC pause, etc.) instead of drifting.

const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_TICK = 5;
const TICK_INTERVAL_MS = 1000 / 120;

let accumulator = 0;
let lastTime = 0;
let tickHandle: ReturnType<typeof setInterval> | undefined;
let running = false;

// --- state ---------------------------------------------------------------

let rapier: Rapier;
let isLoaded = false;

let world: World | null = null;

const bodiesById = new Map<number, RigidBody>();
const idsByHandle = new Map<number, number>();

// --- messaging helpers -----------------------------------------------------

function post(event: PhysicsEvent, transfer?: Transferable[]) {
    self.postMessage(event, { transfer });
}

function postLog(level: 'info' | 'warn' | 'error', message: string) {
    post({ type: 'log', level, message });
}

// --- world / body lifecycle ------------------------------------------------

function createWorld(gravity: Vec3) {
    if (world) {
        postLog('warn', 'createWorld: world already exists (call clear() first)');
        return;
    }

    world = new rapier.World(gravity);

    postLog('info', 'world created');
}

function setGravity(gravity: Vec3) {
    if (!world) {
        postLog('warn', 'setGravity: no world created yet');
        return;
    }

    world.gravity = gravity;
}

function buildColliderDesc(input: ColliderDescInput) {
    let desc;

    switch (input.shape) {
        case 'box':
            desc = rapier.ColliderDesc.cuboid(
                input.halfExtents.x, input.halfExtents.y, input.halfExtents.z,
            );

            break;

        case 'ball':
            desc = rapier.ColliderDesc.ball(input.radius);
            break;

        case 'capsule':
            desc = rapier.ColliderDesc.capsule(input.halfHeight, input.radius);
            break;

        case 'cylinder':
            desc = rapier.ColliderDesc.cylinder(input.halfHeight, input.radius);
            break;
    }

    if (input.offset) {
        desc.setTranslation(input.offset.x, input.offset.y, input.offset.z);
    }

    if (input.rotation) {
        desc.setRotation(input.rotation);
    }

    return desc;
}

function addBody(id: number, desc: BodyDesc) {
    if (!world) {
        postLog('warn', 'addBody: no world created yet');
        return;
    }

    if (bodiesById.has(id)) {
        postLog('warn', `addBody: id ${id} already exists`);
        return;
    }

    let rbDesc: RigidBodyDesc;

    switch (desc.type) {
        case 'dynamic': rbDesc = rapier.RigidBodyDesc.dynamic(); break;
        case 'kinematic': rbDesc = rapier.RigidBodyDesc.kinematicPositionBased(); break;
        case 'fixed': default: rbDesc = rapier.RigidBodyDesc.fixed(); break;
    }

    rbDesc.setTranslation(desc.position.x, desc.position.y, desc.position.z);

    if (desc.rotation) {
        rbDesc.setRotation(desc.rotation);
    }

    const body = world.createRigidBody(rbDesc);

    for (const colliderInput of desc.colliders) {
        world.createCollider(buildColliderDesc(colliderInput), body);
    }

    bodiesById.set(id, body);
    idsByHandle.set(body.handle, id);
}

function removeBody(id: number) {
    if (!world) {
        postLog('warn', 'removeBody: no world created yet');
        return;
    }

    const body = bodiesById.get(id);

    if (!body) {
        postLog('warn', `removeBody: unknown id ${id}`);
        return;
    }

    idsByHandle.delete(body.handle);
    bodiesById.delete(id);

    world.removeRigidBody(body);
}

function clear() {
    if (!world) return;

    running = false;

    for (const body of bodiesById.values()) {
        world.removeRigidBody(body);
    }

    bodiesById.clear();
    idsByHandle.clear();
    accumulator = 0;

    postLog('info', 'world cleared');
}

// --- joints (not implemented yet - protocol stub) ---------------------------

function addJoint(id: number, desc: JointDesc) {
    postLog('warn', `addJoint: joints are not implemented yet (id ${id}, type "${desc.type}")`);
}

function removeJoint(id: number) {
    postLog('warn', `removeJoint: joints are not implemented yet (id ${id})`);
}

// --- per-body actions --------------------------------------------------

function applyImpulse(id: number, impulse: Vec3, point?: Vec3) {
    const body = bodiesById.get(id);
    if (!body) return;

    if (point) body.applyImpulseAtPoint(impulse, point, true);
    else body.applyImpulse(impulse, true);
}

function applyTorqueImpulse(id: number, torque: Vec3) {
    bodiesById.get(id)?.applyTorqueImpulse(torque, true);
}

function setLinvel(id: number, velocity: Vec3) {
    bodiesById.get(id)?.setLinvel(velocity, true);
}

function setAngvel(id: number, velocity: Vec3) {
    bodiesById.get(id)?.setAngvel(velocity, true);
}

// --- simulation control --------------------------------------------------

function start() {
    if (!world) {
        postLog('warn', 'start: no world created yet');
        return;
    }

    if (running) return;

    running = true;
    lastTime = performance.now();
    accumulator = 0;

    if (tickHandle === undefined) {
        tickHandle = setInterval(tick, TICK_INTERVAL_MS);
    }
}

function pause() {
    running = false;
}

function tick() {
    if (!running || !world) return;

    const now = performance.now();
    let delta = (now - lastTime) / 1000;
    lastTime = now;

    // Clamp huge deltas (e.g. the tab was backgrounded) to avoid a spiral of death.
    delta = Math.min(delta, FIXED_DT * MAX_STEPS_PER_TICK);

    accumulator += delta;

    let steps = 0;

    while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_TICK) {
        world.step();
        accumulator -= FIXED_DT;
        steps++;
    }

    if (steps > 0) postStep();
}

function postStep() {
    if (!world) return;

    const bodyCount = world.bodies.len();
    const buffer = new Float32Array(bodyCount * STEP_STRIDE);

    let i = 0;

    world.bodies.forEach((body) => {
        const id = idsByHandle.get(body.handle) ?? -1;
        const { x, y, z } = body.translation();
        const { x: qx, y: qy, z: qz, w: qw } = body.rotation();

        buffer[i++] = id;
        buffer[i++] = x;
        buffer[i++] = y;
        buffer[i++] = z;
        buffer[i++] = qx;
        buffer[i++] = qy;
        buffer[i++] = qz;
        buffer[i++] = qw;
    });

    post({ type: 'step', buffer }, [buffer.buffer]);
}

// --- command dispatch --------------------------------------------------

GetRapier().then((RAPIER: Rapier) => {
    rapier = RAPIER;
    isLoaded = true;
    post({ type: 'ready' });
});

self.onmessage = (msg: MessageEvent<PhysicsCommand>) => {
    if (!isLoaded) {
        postLog('warn', 'received command before rapier finished loading');
        return;
    }

    const command = msg.data;

    switch (command.cmd) {
        case 'createWorld': createWorld(command.gravity); break;
        case 'setGravity': setGravity(command.gravity); break;
        case 'addBody': addBody(command.id, command.desc); break;
        case 'removeBody': removeBody(command.id); break;
        case 'addJoint': addJoint(command.id, command.desc); break;
        case 'removeJoint': removeJoint(command.id); break;
        case 'applyImpulse': applyImpulse(command.id, command.impulse, command.point); break;
        case 'applyTorqueImpulse': applyTorqueImpulse(command.id, command.torque); break;
        case 'setLinvel': setLinvel(command.id, command.velocity); break;
        case 'setAngvel': setAngvel(command.id, command.velocity); break;
        case 'start': start(); break;
        case 'pause': pause(); break;
        case 'clear': clear(); break;

        default:
            postLog('warn', `unknown command: ${(command as PhysicsCommand).cmd}`);
            break;
    }
};
