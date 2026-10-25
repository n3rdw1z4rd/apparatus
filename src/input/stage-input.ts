import { GestureRecognizer } from '@n3rdw1z4rd/core';
import { pickEntity, type ThreeEntity } from '@n3rdw1z4rd/core/three';
import { RigidBody } from '../core/components';
import {
    bodyIdOf, camera, fitView, markDirty, mode, moveEntity, scriptState, selected, setHovered, setPointer, viewMode, world,
} from '../app/store';
import { showTab } from '../app/ui-state';

/* ------------------------------------------------------------------ */
/* Pointer, touch and wheel input on the stage canvas.                  */
/*                                                                      */
/*  build: tap/click a part to select it, drag it to move it (snapped), */
/*         drag empty space to pan                                      */
/*  play:  drag a body to throw it around; drag empty space to pan      */
/*         (or, while a script runs, to feed it world.pointer)          */
/*  both:  two fingers pan + pinch-zoom; wheel zooms (ctrl+wheel and    */
/*         trackpad pinch too); right/middle drag pans; double-tap or   */
/*  3D view: dragging empty space (or right-drag) orbits instead;       */
/*         middle drag and shift+drag pan                               */
/*  gizmo: a press on a gizmo handle belongs to the gizmo               */
/*         double-click empty space fits the view; long-press or       */
/*         double-click a part opens its inspector                      */
/* ------------------------------------------------------------------ */

type Drag =
    | { kind: 'none' }
    | { kind: 'part'; entity: ThreeEntity; dx: number; dy: number; moved: boolean }
    | { kind: 'pan' }
    | { kind: 'orbit' }
    | { kind: 'gizmo' }
    | { kind: 'grab'; entity: ThreeEntity }
    | { kind: 'pointer' }; // play + running script: the pointer belongs to the script

/** Only parts are pickable (not the gizmo or other helpers). */
const pick = (x: number, y: number, slopPx = 0): ThreeEntity | null =>
    pickEntity(world, camera, x, y, { slopPx })?.entity ?? null;

/**
 * Hooks the stage canvas up. `gizmoActive` says whether the pointer is on a gizmo handle;
 * the gizmo must be created before this, so its pointerdown runs first.
 */
export function attachStageInput(canvas: HTMLCanvasElement, opts: { gizmoActive: () => boolean }): { update: () => void } {
    const gestures = new GestureRecognizer({ longPressDuration: 450 });
    const touches = new Set<number>();
    let primary: number | null = null;
    let drag: Drag = { kind: 'none' };
    let last = { x: 0, y: 0 };
    let over = false;

    const local = (ev: PointerEvent | WheelEvent | MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };

    const sendPointer = (sx: number, sy: number, down: boolean) => {
        const w = camera.screenToWorld(sx, sy, 0);
        if (!w) return;
        // the worker speaks +y down
        setPointer({ x: w.x, y: -w.y, down, active: over, grab: drag.kind === 'grab' ? bodyIdOf(drag.entity) : null });
    };

    const is3d = () => viewMode.get() === '3d';
    /** dragging empty space: pan in 2D, orbit in 3D (shift pans) */
    const emptyDrag = (ev: PointerEvent): Drag => (is3d() && !ev.shiftKey ? { kind: 'orbit' } : { kind: 'pan' });

    const endDrag = () => {
        if (drag.kind === 'part' && drag.moved) markDirty();
        drag = { kind: 'none' };
        primary = null;
        canvas.classList.remove('dragging', 'panning');
    };

    canvas.addEventListener('pointerdown', (ev) => {
        const p = local(ev);
        if (ev.pointerType === 'touch') {
            touches.add(ev.pointerId);
            gestures.down(ev.pointerId, p.x, p.y, performance.now());
            if (touches.size > 1) {
                // A second finger turns whatever was happening into pan/pinch.
                endDrag();
                sendPointer(p.x, p.y, false);
                return;
            }
        }

        canvas.setPointerCapture(ev.pointerId);
        primary = ev.pointerId;
        last = p;
        over = true;

        if (ev.button === 1 || ev.button === 2) {
            drag = ev.button === 2 && is3d() && !ev.shiftKey ? { kind: 'orbit' } : { kind: 'pan' };
            canvas.classList.add('panning');
            return;
        }
        if (ev.button !== 0) return;

        if (mode.get() === 'build' && opts.gizmoActive()) {
            drag = { kind: 'gizmo' };
            return;
        }

        const w = camera.screenToWorld(p.x, p.y, 0);
        const hit = pick(p.x, p.y, ev.pointerType === 'touch' ? 14 : 0);

        if (mode.get() === 'build') {
            if (hit !== null && w) {
                selected.set(hit);
                drag = { kind: 'part', entity: hit, dx: w.x - hit.position.x, dy: w.y - hit.position.y, moved: false };
                canvas.classList.add('dragging');
            } else {
                selected.set(null);
                drag = emptyDrag(ev);
                canvas.classList.add('panning');
            }
            return;
        }

        // play
        if (hit !== null && !world.getComponent<RigidBody>(hit, RigidBody)?.fixed) {
            drag = { kind: 'grab', entity: hit };
            canvas.classList.add('dragging');
        } else if (scriptState.get().kind === 'running') {
            drag = { kind: 'pointer' };
        } else {
            drag = emptyDrag(ev);
            canvas.classList.add('panning');
        }
        sendPointer(p.x, p.y, true);
    });

    canvas.addEventListener('pointermove', (ev) => {
        const p = local(ev);
        if (ev.pointerType === 'touch') {
            gestures.move(ev.pointerId, p.x, p.y);
            if (touches.size > 1) return;
        }

        if (ev.pointerId !== primary) {
            // plain hover (mouse, no button)
            if (ev.pointerType === 'mouse' && mode.get() === 'build' && !opts.gizmoActive()) {
                const hit = pick(p.x, p.y);
                setHovered(hit);
                canvas.style.cursor = hit !== null ? 'grab' : '';
            } else {
                setHovered(null);
            }
            if (mode.get() === 'play') sendPointer(p.x, p.y, false);
            return;
        }

        const dx = p.x - last.x;
        const dy = p.y - last.y;
        last = p;

        switch (drag.kind) {
            case 'part': {
                const w = camera.screenToWorld(p.x, p.y, 0);
                if (!w) break;
                moveEntity(drag.entity, w.x - drag.dx, w.y - drag.dy);
                drag.moved = true;
                break;
            }
            case 'pan':
                camera.pan(dx, dy);
                break;
            case 'orbit':
                camera.rotate(dx, dy);
                break;
        }

        if (mode.get() === 'play') sendPointer(p.x, p.y, drag.kind !== 'pan' && drag.kind !== 'orbit');
    });

    const up = (ev: PointerEvent) => {
        const p = local(ev);
        if (ev.pointerType === 'touch') {
            touches.delete(ev.pointerId);
            if (ev.type === 'pointercancel') gestures.cancel(ev.pointerId);
            else gestures.up(ev.pointerId, p.x, p.y, performance.now());
        }
        if (ev.pointerId !== primary) return;
        endDrag();
        if (mode.get() === 'play') sendPointer(p.x, p.y, false);
    };

    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (ev) => {
        if (ev.pointerType !== 'mouse') return;
        over = false;
        setHovered(null);
        if (mode.get() === 'play' && primary === null) sendPointer(local(ev).x, local(ev).y, false);
    });

    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

    canvas.addEventListener('dblclick', (ev) => {
        const p = local(ev);
        if (opts.gizmoActive()) return;
        const hit = pick(p.x, p.y);
        if (hit !== null && mode.get() === 'build') {
            selected.set(hit);
            showTab('inspect');
        } else if (hit === null) {
            fitView();
        }
    });

    canvas.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const p = local(ev);
        const scale = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
        // Trackpad two-finger scroll pans; pinch (ctrlKey) and mouse wheels zoom.
        if (!ev.ctrlKey && ev.deltaX !== 0) {
            camera.pan(-ev.deltaX * scale, -ev.deltaY * scale);
            return;
        }
        const k = ev.ctrlKey ? 0.01 : 0.0015;
        camera.zoomAt(p.x, p.y, Math.exp(-ev.deltaY * scale * k));
    }, { passive: false });

    window.addEventListener('blur', () => {
        gestures.clear();
        touches.clear();
        endDrag();
    });

    /** Runs once per frame: two-finger pan/pinch, double-tap, long-press. */
    function update(): void {
        const frame = gestures.update(performance.now());

        if (touches.size >= 2) {
            const pts = gestures.touches;
            if (pts.length >= 2) {
                const cx = (pts[0].x + pts[1].x) / 2;
                const cy = (pts[0].y + pts[1].y) / 2;
                if (frame.pinch !== 1) camera.zoomAt(cx, cy, frame.pinch);
            }
            if (frame.pan.x || frame.pan.y) camera.pan(frame.pan.x, frame.pan.y);
        }

        for (const ev of frame.events) {
            const hit = pick(ev.x, ev.y, 14);

            if (ev.gesture === 'doubleTap' && hit === null) fitView();

            if (ev.gesture === 'longPress' && hit !== null && mode.get() === 'build') {
                // Long-press is "inspect", not "drag": stop the drag that began on touch-down.
                if (drag.kind === 'part') endDrag();
                selected.set(hit);
                showTab('inspect');
                navigator.vibrate?.(10);
            }
        }
    }

    return { update };
}
