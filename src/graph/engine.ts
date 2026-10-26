import { EditorCamera, World, type ThreeEntity } from '@n3rdw1z4rd/core/three';
import { Look, Meta, RigidBody, Shape } from '../core/components';
import type { PartDef } from '../core/scene';
import { PhysicsClient, type FrameInfo } from '../physics/physics-client';
import { Renderer } from '../render/renderer';
import type { EntityData, SceneData } from './scene-nodes';

/* ------------------------------------------------------------------ */
/* The engine: runs a SceneData. Each scene entity becomes a World      */
/* entity (diffed by id, so editing the graph updates the view in      */
/* place); the existing three.js renderer draws it; ▶ hands the bodies */
/* to the Rapier worker. While playing, physics owns the bodies and    */
/* the graph (if animated) keeps driving everything else.               */
/* ------------------------------------------------------------------ */

export type EngineState = 'building' | 'playing';

export class Engine {
    readonly world = new World();
    readonly camera = new EditorCamera({ orbit: false });
    readonly renderer: Renderer;
    state: EngineState = 'building';
    /** set by the host: called each frame before drawing (per-frame graph evaluation) */
    onFrame: (time: number, dt: number, frame: number) => void = () => {};
    onStateChange: (state: EngineState) => void = () => {};

    private scene: SceneData | null = null;
    private readonly byId = new Map<string, ThreeEntity>();
    private physics: PhysicsClient | null = null;
    private bodyIds = new Map<number, ThreeEntity>();
    private time = 0;
    private frame = 0;
    private fitted = false;

    constructor(container: HTMLElement) {
        this.camera.minZoom = 0.05;
        this.camera.maxZoom = 8;
        this.renderer = new Renderer(container, this.camera, this.world);
        this.renderer.canvas.classList.add('viewport-canvas');
        this.attachInput();
        this.renderer.start((dt) => this.tick(dt));
    }

    /** Shows a new evaluation of the graph. */
    setScene(scene: SceneData | null): void {
        this.scene = scene;
        this.renderer.gl.setClearColor(scene?.background ?? '#111111');
        if (!scene) {
            this.world.clear();
            this.byId.clear();
            return;
        }

        const seen = new Set<string>();
        for (const data of scene.entities) {
            seen.add(data.id);
            let e = this.byId.get(data.id);
            if (!e) {
                if (this.state === 'playing' && data.body) continue; // new bodies join on the next play
                e = this.world.create(data.tag || data.id);
                this.world.addComponent(e, Shape);
                this.world.addComponent(e, Look);
                this.world.addComponent(e, Meta);
                this.byId.set(data.id, e);
            }
            // physics owns simulated bodies while playing
            if (this.state === 'playing' && this.isSimulated(e)) continue;
            this.apply(e, data);
        }
        for (const [id, e] of this.byId) {
            if (seen.has(id) || (this.state === 'playing' && this.isSimulated(e))) continue;
            this.world.remove(e);
            this.byId.delete(id);
        }


    }

    play(): void {
        if (this.state === 'playing' || !this.scene) return;
        this.ensurePhysics();
        this.bodyIds.clear();
        const bodies: { id: number; part: PartDef }[] = [];
        let n = 1;
        for (const data of this.scene.entities) {
            const e = this.byId.get(data.id);
            if (!e || !data.body) continue;
            this.bodyIds.set(n, e);
            bodies.push({ id: n++, part: toPart(data) });
        }
        const g = this.scene.gravity;
        // the worker speaks the legacy convention: +y down
        this.physics!.play({ bodies, gravity: { x: g.x, y: -g.y }, timeScale: 1, paused: false, seed: 1, grid: 32, script: null });
        this.time = 0;
        this.frame = 0;
        this.setState('playing');
    }

    stop(): void {
        if (this.state !== 'playing') return;
        this.physics?.stop();
        this.bodyIds.clear();
        this.time = 0;
        this.frame = 0;
        this.setState('building');
        // snap back to what the graph says
        const scene = this.scene;
        this.scene = null;
        this.setScene(scene);
        this.onFrame(0, 0, 0);
    }

    fit(): void {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        // a long fixed floor or wall shouldn't zoom the interesting parts down to specks:
        // it only counts vertically (as in the original apparatus)
        const huge = 24 * 32;
        for (const data of this.scene?.entities ?? []) {
            const ext = data.shape === 'ball' ? data.r : Math.hypot(data.w, data.h) / 2;
            minY = Math.min(minY, data.y - ext); maxY = Math.max(maxY, data.y + ext);
            if (data.body?.fixed && data.shape === 'box' && data.w > huge) continue;
            minX = Math.min(minX, data.x - ext); maxX = Math.max(maxX, data.x + ext);
        }
        if (!Number.isFinite(minX) && Number.isFinite(minY)) {
            minX = -huge / 2;
            maxX = huge / 2;
        }
        if (!Number.isFinite(minX)) {
            this.camera.target.set(0, 0, 0);
            this.camera.zoom = 1;
            this.camera.update();
            return;
        }
        this.camera.fit(minX, minY, maxX, maxY, undefined, 24, 4);
    }

    dispose(): void {
        this.renderer.clock.stop();
        this.physics?.dispose('viewport closed');
        this.renderer.gl.dispose();
    }

    /* ── internals ─────────────────────────────────────────────── */

    private setState(s: EngineState): void {
        this.state = s;
        this.onStateChange(s);
    }

    private isSimulated(e: ThreeEntity): boolean {
        for (const b of this.bodyIds.values()) if (b === e) return true;
        return false;
    }

    private apply(e: ThreeEntity, d: EntityData): void {
        e.position.set(d.x, d.y, 0);
        e.rotation.z = (d.angle * Math.PI) / 180;
        e.name = d.tag || d.id;
        const s = this.world.getComponent<Shape>(e, Shape)!;
        s.kind = d.shape;
        s.w = d.w;
        s.h = d.h;
        s.r = d.r;
        this.world.getComponent<Look>(e, Look)!.color = d.color;
        this.world.getComponent<Meta>(e, Meta)!.tag = d.tag;
        if (d.body) {
            const b = this.world.getComponent<RigidBody>(e, RigidBody) ?? this.world.addComponent(e, RigidBody);
            Object.assign(b, d.body);
        } else if (this.world.hasComponent(e, RigidBody)) {
            this.world.removeComponent(e, RigidBody);
        }
    }

    private ensurePhysics(): void {
        if (this.physics) return;
        this.physics = new PhysicsClient();
        this.physics.onFrame = (f) => this.applyFrame(f);
        this.physics.onError.subscribe(() => this.restartPhysics());
    }

    private restartPhysics(): void {
        this.physics?.dispose('restarted');
        this.physics = null;
        if (this.state === 'playing') this.stop();
    }

    private applyFrame(f: FrameInfo): void {
        if (this.state !== 'playing') return;
        const d = f.data;
        for (let i = 0; i < d.length; i += 4) {
            const e = this.bodyIds.get(d[i]);
            if (!e) continue;
            e.position.x = d[i + 1];
            e.position.y = -d[i + 2];
            e.rotation.z = -d[i + 3];
        }
    }

    private tick(dt: number): void {
        // frame the first scene once the viewport has a real size
        if (!this.fitted && this.scene?.entities.length && this.camera.width > 20 && this.camera.height > 20) {
            this.fitted = true;
            this.fit();
        }
        if (this.state === 'playing') {
            this.time += dt;
            this.frame++;
            this.onFrame(this.time, dt, this.frame);
            if (this.physics?.hung) this.restartPhysics();
        }
        this.renderer.draw({
            grid: 32,
            showGrid: this.state === 'building',
            showLabels: false,
            selected: null,
            hovered: null,
            building: false,
            gizmo: 'off',
            flat: true,
        });
    }

    /**
     * Pan (drag), zoom (wheel / pinch), fit (double-click). Events don't reach the graph canvas.
     * Pointer coordinates are converted to the canvas's own px: the viewport may sit inside a
     * zoomed (CSS-scaled) node graph.
     */
    private attachInput(): void {
        const el = this.renderer.canvas;
        const scale = () => el.getBoundingClientRect().width / Math.max(1, el.clientWidth) || 1;
        const local = (cx: number, cy: number) => {
            const r = el.getBoundingClientRect();
            const k = scale();
            return { x: (cx - r.left) / k, y: (cy - r.top) / k };
        };
        const pointers = new Map<number, { x: number; y: number }>();
        let pinch = 0;

        el.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            el.setPointerCapture(ev.pointerId);
            pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
            pinch = 0;
        });
        el.addEventListener('pointermove', (ev) => {
            const prev = pointers.get(ev.pointerId);
            if (!prev) return;
            ev.stopPropagation();
            const cur = { x: ev.clientX, y: ev.clientY };
            pointers.set(ev.pointerId, cur);
            if (pointers.size === 1) {
                const k = scale();
                this.camera.pan((cur.x - prev.x) / k, (cur.y - prev.y) / k);
            } else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                const c = local((a.x + b.x) / 2, (a.y + b.y) / 2);
                if (pinch) this.camera.zoomAt(c.x, c.y, d / pinch);
                pinch = d;
            }
        });
        const up = (ev: PointerEvent) => {
            pointers.delete(ev.pointerId);
            pinch = 0;
        };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const p = local(ev.clientX, ev.clientY);
            this.camera.zoomAt(p.x, p.y, Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)));
        }, { passive: false });
        el.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            this.fit();
        });
    }
}

/** Scene entity (editor coordinates) → the physics worker's part (+y down, clockwise). */
function toPart(d: EntityData): PartDef {
    const part: PartDef = {
        shape: d.shape, x: d.x, y: -d.y, angle: -(d.angle * Math.PI) / 180, color: d.color,
        fixed: d.body?.fixed, friction: d.body?.friction, bounce: d.body?.bounce, density: d.body?.density,
    };
    if (d.shape === 'box') {
        part.w = d.w;
        part.h = d.h;
    } else {
        part.r = d.r;
    }
    return part;
}

