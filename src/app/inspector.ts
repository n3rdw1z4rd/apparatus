import { computed, Signal } from '@n3rdw1z4rd/smoke-ui';
import { Body, Look, Meta, Shape, Transform } from '../core/components';
import { ecs, markDirty, mode, revision, selected, snap, snapEntity } from './store';

/* ------------------------------------------------------------------ */
/* The selected part's fields, as signals the panel binds to.           */
/*                                                                      */
/* Selecting a part (or editing it elsewhere, e.g. dragging) pulls its  */
/* values in; editing a field writes it back to the entity.             */
/* ------------------------------------------------------------------ */

export const hasSelection = computed(() => selected.get() !== null);
export const editable = computed(() => selected.get() !== null && mode.get() === 'build');

export const selShape = new Signal<'box' | 'ball'>('box');
export const isBox = computed(() => selShape.get() === 'box');
export const isBall = computed(() => selShape.get() === 'ball');

export const selX = new Signal(0);
export const selY = new Signal(0);
export const selW = new Signal(32);
export const selH = new Signal(32);
export const selR = new Signal(16);
/** degrees, for humans */
export const selAngle = new Signal(0);
export const selColor = new Signal('#ffffff');
export const selFixed = new Signal(false);
export const selFriction = new Signal(0.5);
export const selBounce = new Signal(0.1);
export const selDensity = new Signal(1);
export const selTag = new Signal('');
export const selGenerated = new Signal(false);

let pulling = false;

function pull(): void {
    const e = selected.get();
    if (e === null) return;
    const t = ecs.getComponent(e, Transform);
    const s = ecs.getComponent(e, Shape);
    const b = ecs.getComponent(e, Body);
    if (!t || !s || !b) return;

    pulling = true;
    try {
        selShape.set(s.kind);
        selX.set(round(t.x));
        selY.set(round(t.y));
        selW.set(round(s.w));
        selH.set(round(s.h));
        selR.set(round(s.r));
        selAngle.set(Math.round((t.angle * 180) / Math.PI * 10) / 10);
        selColor.set(toHex(ecs.getComponent(e, Look)?.color ?? '#ffffff'));
        selFixed.set(b.fixed);
        selFriction.set(b.friction);
        selBounce.set(b.bounce);
        selDensity.set(b.density);
        selTag.set(ecs.getComponent(e, Meta)?.tag ?? '');
        selGenerated.set(!!ecs.getComponent(e, Meta)?.gen);
    } finally {
        pulling = false;
    }
}

selected.subscribe(pull);
revision.subscribe(pull);

/** Binds a field signal to a write into the selected entity. */
function push<T>(signal: Signal<T>, write: (e: number, value: T) => boolean | void): void {
    signal.subscribe((value) => {
        if (pulling || mode.get() === 'play') return;
        const e = selected.get();
        if (e === null) return;
        // `write` returns true when the change should re-snap the part.
        const resnap = write(e, value);
        const meta = ecs.getComponent(e, Meta);
        if (meta) meta.gen = false; // edited by hand → no longer replaced by build()
        if (resnap && snap.get()) snapEntity(e);
        markDirty();
    });
}

const finite = (v: number, min = -1e6, max = 1e6) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);

push(selX, (e, v) => { const n = finite(v); if (n !== null) ecs.getComponent(e, Transform)!.x = n; });
push(selY, (e, v) => { const n = finite(v); if (n !== null) ecs.getComponent(e, Transform)!.y = n; });
push(selW, (e, v) => { const n = finite(v, 1, 1e5); if (n !== null) ecs.getComponent(e, Shape)!.w = n; return true; });
push(selH, (e, v) => { const n = finite(v, 1, 1e5); if (n !== null) ecs.getComponent(e, Shape)!.h = n; return true; });
push(selR, (e, v) => { const n = finite(v, 0.5, 5e4); if (n !== null) ecs.getComponent(e, Shape)!.r = n; return true; });
push(selAngle, (e, v) => { const n = finite(v, -3600, 3600); if (n !== null) ecs.getComponent(e, Transform)!.angle = (n * Math.PI) / 180; });
push(selColor, (e, v) => { ecs.getComponent(e, Look)!.color = v; });
push(selFixed, (e, v) => { ecs.getComponent(e, Body)!.fixed = v; });
push(selFriction, (e, v) => { ecs.getComponent(e, Body)!.friction = v; });
push(selBounce, (e, v) => { ecs.getComponent(e, Body)!.bounce = v; });
push(selDensity, (e, v) => { ecs.getComponent(e, Body)!.density = Math.max(0.01, v); });
push(selTag, (e, v) => { ecs.getComponent(e, Meta)!.tag = v.trim().slice(0, 40); });

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
