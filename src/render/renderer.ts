import { CanvasRenderer, Clock, type ECS, type Entity } from '@n3rdw1z4rd/core';
import { Body, Look, Meta, Shape, Transform, partEntities } from '../core/components';
import type { Camera } from '../core/camera';

export interface ViewOptions {
    grid: number;
    showGrid: boolean;
    showLabels: boolean;
    selected: Entity | null;
    hovered: Entity | null;
    /** build mode draws generated parts with a marker and the origin cross */
    building: boolean;
}

/**
 * Draws the scene with core's CanvasRenderer. The canvas is sized in device
 * pixels for crisp lines on high-DPI screens; everything else is in CSS px.
 */
export class Renderer {
    readonly canvas: HTMLCanvasElement;
    readonly clock = new Clock();
    private readonly r: CanvasRenderer;
    private dpr = 1;

    constructor(container: HTMLElement, private readonly camera: Camera) {
        this.r = new CanvasRenderer();
        this.canvas = this.r.canvas;
        this.canvas.className = 'stage-canvas';
        container.prepend(this.canvas);
        this.resize();
        new ResizeObserver(() => this.resize()).observe(container);
    }

    get context(): CanvasRenderingContext2D {
        return this.r.context;
    }

    resize(): void {
        const rect = this.canvas.getBoundingClientRect();
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.camera.width = Math.max(1, rect.width);
        this.camera.height = Math.max(1, rect.height);
        this.r.resize(Math.round(this.camera.width * this.dpr), Math.round(this.camera.height * this.dpr));
    }

    start(frame: (dt: number) => void): void {
        this.clock.start((dt) => frame(dt));
    }

    draw(ecs: ECS, opts: ViewOptions): void {
        const ctx = this.r.context;
        const cam = this.camera;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.r.clear();

        ctx.setTransform(
            this.dpr * cam.zoom, 0, 0, this.dpr * cam.zoom,
            this.dpr * (cam.width / 2 - cam.x * cam.zoom),
            this.dpr * (cam.height / 2 - cam.y * cam.zoom),
        );

        if (opts.showGrid) this.drawGrid(opts.grid);
        if (opts.building) this.drawOrigin();

        for (const e of partEntities(ecs)) this.drawPart(ecs, e, opts);

        if (opts.hovered !== null && opts.hovered !== opts.selected) this.outline(ecs, opts.hovered, 'rgba(255,255,255,0.35)', 1);
        if (opts.selected !== null) this.outline(ecs, opts.selected, '#3fd1a4', 2);
    }

    private drawGrid(grid: number): void {
        const ctx = this.r.context;
        const cam = this.camera;

        // Thin out the lines when zoomed far out so the grid doesn't turn into mush.
        let cell = grid;
        while (cell * cam.zoom < 8) cell *= 2;

        const halfW = cam.width / 2 / cam.zoom;
        const halfH = cam.height / 2 / cam.zoom;
        const x0 = Math.floor((cam.x - halfW) / cell) * cell;
        const x1 = Math.ceil((cam.x + halfW) / cell) * cell;
        const y0 = Math.floor((cam.y - halfH) / cell) * cell;
        const y1 = Math.ceil((cam.y + halfH) / cell) * cell;

        ctx.beginPath();
        for (let x = x0; x <= x1; x += cell) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
        }
        for (let y = y0; y <= y1; y += cell) {
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
        }
        ctx.strokeStyle = '#262626';
        ctx.lineWidth = 1 / cam.zoom;
        ctx.stroke();
    }

    private drawOrigin(): void {
        const ctx = this.r.context;
        const s = 10 / this.camera.zoom;
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.lineTo(s, 0);
        ctx.moveTo(0, -s);
        ctx.lineTo(0, s);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1 / this.camera.zoom;
        ctx.stroke();
    }

    private drawPart(ecs: ECS, e: Entity, opts: ViewOptions): void {
        const t = ecs.getComponent(e, Transform)!;
        const s = ecs.getComponent(e, Shape)!;
        const b = ecs.getComponent(e, Body);
        const color = ecs.getComponent(e, Look)?.color ?? '#ccc';
        const meta = ecs.getComponent(e, Meta);
        const ctx = this.r.context;
        const z = this.camera.zoom;

        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);

        if (s.kind === 'box') {
            this.r.drawRect(0, 0, s.w, s.h, { color, filled: true });
            this.r.drawRect(0, 0, s.w, s.h, { color: 'rgba(0,0,0,0.35)', size: 1 / z });
        } else {
            this.r.drawCircle(0, 0, s.r, { color, filled: true });
            this.r.drawCircle(0, 0, s.r, { color: 'rgba(0,0,0,0.35)', size: 1 / z });
            // a spoke, so rolling is visible
            this.r.drawLine(0, 0, s.r * 0.8, 0, { color: 'rgba(0,0,0,0.35)', size: Math.max(1 / z, s.r * 0.08) });
        }

        if (b?.fixed) {
            // fixed parts get a pin in the middle
            const pin = Math.min(4 / z, (s.kind === 'ball' ? s.r : Math.min(s.w, s.h) / 2) * 0.5);
            this.r.drawCircle(0, 0, pin, { color: 'rgba(0,0,0,0.45)', filled: true });
        }

        if (opts.building && meta?.gen) {
            // generated by the script's build(): a small corner tick
            const k = Math.min(6 / z, (s.kind === 'ball' ? s.r : Math.min(s.w, s.h)) * 0.4);
            const ox = s.kind === 'ball' ? s.r * 0.7 : s.w / 2;
            const oy = s.kind === 'ball' ? -s.r * 0.7 : -s.h / 2;
            ctx.beginPath();
            ctx.moveTo(ox - k, oy);
            ctx.lineTo(ox, oy);
            ctx.lineTo(ox, oy + k);
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = 1.5 / z;
            ctx.stroke();
        }

        ctx.restore();

        if (opts.showLabels && z > 0.5) {
            const label = [
                meta?.tag ? `#${meta.tag}` : '',
                `${t.x.toFixed(0)}, ${t.y.toFixed(0)}`,
                t.angle ? `${((t.angle * 180) / Math.PI).toFixed(0)}°` : '',
            ].filter(Boolean).join('  ');
            const top = s.kind === 'ball' ? s.r : Math.max(s.w, s.h) / 2;
            this.r.drawText(t.x, t.y - top - 4 / z, label, {
                size: 10 / z,
                color: '#9a9a9a',
                textAlign: 'center',
                textBaseline: 'bottom',
            });
        }
    }

    private outline(ecs: ECS, e: Entity, color: string, width: number): void {
        const t = ecs.getComponent(e, Transform);
        const s = ecs.getComponent(e, Shape);
        if (!t || !s) return;
        const ctx = this.r.context;
        const z = this.camera.zoom;
        const pad = 3 / z;

        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);
        if (s.kind === 'box') {
            this.r.drawRect(0, 0, s.w + pad * 2, s.h + pad * 2, { color, size: width / z, lineDash: [4 / z, 3 / z] });
        } else {
            this.r.drawCircle(0, 0, s.r + pad, { color, size: width / z, lineDash: [4 / z, 3 / z] });
        }
        ctx.restore();
    }
}
