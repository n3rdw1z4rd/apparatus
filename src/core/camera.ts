import { clamp } from '@n3rdw1z4rd/core';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

/**
 * A 2D camera: (x, y) is the world point at the center of the view, zoom is
 * screen px per world px. Screen coordinates are CSS px relative to the canvas.
 */
export class Camera {
    x = 0;
    y = 0;
    zoom = 1;
    /** view size in CSS px (kept in sync by the renderer) */
    width = 1;
    height = 1;

    screenToWorld(sx: number, sy: number): { x: number; y: number } {
        return {
            x: (sx - this.width / 2) / this.zoom + this.x,
            y: (sy - this.height / 2) / this.zoom + this.y,
        };
    }

    worldToScreen(wx: number, wy: number): { x: number; y: number } {
        return {
            x: (wx - this.x) * this.zoom + this.width / 2,
            y: (wy - this.y) * this.zoom + this.height / 2,
        };
    }

    /** Pans by a screen-space delta (the world follows the finger). */
    pan(dx: number, dy: number): void {
        this.x -= dx / this.zoom;
        this.y -= dy / this.zoom;
    }

    /** Zooms by `factor`, keeping the world point under (sx, sy) fixed. */
    zoomAt(sx: number, sy: number, factor: number): void {
        const before = this.screenToWorld(sx, sy);
        this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const after = this.screenToWorld(sx, sy);
        this.x += before.x - after.x;
        this.y += before.y - after.y;
    }

    /**
     * Frames a world-space box inside the view, leaving `margin` CSS px and
     * keeping clear of `insets` (screen edges covered by the panel etc.).
     */
    fit(minX: number, minY: number, maxX: number, maxY: number, insets = { l: 0, r: 0, t: 0, b: 0 }, margin = 48): void {
        const w = Math.max(1, maxX - minX);
        const h = Math.max(1, maxY - minY);
        const viewW = Math.max(1, this.width - insets.l - insets.r - margin * 2);
        const viewH = Math.max(1, this.height - insets.t - insets.b - margin * 2);
        this.zoom = clamp(Math.min(viewW / w, viewH / h), MIN_ZOOM, 2);
        // center the box in the uncovered area, not the whole canvas
        this.x = (minX + maxX) / 2 - (insets.l - insets.r) / 2 / this.zoom;
        this.y = (minY + maxY) / 2 - (insets.t - insets.b) / 2 / this.zoom;
    }
}
