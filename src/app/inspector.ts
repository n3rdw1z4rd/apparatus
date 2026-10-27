import { clamp, degrees, radians } from '@n3rdw1z4rd/core';
import { computed, Signal } from '@n3rdw1z4rd/smoke-ui';
import { applyFieldValue, type ComponentType, type FieldDef, type ThreeEntity } from '@n3rdw1z4rd/core/three';
import { Meta } from '../core/components';
import type { Control } from './controls';
import {
    addComponentToSelected, claimEntity, markDirty, mode, removeComponentFromSelected, revision, selected, snap,
    snapEntity, world,
} from './store';
import { worldRevision } from './world-signals';

/* ------------------------------------------------------------------ */
/* The inspector, generated from component schemas.                    */
/*                                                                      */
/* Every registered component type gets a group of controls (one per   */
/* field, from its FieldDef) bound to signals. Selecting an entity, or  */
/* any change to it, pulls its values into the signals; editing a       */
/* control pushes the value back into the component. Groups for         */
/* components the entity doesn't have are hidden.                       */
/* ------------------------------------------------------------------ */

export const hasSelection = computed(() => selected.get() !== null);
export const editable = computed(() => selected.get() !== null && mode.get() === 'build');

/** names of the selected entity's components */
export const selComponents = new Signal<string[]>([]);
export const selGenerated = new Signal(false);
export const selLabel = new Signal('');

/* ── the entity itself: name + transform ─────────────────────────── */

export const selName = new Signal('');
export const selX = new Signal(0);
export const selY = new Signal(0);
/** degrees, counter-clockwise (+y is up in the editor) */
export const selAngle = new Signal(0);

/** Per-component tweaks after an edit (beyond `world.changed`). */
const AFTER_EDIT: Record<string, (e: ThreeEntity, field: string) => void> = {
    // resizing changes how a part sits on the grid
    Shape: (e) => {
        if (snap.get()) snapEntity(e);
    },
};

let pulling = false;
const pullers: ((e: ThreeEntity) => void)[] = [];

function pull(): void {
    const e = selected.get();
    if (e === null || !world.has(e)) {
        selComponents.set([]);
        return;
    }
    pulling = true;
    try {
        selName.set(e.name);
        selX.set(round(e.position.x));
        selY.set(round(e.position.y));
        selAngle.set(Math.round(degrees(e.rotation.z) * 10) / 10);
        const names = world.componentNames(e);
        if (names.join('|') !== selComponents.get().join('|')) selComponents.set(names);
        selGenerated.set(!!world.getComponent<Meta>(e, Meta)?.gen);
        selLabel.set(labelOf(e));
        for (const p of pullers) p(e);
    } finally {
        pulling = false;
    }
}

/** What an entity is called in the tree and the inspector heading. */
export function labelOf(e: ThreeEntity): string {
    if (e.name) return e.name;
    const tag = world.getComponent<Meta>(e, Meta)?.tag;
    if (tag) return `#${tag}`;
    const shape = world.getComponent<{ kind: string }>(e, 'Shape');
    return shape ? shape.kind : 'entity';
}

/** Writes a control's value into the selected entity; `write` returns false to skip. */
function push<T>(signal: Signal<T>, write: (e: ThreeEntity, value: T) => boolean | void, component?: string, field?: string): void {
    signal.subscribe((value) => {
        if (pulling || mode.get() === 'play') return;
        const e = selected.get();
        if (e === null || !world.has(e)) return;
        if (write(e, value) === false) return;
        if (component) AFTER_EDIT[component]?.(e, field ?? '');
        claimEntity(e); // edited by hand → no longer replaced by build()
        world.changed(e, component, field);
        markDirty();
    });
}

const finite = (v: number, min = -1e6, max = 1e6) => (Number.isFinite(v) ? clamp(v, min, max) : null);

push(selName, (e, v) => { e.name = v.trim().slice(0, 60); }, undefined, 'name');
push(selX, (e, v) => { const n = finite(v); if (n === null) return false; e.position.x = n; });
push(selY, (e, v) => { const n = finite(v); if (n === null) return false; e.position.y = n; });
push(selAngle, (e, v) => { const n = finite(v, -3600, 3600); if (n === null) return false; e.rotation.z = radians(n); });

/* ── component groups ─────────────────────────────────────────────── */

/** Controls for one field, bound to new signals that pull from / push to the component. */
function fieldControls(type: ComponentType, key: string, def: FieldDef, visible: Signal<boolean>): Control[] {
    const name = type.schema.name;
    const label = def.label ?? key;
    const get = (e: ThreeEntity) => world.getComponent<Record<string, any>>(e, name);
    const set = (e: ThreeEntity, value: unknown) => {
        const c = get(e);
        if (!c) return false;
        applyFieldValue(c, key, def, value);
    };

    switch (def.type) {
        case 'number': {
            const signal = new Signal(Number(def.default ?? 0));
            pullers.push((e) => { const c = get(e); if (c) signal.set(round(Number(c[key]))); });
            push(signal, (e, v) => {
                const n = finite(v, def.min ?? -1e6, def.max ?? 1e6);
                return n === null ? false : set(e, n);
            }, name, key);
            return def.min !== undefined && def.max !== undefined
                ? [{ kind: 'slider', label, signal, min: def.min, max: def.max, step: def.step ?? (def.max - def.min) / 100, visible }]
                : [{ kind: 'number', label, signal, step: def.step ?? 1, min: def.min, max: def.max, visible }];
        }

        case 'boolean': {
            const signal = new Signal(!!def.default);
            pullers.push((e) => { const c = get(e); if (c) signal.set(!!c[key]); });
            push(signal, (e, v) => set(e, v), name, key);
            return [{ kind: 'toggle', label, signal, visible }];
        }

        case 'color': {
            const signal = new Signal(toHex(String(def.default ?? '#ffffff')));
            pullers.push((e) => {
                const c = get(e);
                if (c) signal.set(toHex(typeof c[key] === 'string' ? c[key] : `#${c[key]?.getHexString?.() ?? 'ffffff'}`));
            });
            push(signal, (e, v) => set(e, v), name, key);
            return [{ kind: 'color', label, signal, visible }];
        }

        case 'enum': {
            const signal = new Signal(String(def.default ?? def.options?.[0] ?? ''));
            pullers.push((e) => { const c = get(e); if (c) signal.set(String(c[key])); });
            push(signal, (e, v) => set(e, v), name, key);
            return [{ kind: 'choice', label, options: (def.options ?? []).map((o) => ({ value: o, label: o })), value: signal, visible }];
        }

        case 'vec2':
        case 'vec3': {
            const axes = def.type === 'vec3' ? ['x', 'y', 'z'] as const : ['x', 'y'] as const;
            const signals = axes.map(() => new Signal(0));
            pullers.push((e) => {
                const c = get(e);
                if (c) axes.forEach((a, i) => signals[i].set(round(Number(c[key]?.[a] ?? 0))));
            });
            axes.forEach((a, i) => push(signals[i], (e, v) => {
                const c = get(e);
                const n = finite(v);
                if (!c || n === null) return false;
                const current = { x: c[key]?.x ?? 0, y: c[key]?.y ?? 0, z: c[key]?.z ?? 0 };
                current[a] = n;
                return set(e, current);
            }, name, key));
            return [{
                kind: 'row',
                visible,
                controls: [
                    { kind: 'text', text: label, tone: new Signal('muted') },
                    ...axes.map((a, i) => ({ kind: 'number' as const, label: a, signal: signals[i], step: def.step ?? 1 })),
                ],
            }];
        }

        default: {
            // string, asset, entity (a uuid, for now)
            const signal = new Signal(String(def.default ?? ''));
            pullers.push((e) => { const c = get(e); if (c) signal.set(c[key] == null ? '' : String(c[key])); });
            push(signal, (e, v) => set(e, def.type === 'entity' && !v.trim() ? null : v.trim().slice(0, 200)), name, key);
            if (def.readonly) {
                return [{ kind: 'text', text: computed(() => `${label}: ${signal.get()}`), tone: new Signal('muted'), visible }];
            }
            return [{ kind: 'input', label, signal, placeholder: def.type === 'entity' ? 'entity uuid' : '', visible }];
        }
    }
}

/** The inspector group for one component type: heading + remove, then its fields. */
export function componentGroup(type: ComponentType): Control[] {
    const name = type.schema.name;
    const present = computed(() => editable.get() && selComponents.get().includes(name));
    // bumped after every pull, so showIf (which reads the component) re-evaluates
    const tick = new Signal(0);
    pullers.push(() => tick.set(tick.get() + 1));

    const controls: Control[] = [{
        kind: 'row',
        visible: present,
        controls: [
            { kind: 'text', text: name, tone: new Signal('heading') },
            { kind: 'button', label: '×', title: `remove ${name}`, action: () => removeComponentFromSelected(name) },
        ],
    }];

    for (const [key, def] of Object.entries(type.schema.fields)) {
        if (def.hidden) continue;
        const showIf = def.showIf;
        const visible = showIf
            ? computed(() => {
                tick.get();
                if (!present.get()) return false;
                const e = selected.get();
                const c = e && world.getComponent(e, name);
                return !!c && showIf(c);
            })
            : present;
        controls.push(...fieldControls(type, key, def, visible));
    }
    return controls;
}

/** "Add component" buttons for every registered type the selected entity doesn't have. */
export function addComponentButtons(types: ComponentType[]): Control[] {
    const any = computed(() => editable.get() && types.some((t) => !selComponents.get().includes(t.schema.name)));
    return [
        { kind: 'text', text: 'add component', tone: new Signal('heading'), visible: any },
        {
            kind: 'row',
            visible: any,
            controls: types.map((t) => ({
                kind: 'button' as const,
                label: `+ ${t.schema.name}`,
                action: () => addComponentToSelected(t.schema.name),
                visible: computed(() => !selComponents.get().includes(t.schema.name)),
            })),
        },
    ];
}

// Subscribed last, so every field's puller is registered before the first pull.
queueMicrotask(() => {
    selected.subscribe(pull);
    revision.subscribe(pull);
    worldRevision.subscribe(pull);
});

function round(v: number): number {
    return Math.round(v * 100) / 100;
}

/** <input type=color> only takes #rrggbb. */
function toHex(color: string): string {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + [...color.slice(1)].map((c) => c + c).join('');
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return '#ffffff';
    ctx.fillStyle = color;
    return /^#[0-9a-f]{6}$/i.test(ctx.fillStyle) ? ctx.fillStyle : '#ffffff';
}
