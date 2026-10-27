/* ------------------------------------------------------------------ */
/* Wheel events, read the way each device means them:                   */
/*  - trackpad two-finger scroll → pan (both axes)                      */
/*  - trackpad pinch (the browser sends it with ctrlKey) → zoom         */
/*  - ⌘ / ctrl + scroll → zoom                                          */
/*  - a mouse wheel (whole notches) → zoom                              */
/* ------------------------------------------------------------------ */

export type WheelIntent =
    | { kind: 'pan'; dx: number; dy: number }
    | { kind: 'zoom'; factor: number };

/**
 * A mouse wheel moves in notches: line / page units, or pixel deltas of exactly ±120 per
 * notch (wheelDelta). Trackpads send small, smooth pixel deltas.
 */
function isMouseWheel(e: WheelEvent): boolean {
    if (e.deltaMode !== 0) return true;
    const wd = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    return e.deltaX === 0 && typeof wd === 'number' && wd !== 0 && wd % 120 === 0;
}

export function wheelIntent(e: WheelEvent): WheelIntent {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(-dy * 0.01) }; // pinch (or ctrl + wheel)
    if (e.metaKey || isMouseWheel(e)) return { kind: 'zoom', factor: Math.exp(-dy * 0.0015) };
    return { kind: 'pan', dx, dy };
}
