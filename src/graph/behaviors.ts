import { behaviorRun, type NodeSpec } from '@n3rdw1z4rd/core/graph';

/* ------------------------------------------------------------------ */
/* Behaviour nodes. A behaviour node is a module that exports `step`    */
/* (and maybe `setup`) besides its interface: in the graph it evaluates */
/* to a behaviour value; wired into an entity with Behave, the physics  */
/* worker imports the same module and runs `step` every physics step    */
/* on that entity while the viewport plays.                             */
/* ------------------------------------------------------------------ */

/** The API, at the top of every behaviour's code. */
export const BEHAVIOR_API = `// A behaviour runs on the entity it's wired into (with Behave), every physics step while
// the viewport plays. Editor coordinates: world px, +y up, angles in degrees (counter-
// clockwise), seconds. Behaviours run on entities that have a Rigid Body.
//
//   setup(self, world, params, state)      once, when play starts   (optional)
//   step(self, world, dt, params, state)   every physics step (60/s)
//
//   self    this entity: id, tag, shape, x, y, angle, vx, vy, w, h, r, fixed, alive,
//           accelerate(ax, ay)  px/s², this step      impulse(dvx, dvy)  px/s, now
//           setVelocity(vx, vy)    spin(degreesPerSecond)    moveTo(x, y)    remove()
//   world   bodies, find(tag), spawn(entity) → a body, gravity { x, y } (m/s², assignable),
//           pointer { x, y, down, active }, time, frame, rng (nextFloat, range, pick, chance)
//   params  this node's inputs and params (as evaluated)
//   state   an object of your own, one per entity, kept between steps`;

const spec = (s: Omit<NodeSpec, 'run' | 'outputs' | 'category'> & { step: string }): NodeSpec => {
    const { step, ...rest } = s;
    return {
        ...rest,
        category: 'behavior',
        outputs: { behavior: 'behavior' },
        run: behaviorRun,
        source: `${header(rest)}\n${BEHAVIOR_API}\n\n${step.trim()}\n`,
    };
};

/** The interface part of a behaviour's module, written out from its spec. */
function header(s: Pick<NodeSpec, 'title' | 'description' | 'inputs' | 'params'>): string {
    const lines = [`export const title = ${JSON.stringify(s.title)};`];
    if (s.description) lines.push(`export const description = ${JSON.stringify(s.description)};`);
    if (s.inputs) lines.push(`export const inputs = ${JSON.stringify(s.inputs, null, 4)};`);
    if (s.params) lines.push(`export const params = ${JSON.stringify(s.params, null, 4)};`);
    return lines.join('\n');
}

export const BEHAVIOR_NODES: NodeSpec[] = [
    spec({
        type: 'behavior/push',
        title: 'Push',
        description: 'a constant force (like a rocket or a wind)',
        inputs: { force: { type: 'vec2', default: { x: 0, y: 600 } } },
        params: { local: { type: 'boolean', default: false } },
        step: `
export function step(self, world, dt, { force, local }) {
    let fx = force.x, fy = force.y;
    if (local) {
        // turn the force with the entity
        const a = (self.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        [fx, fy] = [fx * c - fy * s, fx * s + fy * c];
    }
    self.accelerate(fx, fy);
}`,
    }),

    spec({
        type: 'behavior/fan',
        title: 'Fan',
        description: 'blows on whatever is in front of the entity (its +x side, turned with it)',
        inputs: {
            strength: { type: 'number', default: 1800, min: 0, step: 50 },
            reach: { type: 'number', default: 400, min: 0, step: 10 },
            width: { type: 'number', default: 0, min: 0, step: 4 },
        },
        step: `
export function step(self, world, dt, { strength, reach, width }) {
    const a = (self.angle * Math.PI) / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    const half = (width || self.h || self.r * 2) / 2;
    for (const b of world.bodies) {
        if (b.fixed || b.id === self.id) continue;
        const ox = b.x - self.x, oy = b.y - self.y;
        const along = ox * dx + oy * dy;              // distance in front
        const across = Math.abs(-ox * dy + oy * dx);  // distance to the side
        if (along < 0 || along > reach || across > half) continue;
        const k = strength * (1 - along / reach);
        b.accelerate(dx * k, dy * k);
    }
}`,
    }),

    spec({
        type: 'behavior/attract',
        title: 'Attract',
        description: 'pulls bodies toward the entity (negative strength pushes them away)',
        inputs: {
            strength: { type: 'number', default: 3000, step: 100 },
            radius: { type: 'number', default: 300, min: 0, step: 10 },
        },
        params: { tag: { type: 'string', default: '' } },
        step: `
export function step(self, world, dt, { strength, radius, tag }) {
    for (const b of tag ? world.find(tag) : world.bodies) {
        if (b.fixed || b.id === self.id) continue;
        const ox = self.x - b.x, oy = self.y - b.y;
        const d = Math.hypot(ox, oy);
        if (d < 1 || d > radius) continue;
        const k = strength * (1 - d / radius) / d;
        b.accelerate(ox * k, oy * k);
    }
}`,
    }),

    spec({
        type: 'behavior/follow-pointer',
        title: 'Follow Pointer',
        description: 'chases the pointer (while pressed, or always)',
        inputs: {
            stiffness: { type: 'number', default: 8, min: 0, step: 0.5 },
            maxSpeed: { type: 'number', default: 1200, min: 0, step: 50 },
        },
        params: { whilePressed: { type: 'boolean', default: true } },
        step: `
export function step(self, world, dt, { stiffness, maxSpeed, whilePressed }) {
    const p = world.pointer;
    if (!p.active || (whilePressed && !p.down)) return;
    let vx = (p.x - self.x) * stiffness, vy = (p.y - self.y) * stiffness;
    const s = Math.hypot(vx, vy);
    if (s > maxSpeed) { vx *= maxSpeed / s; vy *= maxSpeed / s; }
    self.setVelocity(vx, vy);
}`,
    }),

    spec({
        type: 'behavior/spawner',
        title: 'Spawner',
        description: 'keeps making copies of an entity at this one (offset and jittered)',
        inputs: {
            template: 'entity',
            every: { type: 'number', default: 0.25, min: 0.01, step: 0.05 },
            max: { type: 'number', default: 150, min: 0, step: 10 },
            offset: { type: 'vec2', default: { x: 0, y: -24 } },
            jitter: { type: 'number', default: 24, min: 0, step: 2 },
        },
        params: { colors: { type: 'boolean', default: true } },
        step: `
const COLORS = ['#e8554e', '#f2a541', '#f4d35e', '#3fd1a4', '#4ea8de', '#9b6dde', '#e86fb0'];

export function step(self, world, dt, { template, every, max, offset, jitter, colors }, state) {
    state.next = (state.next ?? 0) - dt;
    state.count ??= 0;
    if (state.next > 0 || state.count >= max) return;
    state.next = every;
    state.count++;
    world.spawn({
        ...template,
        x: self.x + offset.x + (world.rng.nextFloat() - 0.5) * jitter,
        y: self.y + offset.y,
        color: colors ? world.rng.pick(COLORS) : template.color,
    });
}`,
    }),

    {
        type: 'behavior/behave',
        title: 'Behave',
        category: 'behavior',
        description: 'gives an entity behaviours (wire in as many as you like); they run on bodies while playing',
        inputs: { entity: 'entity', behaviors: { type: 'behavior[]', multi: true, optional: true } },
        outputs: { entity: 'entity' },
        run: ({ entity, behaviors }) => {
            if (!entity || typeof entity !== 'object' || typeof entity.id !== 'string') throw new Error('needs an entity');
            const list = (behaviors as any[]).filter((b) => b?.kind === 'behavior');
            return { entity: { ...entity, behaviors: [...(entity.behaviors ?? []), ...list] } };
        },
        source: `export const title = 'Behave';
export const description = 'gives an entity behaviours (wire in as many as you like); they run on bodies while playing';
export const inputs = { entity: 'entity', behaviors: { type: 'behavior[]', multi: true, optional: true } };
export const outputs = { entity: 'entity' };

export function run({ entity, behaviors }) {
    if (!entity || typeof entity !== 'object' || typeof entity.id !== 'string') throw new Error('needs an entity');
    const list = behaviors.filter((b) => b?.kind === 'behavior');
    return { entity: { ...entity, behaviors: [...(entity.behaviors ?? []), ...list] } };
}
`,
    },
];
