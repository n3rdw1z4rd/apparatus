import { GestureRecognizer, type Entity } from '@n3rdw1z4rd/core';
import { Body, pickAt, Transform } from '../core/components';
import {
    camera, ecs, fitView, markDirty, mode, moveEntity, scriptState, selected, setHovered, setPointer,
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
/*         double-click empty space fits the view; long-press or       */
/*         double-click a part opens its inspector                      */
/* ------------------------------------------------------------------ */

type Drag =
    | { kind: 'none' }
    | { kind: 'part'; entity: Entity; dx: number; dy: number; moved: boolean }
    | { kind: 'pan' }
    | { kind: 'grab'; entity: Entity }
    | { kind: 'pointer' }; // play + running script: the pointer belongs to the script

export function attachStageInput(canvas: HTMLCanvasElement): { update: () => void } {
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
        const w = camera.screenToWorld(sx, sy);
        setPointer({ x: w.x, y: w.y, down, active: over, grab: drag.kind === 'grab' ? drag.entity : null });
    };

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
            drag = { kind: 'pan' };
            canvas.classList.add('panning');
            return;
        }
        if (ev.button !== 0) return;

        const w = camera.screenToWorld(p.x, p.y);
        const slop = ev.pointerType === 'touch' ? 14 / camera.zoom : 0;
        const hit = pickAt(ecs, w.x, w.y, slop);

        if (mode.get() === 'build') {
            if (hit !== null) {
                selected.set(hit);
                const t = ecs.getComponent(hit, Transform)!;
                drag = { kind: 'part', entity: hit, dx: w.x - t.x, dy: w.y - t.y, moved: false };
                canvas.classList.add('dragging');
            } else {
                selected.set(null);
                drag = { kind: 'pan' };
                canvas.classList.add('panning');
            }
            return;
        }

        // play
        if (hit !== null && !ecs.getComponent(hit, Body)?.fixed) {
            drag = { kind: 'grab', entity: hit };
            canvas.classList.add('dragging');
        } else if (scriptState.get().kind === 'running') {
            drag = { kind: 'pointer' };
        } else {
            drag = { kind: 'pan' };
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
            if (ev.pointerType === 'mouse' && mode.get() === 'build') {
                const w = camera.screenToWorld(p.x, p.y);
                const hit = pickAt(ecs, w.x, w.y);
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
                const w = camera.screenToWorld(p.x, p.y);
                moveEntity(drag.entity, w.x - drag.dx, w.y - drag.dy);
                drag.moved = true;
                break;
            }
            case 'pan':
                camera.pan(dx, dy);
                break;
        }

        if (mode.get() === 'play') sendPointer(p.x, p.y, drag.kind !== 'pan');
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
        const w = camera.screenToWorld(p.x, p.y);
        const hit = pickAt(ecs, w.x, w.y);
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
            const w = camera.screenToWorld(ev.x, ev.y);
            const hit = pickAt(ecs, w.x, w.y, 14 / camera.zoom);

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
