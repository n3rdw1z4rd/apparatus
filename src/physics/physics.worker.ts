/// <reference lib="webworker" />
import type RAPIER from '@dimforge/rapier2d';
import type { Collider, EventQueue, JointData, RevoluteImpulseJoint, RigidBody, World } from '@dimforge/rapier2d';
import { degrees, radians, Rng } from '@n3rdw1z4rd/core';
import { normalizePart, PART_DEFAULTS, PX_PER_M, type PartDef } from '../core/scene';
import { compileScript, describeError, type ScriptHooks } from '../core/script';
import { SPAWN_ID_BASE, type BehaviorRef, type FromWorker, type JointInit, type PointerMsg, type ToWorker, type Vec2 } from './protocol';

/*
 * Rapier and scene scripts live here, off the main thread. A script that
 * loops forever only blocks this worker; the main thread notices the missing
 * frames and replaces the worker (see PhysicsClient / store).
 *
 * Rapier works in meters; everything crossing this boundary is in world
 * pixels, converted with PX_PER_M.
 */

type Rapier = typeof RAPIER;

const P = PX_PER_M;
const STEP_HZ = 60;
const MAX_BODIES = 3000;

const post = (msg: FromWorker, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);

let R: Rapier;
let world: World | null = null;
let timer = 0;
let paused = false;
let timeScale = 1;
let time = 0;
let frame = 0;
let hooks: ScriptHooks | null = null;
let scriptError: string | undefined;
let rng = new Rng(1);
let pointer: PointerMsg = { x: 0, y: 0, down: false, active: false, grab: null };
let nextSpawnId = SPAWN_ID_BASE;
let playToken = 0;
let spawned: { id: number; part: PartDef }[] = [];
let removed: number[] = [];
let toggled: [number, boolean][] = [];
/** collision / overlap events, for behaviours' enter / exit */
let events: EventQueue | null = null;

/* ------------------------------------------------------------------ */
/* Script-facing body handles (world px, px/s)                          */
/* ------------------------------------------------------------------ */

class BodyHandle {
    x = 0;
    y = 0;
    angle = 0;
    vx = 0;
    vy = 0;
    readonly shape: 'box' | 'ball';
    readonly w: number;
    readonly h: number;
    readonly r: number;
    fixed: boolean;
    readonly tag: string;
    readonly sensor: boolean;
    alive = true;
    enabled = true;

    constructor(readonly id: number, public readonly rb: RigidBody, readonly collider: Collider, part: PartDef, readonly key: string | null = null) {
        this.shape = part.shape;
        this.w = part.w ?? 0;
        this.h = part.h ?? 0;
        this.r = part.r ?? 0;
        this.fixed = !!part.fixed;
        this.sensor = !!part.sensor;
        this.tag = part.tag ?? '';
        this.sync();
    }

    sync(): void {
        const t = this.rb.translation();
        const v = this.rb.linvel();
        this.x = t.x * P;
        this.y = t.y * P;
        this.angle = this.rb.rotation();
        this.vx = v.x * P;
        this.vy = v.y * P;
    }

    /** Adds an acceleration (px/s²) for this step. */
    accelerate(ax: number, ay: number): void {
        if (this.fixed || !this.alive) return;
        const m = this.rb.mass();
        const dt = currentDt();
        this.rb.applyImpulse({ x: (m * ax / P) * dt, y: (m * ay / P) * dt }, true);
    }

    /** Sets the angular velocity, radians/s (clockwise, like this side's angles). */
    setAngularVelocity(w: number): void {
        if (this.fixed || !this.alive) return;
        this.rb.setAngvel(w, true);
    }

    /** Changes the velocity by (dvx, dvy) px/s right away. */
    impulse(dvx: number, dvy: number): void {
        if (this.fixed || !this.alive) return;
        const v = this.rb.linvel();
        this.rb.setLinvel({ x: v.x + dvx / P, y: v.y + dvy / P }, true);
    }

    setVelocity(vx: number, vy: number): void {
        if (this.fixed || !this.alive) return;
        this.rb.setLinvel({ x: vx / P, y: vy / P }, true);
    }

    moveTo(x: number, y: number): void {
        if (!this.alive) return;
        this.rb.setTranslation({ x: x / P, y: y / P }, true);
        this.x = x;
        this.y = y;
    }

    /** Makes the body fixed (immovable) or dynamic. */
    setFixed(fixed: boolean): void {
        if (!this.alive || this.fixed === !!fixed) return;
        this.fixed = !!fixed;
        this.rb.setBodyType(fixed ? R.RigidBodyType.Fixed : R.RigidBodyType.Dynamic, true);
    }

    /** Takes the body out of the simulation (and the view) until it's enabled again. */
    setEnabled(on: boolean): void {
        if (!this.alive || this.enabled === !!on) return;
        this.enabled = !!on;
        this.rb.setEnabled(this.enabled);
        toggled.push([this.id, this.enabled]);
    }

    remove(): void {
        if (!this.alive || !world) return;
        this.alive = false;
        byCollider.delete(this.collider.handle);
        if (this.key) byKey.delete(this.key);
        world.removeRigidBody(this.rb);
        handles.delete(this.rb.handle);
        removed.push(this.id);
    }
}

const handles = new Map<number, BodyHandle>(); // rapier handle -> body
const byCollider = new Map<number, BodyHandle>(); // collider handle -> body
const byKey = new Map<string, BodyHandle>(); // scene entity id -> body

/* ------------------------------------------------------------------ */
/* Behaviours (from the node graph). Their API is in editor            */
/* coordinates — +y up, angles in degrees counter-clockwise — so these  */
/* views flip what the handles say (+y down, radians clockwise).        */
/* ------------------------------------------------------------------ */

interface BehaviorModule {
    step?: (self: unknown, world: unknown, dt: number, params: unknown, state: object) => void;
    setup?: (self: unknown, world: unknown, params: unknown, state: object) => void;
    enter?: (self: unknown, other: unknown, world: unknown, params: unknown, state: object, hit: Hit) => void;
    exit?: (self: unknown, other: unknown, world: unknown, params: unknown, state: object, hit: Hit) => void;
}

/** What enter / exit get about the touch (editor coordinates: +y up). */
interface Hit {
    /** unit vector from self toward other */
    normal: Vec2;
    /** how fast they came together along the normal, px/s (0 for exit) */
    speed: number;
    /** one of the two is a sensor (an overlap, not a collision) */
    sensor: boolean;
}

interface Running {
    ref: BehaviorRef;
    mod: BehaviorModule;
    state: object;
    off: boolean;
}

/** body handle → its running behaviours */
const behaviors = new Map<BodyHandle, Running[]>();
/** compiled behaviour modules, by source */
const modules = new Map<string, Promise<BehaviorModule>>();
let behaviorErrors: { node: string; type: string; message: string }[] = [];

function behaviorModule(source: string): Promise<BehaviorModule> {
    let m = modules.get(source);
    if (!m) {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        m = import(/* @vite-ignore */ url).finally(() => URL.revokeObjectURL(url)) as Promise<BehaviorModule>;
        modules.set(source, m);
    }
    return m;
}

const views = new WeakMap<BodyHandle, object>();

/** A body as behaviours see it (+y up, degrees counter-clockwise). */
function view(b: BodyHandle): object {
    let v = views.get(b);
    if (v) return v;
    v = {
        get id() { return b.id; },
        get tag() { return b.tag; },
        get shape() { return b.shape; },
        get w() { return b.w; },
        get h() { return b.h; },
        get r() { return b.r; },
        get fixed() { return b.fixed; },
        get sensor() { return b.sensor; },
        get alive() { return b.alive; },
        get enabled() { return b.enabled; },
        get x() { return b.x; },
        get y() { return -b.y; },
        get angle() { return degrees(-b.angle); },
        get vx() { return b.vx; },
        get vy() { return -b.vy; },
        accelerate: (ax: number, ay: number) => b.accelerate(ax, -ay),
        impulse: (dvx: number, dvy: number) => b.impulse(dvx, -dvy),
        setVelocity: (vx: number, vy: number) => b.setVelocity(vx, -vy),
        spin: (degreesPerSecond: number) => b.setAngularVelocity(radians(-degreesPerSecond)),
        moveTo: (x: number, y: number) => b.moveTo(x, -y),
        setFixed: (fixed: boolean) => b.setFixed(fixed),
        setEnabled: (on: boolean) => b.setEnabled(on),
        remove: () => b.remove(),
    };
    views.set(b, v);
    return v;
}

/** An entity from the graph (+y up, degrees) → a part (+y down, radians). */
function partOfEntity(e: any): PartDef | null {
    if (!e || (e.shape !== 'box' && e.shape !== 'ball')) return null;
    return normalizePart({
        shape: e.shape, x: e.x, y: -e.y, angle: -radians(e.angle ?? 0),
        w: e.w, h: e.h, r: e.r, color: e.color, tag: e.tag || undefined,
        fixed: e.body?.fixed, friction: e.body?.friction, bounce: e.body?.bounce, density: e.body?.density, sensor: e.body?.sensor,
    });
}

const behaviorWorld = {
    get bodies() { return [...handles.values()].map(view); },
    find(tag: string) { return [...handles.values()].filter((b) => b.tag === tag).map(view); },
    /** the body made from a scene entity (as wired into a behaviour's params), or null */
    get(entity: unknown): object | null {
        const key = typeof entity === 'string' ? entity : (entity as { id?: unknown } | null)?.id;
        const b = typeof key === 'string' ? byKey.get(key) : undefined;
        return b && b.alive ? view(b) : null;
    },
    /** spawns an entity (as the graph makes them; its own behaviours come along) */
    spawn(entity: any): object | null {
        const part = partOfEntity(entity);
        if (!part) return null;
        const body = worldApi.spawn(part);
        if (!body) return null;
        if (Array.isArray(entity.behaviors) && entity.behaviors.length) void attachBehaviors(body, entity.behaviors, true);
        return view(body);
    },
    get gravity(): Vec2 {
        const g = worldApi.gravity;
        return { x: g.x, y: -g.y };
    },
    set gravity(g: Vec2) {
        worldApi.gravity = { x: g?.x, y: -g?.y };
    },
    get pointer() {
        const p = worldApi.pointer;
        return { ...p, y: -p.y };
    },
    get time() { return time; },
    get frame() { return frame; },
    get rng() { return rng; },
};

function behaviorFailed(r: Running, err: unknown): void {
    r.off = true;
    behaviorErrors.push({ node: r.ref.node, type: r.ref.type, message: describeError(err) });
}

/** Compiles (once per source) and attaches behaviours; `setup` runs right away. */
async function attachBehaviors(body: BodyHandle, refs: BehaviorRef[], runSetup: boolean): Promise<void> {
    const list: Running[] = [];
    for (const ref of refs) {
        if (!ref || typeof ref.source !== 'string') continue;
        const r: Running = { ref, mod: {}, state: {}, off: false };
        try {
            r.mod = await behaviorModule(ref.source);
        } catch (err) {
            behaviorFailed(r, err);
        }
        list.push(r);
    }
    if (!body.alive) return;
    behaviors.set(body, [...(behaviors.get(body) ?? []), ...list]);
    // only bodies that listen pay for collision events
    if (list.some((r) => r.mod.enter || r.mod.exit)) body.collider.setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);
    if (runSetup) for (const r of list) runOne(body, r, 'setup', 0);
}

/** Runs enter / exit on a body's behaviours that have it. */
function runTouch(body: BodyHandle, other: BodyHandle, hook: 'enter' | 'exit', hit: Hit): void {
    for (const r of behaviors.get(body) ?? []) {
        if (r.off || !r.mod[hook] || !body.alive) continue;
        try {
            r.mod[hook]!(view(body), view(other), behaviorWorld, r.ref.params, r.state, hit);
        } catch (err) {
            behaviorFailed(r, err);
        }
    }
}

/**
 * The collision events of the last step, to each side's behaviours. The normal comes from the
 * contact (from a's center toward b's for sensors); the speed from the velocities before the step.
 */
function dispatchTouches(): void {
    if (!events || !world) return;
    const list: [BodyHandle, BodyHandle, boolean][] = [];
    events.drainCollisionEvents((h1, h2, started) => {
        const a = byCollider.get(h1), b = byCollider.get(h2);
        if (a && b && a !== b) list.push([a, b, started]);
    });
    for (const [a, b, started] of list) {
        if (!a.alive || !b.alive || (!behaviors.has(a) && !behaviors.has(b))) continue;
        const sensor = a.sensor || b.sensor;
        let nx = b.x - a.x, ny = b.y - a.y; // +y down here
        if (started && !sensor) {
            world.contactPair(a.collider, b.collider, (m, flipped) => {
                const n = m.normal();
                if (Number.isFinite(n.x) && (n.x || n.y)) [nx, ny] = flipped ? [-n.x, -n.y] : [n.x, n.y];
            });
        }
        const len = Math.hypot(nx, ny) || 1;
        nx /= len;
        ny /= len;
        const speed = started ? Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny) : 0;
        a.sync();
        b.sync();
        const hook = started ? 'enter' : 'exit';
        // views are +y up
        runTouch(a, b, hook, { normal: { x: nx, y: -ny }, speed, sensor });
        if (b.alive && a.alive) runTouch(b, a, hook, { normal: { x: -nx, y: ny }, speed, sensor });
    }
}

function runOne(body: BodyHandle, r: Running, hook: 'setup' | 'step', dt: number): void {
    if (r.off) return;
    try {
        if (hook === 'setup') r.mod.setup?.(view(body), behaviorWorld, r.ref.params, r.state);
        else r.mod.step?.(view(body), behaviorWorld, dt, r.ref.params, r.state);
    } catch (err) {
        behaviorFailed(r, err);
    }
}

function currentDt(): number {
    return (1 / STEP_HZ) * timeScale;
}

function createBody(id: number, raw: PartDef, key: string | null = null): BodyHandle | null {
    if (!world) return null;
    const part = normalizePart(raw);
    if (!part) return null;

    const desc = (part.fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic())
        .setTranslation(part.x / P, part.y / P)
        .setRotation(part.angle ?? 0)
        .setCcdEnabled(!part.fixed);
    const rb = world.createRigidBody(desc);

    const collider = part.shape === 'ball'
        ? R.ColliderDesc.ball(part.r! / P)
        : R.ColliderDesc.cuboid(part.w! / 2 / P, part.h! / 2 / P);

    collider
        .setFriction(part.friction ?? PART_DEFAULTS.friction)
        .setRestitution(part.bounce ?? PART_DEFAULTS.bounce)
        .setDensity(part.density ?? PART_DEFAULTS.density);
    if (part.sensor) collider.setSensor(true).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS);

    const c = world.createCollider(collider, rb);

    const handle = new BodyHandle(id, rb, c, part, key);
    handles.set(rb.handle, handle);
    byCollider.set(c.handle, handle);
    if (key) byKey.set(key, handle);
    return handle;
}

/**
 * Joints (from the graph's Anchor, Rope and Spring nodes). Rapier's body1 is the `to` side (or a
 * fixed ground body at the origin, for the world) and body2 the entity the joint is on, so a
 * hinge motor turns that entity relative to what it's pinned to.
 */
function createJoints(list: JointInit[]): void {
    if (!world) return;
    const byId = new Map<number, BodyHandle>();
    for (const b of handles.values()) byId.set(b.id, b);
    let ground: RigidBody | null = null;
    const m = (v: Vec2) => ({ x: v.x / P, y: v.y / P });
    for (const j of list) {
        const a = byId.get(j.a);
        const b = j.b === null ? null : byId.get(j.b);
        if (!a || b === undefined) continue;
        const rb1 = b ? b.rb : (ground ??= world.createRigidBody(R.RigidBodyDesc.fixed()));
        const a1 = m(j.anchorB);
        const a2 = m(j.anchorA);
        let data: JointData;
        if (j.kind === 'anchor') data = j.hinge ? R.JointData.revolute(a1, a2) : R.JointData.fixed(a1, 0, a2, j.relAngle ?? 0);
        else if (j.kind === 'rope') data = R.JointData.rope(Math.max(0, j.length ?? 0) / P, a1, a2);
        else data = R.JointData.spring(Math.max(0, j.length ?? 0) / P, j.stiffness ?? 30, j.damping ?? 1, a1, a2);
        const joint = world.createImpulseJoint(data, rb1, a.rb, true);
        joint.setContactsEnabled(j.collide);
        if (j.kind === 'anchor' && j.hinge && j.motor) (joint as RevoluteImpulseJoint).configureMotorVelocity(j.motor, 50);
    }
}

/* ------------------------------------------------------------------ */
/* Script APIs                                                          */
/* ------------------------------------------------------------------ */

const worldApi = {
    get bodies(): BodyHandle[] {
        return [...handles.values()];
    },
    find(tag: string): BodyHandle[] {
        return [...handles.values()].filter((b) => b.tag === tag);
    },
    spawn(part: PartDef): BodyHandle | null {
        if (handles.size >= MAX_BODIES) return null;
        const id = nextSpawnId++;
        const body = createBody(id, part);
        if (body) spawned.push({ id, part: normalizePart(part)! });
        return body;
    },
    get gravity(): Vec2 {
        const g = world?.gravity ?? { x: 0, y: 0 };
        return { x: g.x, y: g.y };
    },
    set gravity(g: Vec2) {
        if (world && Number.isFinite(g?.x) && Number.isFinite(g?.y)) world.gravity = { x: g.x, y: g.y };
    },
    get pointer() {
        return { x: pointer.x, y: pointer.y, down: pointer.down && pointer.grab === null, active: pointer.active };
    },
    get time() { return time; },
    get frame() { return frame; },
    get rng() { return rng; },
};

function stopScript(error: string): void {
    hooks = null;
    scriptError = error;
}

/* ------------------------------------------------------------------ */
/* Simulation                                                           */
/* ------------------------------------------------------------------ */

function freeWorld(): void {
    playToken++;
    clearInterval(timer);
    timer = 0;
    handles.clear();
    byCollider.clear();
    byKey.clear();
    behaviors.clear();
    events?.free();
    events = null;
    world?.free();
    world = null;
    hooks = null;
}

async function play(msg: Extract<ToWorker, { t: 'play' }>): Promise<void> {
    freeWorld();
    const token = playToken;

    world = new R.World(msg.gravity);
    world.timestep = 1 / STEP_HZ;
    timeScale = msg.timeScale;
    paused = msg.paused;
    time = 0;
    frame = 0;
    rng = new Rng(msg.seed || 1);
    nextSpawnId = SPAWN_ID_BASE;
    spawned = [];
    removed = [];
    toggled = [];
    scriptError = undefined;
    events = new R.EventQueue(true);

    behaviorErrors = [];
    const withBehaviors: [BodyHandle, BehaviorRef[]][] = [];
    for (const b of msg.bodies) {
        const body = createBody(b.id, b.part, b.key ?? null);
        if (body && b.behaviors?.length) withBehaviors.push([body, b.behaviors]);
    }
    if (msg.joints?.length) createJoints(msg.joints);
    // compile every behaviour before the first step; then setup, in body order
    for (const [body, refs] of withBehaviors) await attachBehaviors(body, refs, false);
    if (token !== playToken) return;
    for (const b of handles.values()) b.sync();
    for (const [body, list] of behaviors) for (const r of list) runOne(body, r, 'setup', 0);

    if (msg.script) {
        try {
            const compiled = await compileScript(msg.script);
            if (token !== playToken) return; // stopped while compiling
            compiled.setup?.(worldApi);
            hooks = compiled.step ? compiled : null;
        } catch (err) {
            stopScript(`The script failed to start and was stopped.\n${describeError(err)}`);
        }
    }

    if (token !== playToken) return;
    sendFrame(0);
    timer = setInterval(tick, 1000 / STEP_HZ) as unknown as number;
}

function applyGrab(): void {
    if (pointer.grab === null || !pointer.down) return;
    for (const b of handles.values()) {
        if (b.id !== pointer.grab || b.fixed) continue;
        const t = b.rb.translation();
        const k = 12; // 1/s: how stiffly the body follows the pointer
        let vx = (pointer.x / P - t.x) * k;
        let vy = (pointer.y / P - t.y) * k;
        const speed = Math.hypot(vx, vy);
        const max = 60; // m/s
        if (speed > max) {
            vx *= max / speed;
            vy *= max / speed;
        }
        b.rb.setLinvel({ x: vx, y: vy }, true);
        b.rb.setAngvel(b.rb.angvel() * 0.9, true);
        return;
    }
}

function stepOnce(): void {
    if (!world) return;
    const t0 = performance.now();
    const dt = currentDt();

    if (hooks?.step) {
        for (const b of handles.values()) b.sync();
        try {
            hooks.step(worldApi, dt);
        } catch (err) {
            stopScript(`step() threw — script stopped.\n${describeError(err)}`);
        }
    }

    if (behaviors.size) {
        for (const b of handles.values()) b.sync();
        for (const [body, list] of behaviors) {
            if (!body.alive) {
                behaviors.delete(body);
                continue;
            }
            for (const r of list) runOne(body, r, 'step', dt);
        }
    }

    applyGrab();

    world.timestep = dt;
    // velocities before the step, for how hard things hit (enter's hit.speed)
    if (behaviors.size) for (const b of handles.values()) b.sync();
    world.step(events ?? undefined);
    time += dt;
    frame++;
    dispatchTouches();

    // Anything that fell far out of the world (or went NaN) is removed.
    for (const b of handles.values()) {
        const p = b.rb.translation();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e4 || Math.abs(p.y) > 1e4) b.remove();
    }

    sendFrame(performance.now() - t0);
}

function tick(): void {
    if (!paused) stepOnce();
}

function sendFrame(stepMs: number): void {
    if (!world) return;
    const data = new Float32Array(handles.size * 4);
    let i = 0;
    for (const b of handles.values()) {
        const t = b.rb.translation();
        data[i++] = b.id;
        data[i++] = t.x * P;
        data[i++] = t.y * P;
        data[i++] = b.rb.rotation();
    }

    post({
        t: 'frame', data, time, frame, stepMs,
        spawned, removed,
        ...(toggled.length ? { toggled } : {}),
        scriptError,
        ...(behaviorErrors.length ? { behaviorErrors } : {}),
    }, [data.buffer]);

    spawned = [];
    removed = [];
    toggled = [];
    scriptError = undefined;
    behaviorErrors = [];
}

/* ------------------------------------------------------------------ */
/* build(): generate parts                                              */
/* ------------------------------------------------------------------ */

async function build(msg: Extract<ToWorker, { t: 'build' }>): Promise<void> {
    try {
        const compiled = await compileScript(msg.script);
        if (!compiled.build) {
            post({ t: 'built', id: msg.id, parts: [] });
            return;
        }

        const out: PartDef[] = [];
        const add = (shape: 'box' | 'ball') => (opts: any) => {
            if (out.length >= 5000) throw new Error('build() made more than 5000 parts');
            const part = normalizePart({ ...opts, shape });
            if (part) out.push({ ...part, gen: true });
        };

        compiled.build({
            box: add('box'),
            ball: add('ball'),
            parts: msg.parts.map((p) => ({ ...p })),
            grid: msg.grid,
            rng: new Rng(msg.seed || 1),
        });

        post({ t: 'built', id: msg.id, parts: out });
    } catch (err) {
        post({ t: 'built', id: msg.id, error: describeError(err) });
    }
}

/* ------------------------------------------------------------------ */
/* Messages                                                             */
/* ------------------------------------------------------------------ */

const loaded = import('@dimforge/rapier2d').then((mod) => {
    R = mod;
    post({ t: 'ready' });
});

async function handle(msg: ToWorker): Promise<void> {
    switch (msg.t) {
        case 'play': await play(msg); break;
        case 'stop': freeWorld(); break;
        case 'pause': paused = msg.paused; break;
        case 'step': if (paused) stepOnce(); break;
        case 'params':
            timeScale = msg.timeScale;
            if (world) world.gravity = msg.gravity;
            break;
        case 'pointer': {
            const { t: _t, ...p } = msg;
            pointer = p;
            break;
        }
        case 'build': await build(msg); break;
    }
}

// Messages are handled strictly in order: `play` awaits a script compile, and
// a `step` or `stop` sent right after it must not overtake it.
let queue: Promise<void> = loaded;

self.onmessage = (ev: MessageEvent<ToWorker>) => {
    queue = queue.then(() => handle(ev.data)).catch((err) => console.error('[physics]', err));
};
