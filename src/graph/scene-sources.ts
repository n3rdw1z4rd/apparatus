/* ------------------------------------------------------------------ */
/* The scene nodes as script modules — same interface and behaviour as */
/* scene-nodes.ts, written self-contained so the editor can show their  */
/* code and fork them into custom nodes.                                */
/* ------------------------------------------------------------------ */

const helpers = `const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v, d = { x: 0, y: 0 }) => ({ x: num(v?.x, d.x), y: num(v?.y, d.y) });
const isEntity = (v) => !!v && typeof v === 'object' && typeof v.id === 'string' && (v.shape === 'box' || v.shape === 'ball');`;

const entityDoc = `// An entity: { id, shape: 'box' | 'ball', x, y, angle (degrees, counter-clockwise),
//              w, h, r, color, tag, body: { fixed, friction, bounce, density } | null }
// ids must be stable across evaluations: \`\${ctx.nodeId}:\${ctx.index}\` is a good default.`;

export const SCENE_SOURCES: Record<string, string> = {
    'shape/box': `export const title = 'Box';
export const description = 'a rectangle centered on \`at\`';
export const inputs = {
    at: { type: 'vec2', default: { x: 0, y: 0 } },
    size: { type: 'vec2', default: { x: 64, y: 32 } },
    angle: { type: 'number', default: 0, step: 15 },
    color: { type: 'color', default: '#4ea8de' },
};
export const outputs = { entity: 'entity' };

${entityDoc}

${helpers}

export function run({ at, size, angle, color }, params, ctx) {
    const p = vec(at);
    const s = vec(size, { x: 64, y: 32 });
    return {
        entity: {
            id: \`\${ctx.nodeId}:\${ctx.index}\`, shape: 'box', x: p.x, y: p.y, angle: num(angle),
            w: Math.max(1, s.x), h: Math.max(1, s.y), r: 16,
            color: typeof color === 'string' ? color : '#cccccc', tag: '', body: null,
        },
    };
}
`,

    'shape/ball': `export const title = 'Ball';
export const inputs = {
    at: { type: 'vec2', default: { x: 0, y: 0 } },
    radius: { type: 'number', default: 16, min: 0.5, step: 1 },
    color: { type: 'color', default: '#e8554e' },
};
export const outputs = { entity: 'entity' };

${entityDoc}

${helpers}

export function run({ at, radius, color }, params, ctx) {
    const p = vec(at);
    return {
        entity: {
            id: \`\${ctx.nodeId}:\${ctx.index}\`, shape: 'ball', x: p.x, y: p.y, angle: 0,
            w: 32, h: 32, r: Math.max(0.5, num(radius, 16)),
            color: typeof color === 'string' ? color : '#cccccc', tag: '', body: null,
        },
    };
}
`,

    'physics/body': `export const title = 'Rigid Body';
export const description = 'makes an entity simulated when the viewport plays';
export const inputs = { entity: 'entity' };
export const params = {
    fixed: { type: 'boolean', default: false },
    friction: { type: 'number', default: 0.5, min: 0, max: 2, step: 0.05 },
    bounce: { type: 'number', default: 0.1, min: 0, max: 1.2, step: 0.05 },
    density: { type: 'number', default: 1, min: 0.1, max: 20, step: 0.1 },
};
export const outputs = { entity: 'entity' };

${helpers}

export function run({ entity }, { fixed, friction, bounce, density }) {
    if (!isEntity(entity)) throw new Error('needs an entity');
    const body = { fixed: !!fixed, friction: num(friction, 0.5), bounce: num(bounce, 0.1), density: Math.max(0.01, num(density, 1)) };
    return { entity: { ...entity, body } };
}
`,

    'scene/move': `export const title = 'Move';
export const description = 'offsets and turns an entity';
export const inputs = {
    entity: 'entity',
    by: { type: 'vec2', default: { x: 0, y: 0 } },
    turn: { type: 'number', default: 0, step: 15 },
};
export const outputs = { entity: 'entity' };

${helpers}

export function run({ entity, by, turn }) {
    if (!isEntity(entity)) throw new Error('needs an entity');
    const d = vec(by);
    return { entity: { ...entity, x: entity.x + d.x, y: entity.y + d.y, angle: entity.angle + num(turn) } };
}
`,

    'scene/tag': `export const title = 'Tag';
export const description = 'labels an entity (scripts find entities by tag)';
export const inputs = { entity: 'entity' };
export const params = { tag: { type: 'string', default: '' } };
export const outputs = { entity: 'entity' };

${helpers}

export function run({ entity }, { tag }) {
    if (!isEntity(entity)) throw new Error('needs an entity');
    return { entity: { ...entity, tag: String(tag ?? '').slice(0, 40) } };
}
`,

    'scene/scene2d': `export const title = 'Scene';
export const description = 'collects entities (wire in as many as you like) and world settings';
export const inputs = {
    entities: { type: 'entity[]', multi: true, optional: true },
    gravity: { type: 'vec2', default: { x: 0, y: -9.81 } },
};
export const params = { background: { type: 'color', default: '#111111' } };
export const outputs = { scene: 'scene' };

${helpers}

export function run({ entities, gravity }, { background }) {
    const seen = new Set();
    // the same entity wired in twice would collide in the engine: suffix duplicates
    const unique = entities.filter(isEntity).map((e) => {
        let id = e.id;
        for (let k = 2; seen.has(id); k++) id = \`\${e.id}#\${k}\`;
        seen.add(id);
        return id === e.id ? e : { ...e, id };
    });
    // a joint's other end has to be in the scene too
    for (const e of unique) for (const j of e.joints ?? []) {
        if (j.to !== null && !seen.has(j.to)) throw new Error(\`a \${j.kind} on \${e.tag || e.id} joins \${j.to}, which isn't in this scene: wire it in too\`);
    }
    return {
        scene: {
            kind: 'scene2d',
            entities: unique,
            gravity: vec(gravity, { x: 0, y: -9.81 }),
            background: String(background ?? '#111111'),
        },
    };
}
`,
};
