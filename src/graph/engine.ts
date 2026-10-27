import { radians } from '@n3rdw1z4rd/core';
import { EditorCamera, World, pickEntity, type ThreeEntity } from '@n3rdw1z4rd/core/three';
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineLoop } from 'three';
import { Look, Meta, RigidBody, Shape } from '../core/components';
import { normalizePart, type PartDef } from '../core/scene';
import type { BehaviorRef, JointInit } from '../physics/protocol';
import { PhysicsClient, type FrameInfo } from '../physics/physics-client';
import { Renderer } from '../render/renderer';
import { HighlightView } from './highlight-view';
import { JointView, worldPoint } from './joint-view';
import { wheelIntent } from './wheel';
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
    /** a click on the view while building: the entity under it (its scene id), or null for empty space */
    onPick: (entityId: string | null, additive: boolean) => void = () => {};
    /** behaviours that threw while playing (each is switched off on its body) */
    onBehaviorError: (errors: { node: string; type: string; message: string }[]) => void = () => {};

    private scene: SceneData | null = null;
    private readonly byId = new Map<string, ThreeEntity>();
    private physics: PhysicsClient | null = null;
    private bodyIds = new Map<number, ThreeEntity>();
    /** entities physics owns while playing */
    private simulated = new Set<ThreeEntity>();
    /** entities behaviours spawned while playing (gone on stop) */
    private spawned = new Set<ThreeEntity>();
    private time = 0;
    private frame = 0;
    private fitted = false;
    private readonly joints = new JointView();
    private readonly highlights = new HighlightView();
    /** the Camera node steers while playing, until you pan (double-click hands it back) */
    private following = true;
    /** you zoomed while following: the camera keeps your zoom */
    private manualZoom = false;
    /** your view from before play, put back on stop */
    private savedView: { x: number; y: number; zoom: number } | null = null;
    /** while building: what the Camera node will show */
    private readonly frameGuide = new LineLoop(
        new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)),
        new LineBasicMaterial({ color: 0x9b6dde, transparent: true, opacity: 0.6 }),
    );

    constructor(container: HTMLElement) {
        this.camera.minZoom = 0.05;
        this.camera.maxZoom = 8;
        this.renderer = new Renderer(container, this.camera, this.world);
        this.renderer.canvas.classList.add('viewport-canvas');
        this.renderer.overlay.add(this.joints.group, this.highlights.group, this.frameGuide);
        this.frameGuide.visible = false;
        this.frameGuide.frustumCulled = false;
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

    /** Outlines these entities (ids as their nodes made them) and rings `picked`. */
    setHighlight(ids: Set<string>, picked: string | null): void {
        this.highlights.set(ids, picked);
    }

    /** The scene's entity ids. */
    entityIds(): string[] {
        return this.scene?.entities.map((e) => e.id) ?? [];
    }

    play(): void {
        if (this.state === 'playing' || !this.scene) return;
        this.ensurePhysics();
        this.bodyIds.clear();
        this.simulated.clear();
        const bodies: { id: number; key: string; part: PartDef; behaviors?: BehaviorRef[] }[] = [];
        let n = 1;
        for (const data of this.scene.entities) {
            const e = this.byId.get(data.id);
            if (!e || !data.body) continue;
            this.bodyIds.set(n, e);
            this.simulated.add(e);
            const behaviors = data.behaviors?.map(({ type, node, params, source }) => ({ type, node, params, source }));
            bodies.push({ id: n++, key: data.id, part: toPart(data), ...(behaviors?.length ? { behaviors } : {}) });
        }
        const joints = this.jointInits(new Map([...this.bodyIds].map(([n, e]) => [e, n])));
        const g = this.scene.gravity;
        // the worker speaks the legacy convention: +y down
        this.physics!.play({ bodies, joints, gravity: { x: g.x, y: -g.y }, timeScale: 1, paused: false, seed: 1, grid: 32, script: null });
        this.time = 0;
        this.frame = 0;
        this.setState('playing');
        if (this.scene.camera) {
            const t = this.camera.target;
            this.savedView = { x: t.x, y: t.y, zoom: this.camera.zoom };
            this.following = true;
            this.manualZoom = false;
            this.followCamera(0, true);
        }
    }

    stop(): void {
        if (this.state !== 'playing') return;
        this.physics?.stop();
        this.joints.lengths.clear();
        this.bodyIds.clear();
        this.simulated.clear();
        for (const e of this.spawned) this.world.remove(e);
        this.spawned.clear();
        this.time = 0;
        this.frame = 0;
        if (this.savedView) {
            this.camera.target.x = this.savedView.x;
            this.camera.target.y = this.savedView.y;
            this.camera.zoom = this.savedView.zoom;
            this.savedView = null;
        }
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
        return this.simulated.has(e);
    }

    private apply(e: ThreeEntity, d: EntityData): void {
        e.visible = true;
        e.position.set(d.x, d.y, 0);
        e.rotation.z = radians(d.angle);
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

    /**
     * The scene's joints, for the physics worker (+y down, angles clockwise): from where the
     * entities are as play starts. A joint on an entity that isn't simulated is left out; one to
     * an entity that isn't simulated holds on to where that entity is, in the world.
     */
    private jointInits(numberOf: Map<ThreeEntity, number>): JointInit[] {
        const out: JointInit[] = [];
        const scene = this.scene!;
        const dataOf = new Map(scene.entities.map((d) => [d.id, d]));
        const flip = (v: { x: number; y: number }) => ({ x: v.x, y: -v.y });
        const frame = (d: EntityData) => ({ x: d.x, y: d.y, angle: radians(d.angle) });
        for (const d of scene.entities) {
            const a = numberOf.get(this.byId.get(d.id)!);
            (d.joints ?? []).forEach((j, i) => {
                const other = j.to ? dataOf.get(j.to) : null;
                if (a === undefined || other === undefined) return;
                const otherBody = other ? this.byId.get(other.id) : undefined;
                const b = otherBody ? numberOf.get(otherBody) ?? null : null;
                const pA = worldPoint(frame(d), j.at);
                const pB = j.kind === 'anchor' ? pA : other ? worldPoint(frame(other), j.toAt) : j.toAt;
                // b's end: local to b, or (b not simulated) where it is in the world
                let anchorB = pB;
                if (b !== null && other) {
                    const c = Math.cos(-radians(other.angle)), s = Math.sin(-radians(other.angle));
                    const ox = pB.x - other.x, oy = pB.y - other.y;
                    anchorB = { x: ox * c - oy * s, y: ox * s + oy * c };
                }
                const length = j.length || Math.hypot(pB.x - pA.x, pB.y - pA.y);
                if (j.kind !== 'anchor') this.joints.lengths.set(JointView.key(d.id, i), length);
                out.push({
                    kind: j.kind, a, b,
                    anchorA: flip(j.at), anchorB: flip(anchorB),
                    hinge: j.hinge,
                    // welded: b's angle minus a's, in the worker's (clockwise) sense
                    relAngle: radians(d.angle - (b !== null && other ? other.angle : 0)),
                    motor: -radians(j.motor ?? 0),
                    length, stiffness: j.stiffness, damping: j.damping,
                    collide: j.collide,
                });
            });
        }
        return out;
    }

    /** Where the Camera node looks: the followed entity (as drawn) or its `at`. */
    private cameraTarget(): { x: number; y: number } | null {
        const c = this.scene?.camera;
        if (!c) return null;
        const e = c.follow ? this.byId.get(c.follow) : null;
        return e && e.visible ? { x: e.position.x, y: e.position.y } : c.at;
    }

    /** Moves the camera toward the Camera node's target: outside the deadzone, smoothed. */
    private followCamera(dt: number, snap = false): void {
        const c = this.scene?.camera;
        const target = this.cameraTarget();
        if (!c || !target || !this.following) return;
        const t = this.camera.target;
        let wx = t.x, wy = t.y;
        if (snap) {
            wx = target.x;
            wy = target.y;
        } else {
            const dx = target.x - t.x, dy = target.y - t.y;
            if (Math.abs(dx) > c.deadzone.x) wx = target.x - Math.sign(dx) * c.deadzone.x;
            if (Math.abs(dy) > c.deadzone.y) wy = target.y - Math.sign(dy) * c.deadzone.y;
        }
        const k = snap || c.smooth <= 0 ? 1 : 1 - Math.exp(-dt / c.smooth);
        t.x += (wx - t.x) * k;
        t.y += (wy - t.y) * k;
        if (c.view > 0 && !this.manualZoom && this.camera.height > 1) {
            this.camera.zoom += (this.camera.height / c.view - this.camera.zoom) * k;
        }
    }

    /** While building: a frame around what the Camera node will show when play starts. */
    private placeFrameGuide(): void {
        const c = this.scene?.camera;
        const target = this.cameraTarget();
        const show = this.state === 'building' && !!c && !!target && c.view > 0 && this.camera.height > 1;
        this.frameGuide.visible = show;
        if (!show) return;
        this.frameGuide.position.set(target!.x, target!.y, 0);
        this.frameGuide.scale.set((c!.view * this.camera.width) / this.camera.height, c!.view, 1);
    }

    /** A spawned body's part (+y down) → a drawn entity (+y up). */
    private entityFromPart(raw: PartDef): ThreeEntity {
        const part = normalizePart(raw)!;
        const e = this.world.create(part.tag || 'spawned');
        this.world.addComponent(e, Shape, { kind: part.shape, w: part.w ?? 32, h: part.h ?? 32, r: part.r ?? 16 });
        this.world.addComponent(e, Look, { color: part.color ?? '#cccccc' });
        this.world.addComponent(e, Meta, { tag: part.tag ?? '', spawned: true });
        this.world.addComponent(e, RigidBody, { fixed: !!part.fixed });
        e.position.set(part.x, -part.y, 0);
        e.rotation.z = -(part.angle ?? 0);
        return e;
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

        // bodies behaviours spawned, and bodies that went away
        for (const s of f.spawned) {
            const e = this.entityFromPart(s.part);
            this.bodyIds.set(s.id, e);
            this.simulated.add(e);
            this.spawned.add(e);
        }
        for (const id of f.removed) {
            const e = this.bodyIds.get(id);
            if (!e) continue;
            this.bodyIds.delete(id);
            this.simulated.delete(e);
            if (this.spawned.delete(e)) this.world.remove(e);
            else e.visible = false; // a scene entity: comes back on stop
        }
        // bodies behaviours switched off / on (a gate that opens): hidden while off
        for (const [id, on] of f.toggled ?? []) {
            const e = this.bodyIds.get(id);
            if (e) e.visible = on;
        }
        if (f.behaviorErrors?.length) this.onBehaviorError(f.behaviorErrors);

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
            this.followCamera(dt);
        }
        this.placeFrameGuide();
        this.joints.update(this.scene, this.byId);
        this.highlights.update(this.scene, this.byId, this.camera.zoom);
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

    /** The physics id of a simulated entity, or null. */
    private bodyIdOf(e: ThreeEntity | null): number | null {
        if (!e) return null;
        for (const [id, b] of this.bodyIds) if (b === e) return id;
        return null;
    }

    /** Tells the physics worker where the pointer is (world px; the worker is +y down). */
    private sendPointer(sx: number, sy: number, down: boolean, active: boolean, grab: number | null): void {
        if (this.state !== 'playing' || !this.physics) return;
        const w = this.camera.screenToWorld(sx, sy, 0);
        if (!w) return;
        this.physics.setPointer({ x: w.x, y: -w.y, down, active, grab });
    }

    /**
     * With a Camera node, panning while playing takes the camera over; double-click hands it back.
     * Building: click picks an entity (onPick; shift / ⌘ adds), drag pans. Playing: drag is the pointer — it grabs and throws bodies, and
     * behaviours see it (world.pointer); right / middle drag and two fingers pan. Wheel and
     * pinch zoom; double-click fits. Events don't reach the graph canvas.
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

        /** while playing: the pointer that drives the physics pointer (null: panning) */
        let driving: number | null = null;
        let grab: number | null = null;
        /** building: a press that hasn't moved (yet) — on release it picks what's under it */
        let press: { id: number; x: number; y: number } | null = null;

        el.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            el.setPointerCapture(ev.pointerId);
            pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
            pinch = 0;
            press = this.state === 'building' && ev.button === 0 && pointers.size === 1 ? { id: ev.pointerId, x: ev.clientX, y: ev.clientY } : null;
            if (this.state === 'playing' && ev.button === 0 && pointers.size === 1) {
                const p = local(ev.clientX, ev.clientY);
                const hit = pickEntity(this.world, this.camera, p.x, p.y, { slopPx: ev.pointerType === 'touch' ? 14 : 0 })?.entity ?? null;
                const id = hit && !this.world.getComponent<RigidBody>(hit, RigidBody)?.fixed ? this.bodyIdOf(hit) : null;
                driving = ev.pointerId;
                grab = id;
                this.sendPointer(p.x, p.y, true, true, grab);
            } else if (driving !== null) {
                // a second finger: let go, and pan / pinch instead
                const p = local(ev.clientX, ev.clientY);
                this.sendPointer(p.x, p.y, false, true, null);
                driving = null;
                grab = null;
            }
        });
        el.addEventListener('pointermove', (ev) => {
            const prev = pointers.get(ev.pointerId);
            if (!prev) {
                // hovering (mouse): behaviours can follow it
                if (this.state === 'playing' && ev.pointerType === 'mouse') {
                    const p = local(ev.clientX, ev.clientY);
                    this.sendPointer(p.x, p.y, false, true, null);
                }
                return;
            }
            ev.stopPropagation();
            const cur = { x: ev.clientX, y: ev.clientY };
            pointers.set(ev.pointerId, cur);
            if (press && Math.hypot(cur.x - press.x, cur.y - press.y) > 4) press = null; // a drag: it pans
            if (driving === ev.pointerId) {
                const p = local(cur.x, cur.y);
                this.sendPointer(p.x, p.y, true, true, grab);
                return;
            }
            if (pointers.size === 1) {
                const k = scale();
                this.camera.pan((cur.x - prev.x) / k, (cur.y - prev.y) / k);
                this.following = false;
            } else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                const c = local((a.x + b.x) / 2, (a.y + b.y) / 2);
                if (pinch) {
                    this.camera.zoomAt(c.x, c.y, d / pinch);
                    this.manualZoom = true;
                }
                pinch = d;
            }
        });
        const up = (ev: PointerEvent) => {
            pointers.delete(ev.pointerId);
            pinch = 0;
            if (press?.id === ev.pointerId && ev.type === 'pointerup' && this.state === 'building') {
                const p = local(ev.clientX, ev.clientY);
                const hit = pickEntity(this.world, this.camera, p.x, p.y, { slopPx: ev.pointerType === 'touch' ? 10 : 2 })?.entity ?? null;
                let id: string | null = null;
                if (hit) for (const [key, e] of this.byId) if (e === hit) id = key;
                this.onPick(id, ev.shiftKey || ev.metaKey || ev.ctrlKey);
            }
            press = null;
            if (driving === ev.pointerId) {
                const p = local(ev.clientX, ev.clientY);
                this.sendPointer(p.x, p.y, false, ev.pointerType === 'mouse', null);
                driving = null;
                grab = null;
            }
        };
        el.addEventListener('pointerleave', (ev) => {
            if (ev.pointerType !== 'mouse' || driving !== null) return;
            const p = local(ev.clientX, ev.clientY);
            this.sendPointer(p.x, p.y, false, false, null);
        });
        el.addEventListener('contextmenu', (ev) => ev.preventDefault());
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const w = wheelIntent(ev);
            if (w.kind === 'pan') {
                const k = scale();
                this.camera.pan(-w.dx / k, -w.dy / k);
                this.following = false;
            } else {
                const p = local(ev.clientX, ev.clientY);
                this.camera.zoomAt(p.x, p.y, w.factor);
                this.manualZoom = true;
            }
        }, { passive: false });
        el.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            // playing with a Camera node: hand the camera back to it; otherwise frame the scene
            if (this.state === 'playing' && this.scene?.camera) {
                this.following = true;
                this.manualZoom = false;
            } else {
                this.fit();
            }
        });
    }
}

/** Scene entity (editor coordinates) → the physics worker's part (+y down, clockwise). */
function toPart(d: EntityData): PartDef {
    const part: PartDef = {
        shape: d.shape, x: d.x, y: -d.y, angle: -radians(d.angle), color: d.color,
        fixed: d.body?.fixed, friction: d.body?.friction, bounce: d.body?.bounce, density: d.body?.density, sensor: d.body?.sensor,
    };
    if (d.shape === 'box') {
        part.w = d.w;
        part.h = d.h;
    } else {
        part.r = d.r;
    }
    return part;
}

