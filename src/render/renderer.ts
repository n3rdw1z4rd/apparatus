import { Clock } from '@n3rdw1z4rd/core';
import { AdaptiveGrid, Renderer as GlRenderer, type EditorCamera, type ThreeEntity, type World } from '@n3rdw1z4rd/core/three';
import {
    BufferAttribute, BufferGeometry, CircleGeometry, DoubleSide, Group, Line, LineBasicMaterial, LineDashedMaterial, LineLoop, Mesh,
    MeshBasicMaterial, PlaneGeometry, Scene,
} from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Look, Meta, RigidBody, Shape, partEntities } from '../core/components';

export interface ViewOptions {
    grid: number;
    showGrid: boolean;
    showLabels: boolean;
    selected: ThreeEntity | null;
    hovered: ThreeEntity | null;
    /** build mode draws generated parts with a marker and the origin cross */
    building: boolean;
    /** 'off' hides the transform gizmo */
    gizmo: 'off' | 'translate' | 'rotate';
    /** a 2D view: the gizmo only offers x/y moves and z rotation */
    flat: boolean;
}

/* shared geometry: unit shapes, scaled per part */
const UNIT_PLANE = new PlaneGeometry(1, 1);
const UNIT_CIRCLE = new CircleGeometry(1, 48);
const UNIT_SQUARE_LOOP = pointsGeometry([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]);
const UNIT_CIRCLE_LOOP = pointsGeometry(Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)] as [number, number];
}));
const UNIT_TICK = pointsGeometry([[-1, 0], [0, 0], [0, -1]]);
const SPOKE = new PlaneGeometry(1, 1).translate(0.5, 0, 0);

const EDGE = new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
const DARK = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
const PIN = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 });
const TICK = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });

/** Depth step between parts, so later parts draw (and pick) on top of earlier ones. */
const LAYER = 0.01;

interface Visual {
    key: string;
    group: Group;
    fill: MeshBasicMaterial;
    pin: Mesh;
    spoke: Mesh | null;
    tick: Line;
}

/**
 * Draws the scene with three.js: the World's root is the scene. Each part gets a visual
 * (child objects that are not entities, rebuilt from its components when they change);
 * the grid draws underneath, outlines and the transform gizmo on top.
 */
export class Renderer {
    readonly gl: GlRenderer;
    readonly canvas: HTMLCanvasElement;
    readonly clock = new Clock();
    readonly gizmo: TransformControls;

    /** called while the gizmo moves the attached entity, and once when the drag ends */
    onGizmoChange: (e: ThreeEntity, done: boolean) => void = () => {};

    private readonly under = new Scene();
    private readonly over = new Scene();
    private readonly grid = new AdaptiveGrid({ color: '#262626', originColor: '#555555' });
    private readonly hoverLine = outline(0xffffff, 0.35);
    private readonly selectLine = outline(0x3fd1a4, 1);
    private readonly visuals = new Map<ThreeEntity, Visual>();
    private readonly labels: HTMLElement;
    private readonly labelPool: HTMLElement[] = [];

    constructor(container: HTMLElement, private readonly view: EditorCamera, private readonly world: World) {
        this.gl = new GlRenderer({ antialias: true });
        this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.gl.setClearColor(0x111111);
        this.gl.autoClear = false;
        this.canvas = this.gl.domElement;
        this.canvas.className = 'stage-canvas';
        container.prepend(this.canvas);

        this.labels = document.createElement('div');
        this.labels.className = 'labels';
        this.canvas.after(this.labels);

        this.under.add(this.grid);
        this.over.add(this.hoverLine, this.selectLine);

        // Created before the stage input so its pointerdown runs first and the input can
        // tell whether a press landed on a gizmo handle.
        this.gizmo = new TransformControls(view.camera, this.canvas);
        this.gizmo.size = 0.8;
        this.over.add(this.gizmo.getHelper());
        this.gizmo.addEventListener('objectChange', () => {
            if (this.gizmo.object) this.onGizmoChange(this.gizmo.object as ThreeEntity, false);
        });
        this.gizmo.addEventListener('dragging-changed', (ev) => {
            if (!ev.value && this.gizmo.object) this.onGizmoChange(this.gizmo.object as ThreeEntity, true);
        });

        world.on('entityRemoved', (e) => this.dropVisual(e));
        world.on('componentRemoved', (e, name) => name === 'Shape' && this.dropVisual(e));

        this.resize();
        new ResizeObserver(() => this.resize()).observe(container);
    }

    /** True while the pointer is over (or dragging) a gizmo handle. */
    get gizmoActive(): boolean {
        return !!this.gizmo.object && this.gizmo.enabled && (this.gizmo.dragging || this.gizmo.axis !== null);
    }

    resize(): void {
        // layout size, not getBoundingClientRect: the container may sit inside a CSS-scaled
        // parent (a zoomed node graph), and the camera works in the canvas's own CSS px
        const parent = this.canvas.parentElement!;
        const w = Math.max(1, parent.clientWidth);
        const h = Math.max(1, parent.clientHeight);
        this.view.resize(w, h);
        this.gl.setSize(w, h);
    }

    start(frame: (dt: number) => void): void {
        this.clock.start((dt) => frame(dt));
    }

    draw(opts: ViewOptions): void {
        const view = this.view;
        view.update();

        const parts = partEntities(this.world);
        parts.forEach((e, i) => this.syncVisual(e, i, opts));

        this.grid.visible = opts.showGrid || opts.building;
        this.grid.lines = opts.showGrid;
        this.grid.origin = opts.building;
        if (this.grid.visible) this.grid.update(view, opts.grid);

        this.placeOutline(this.hoverLine, opts.hovered !== opts.selected ? opts.hovered : null);
        this.placeOutline(this.selectLine, opts.selected);
        this.syncGizmo(opts);
        this.syncLabels(parts, opts);

        const cam = view.camera;
        this.gl.clear();
        this.gl.render(this.under, cam);
        this.gl.render(this.world.root, cam);
        this.gl.render(this.over, cam);
    }

    /* ── part visuals ──────────────────────────────────────────── */

    private syncVisual(e: ThreeEntity, index: number, opts: ViewOptions): void {
        const s = this.world.getComponent<Shape>(e, Shape)!;
        const color = this.world.getComponent<Look>(e, Look)?.color ?? '#cccccc';
        const fixed = !!this.world.getComponent<RigidBody>(e, RigidBody)?.fixed;
        const gen = !!this.world.getComponent<Meta>(e, Meta)?.gen;
        const key = `${s.kind}|${s.w}|${s.h}|${s.r}|${color}`;

        let v = this.visuals.get(e);
        if (!v || v.key !== key) {
            if (v) this.dropVisual(e);
            v = this.buildVisual(s, color, key);
            e.add(v.group);
            this.visuals.set(e, v);
        }

        v.group.position.z = index * LAYER;

        // sizes that stay constant on screen
        const z = this.view.zoom;
        const size = s.kind === 'ball' ? s.r : Math.min(s.w, s.h) / 2;
        v.pin.visible = fixed;
        if (fixed) v.pin.scale.setScalar(Math.min(4 / z, size * 0.5));
        if (v.spoke) v.spoke.scale.y = Math.max(1 / z, s.r * 0.08);

        v.tick.visible = opts.building && gen;
        if (v.tick.visible) {
            v.tick.scale.setScalar(Math.min(6 / z, (s.kind === 'ball' ? s.r : Math.min(s.w, s.h)) * 0.4));
            if (s.kind === 'ball') v.tick.position.set(s.r * 0.7, s.r * 0.7, LAYER / 2);
            else v.tick.position.set(s.w / 2, s.h / 2, LAYER / 2);
        }
    }

    private buildVisual(s: Shape, color: string, key: string): Visual {
        const group = new Group();
        group.name = 'visual';
        const fill = new MeshBasicMaterial({ color, side: DoubleSide });
        const top = LAYER / 4;

        let spoke: Mesh | null = null;
        if (s.kind === 'box') {
            const body = new Mesh(UNIT_PLANE, fill);
            body.scale.set(s.w, s.h, 1);
            const edge = new LineLoop(UNIT_SQUARE_LOOP, EDGE);
            edge.scale.set(s.w, s.h, 1);
            edge.position.z = top;
            group.add(body, edge);
        } else {
            const body = new Mesh(UNIT_CIRCLE, fill);
            body.scale.set(s.r, s.r, 1);
            const edge = new LineLoop(UNIT_CIRCLE_LOOP, EDGE);
            edge.scale.set(s.r, s.r, 1);
            edge.position.z = top;
            // a spoke, so rolling is visible
            spoke = new Mesh(SPOKE, DARK);
            spoke.scale.set(s.r * 0.8, 1, 1);
            spoke.position.z = top;
            group.add(body, edge, spoke);
        }

        const pin = new Mesh(UNIT_CIRCLE, PIN);
        pin.position.z = top * 2;
        const tick = new Line(UNIT_TICK, TICK);
        group.add(pin, tick);

        return { key, group, fill, pin, spoke, tick };
    }

    private dropVisual(e: ThreeEntity): void {
        const v = this.visuals.get(e);
        if (!v) return;
        v.group.removeFromParent();
        v.fill.dispose();
        this.visuals.delete(e);
    }

    /* ── overlays ──────────────────────────────────────────────── */

    private placeOutline(line: LineLoop<BufferGeometry, LineDashedMaterial>, e: ThreeEntity | null): void {
        const s = e && this.world.has(e) ? this.world.getComponent<Shape>(e, Shape) : undefined;
        line.visible = !!s;
        if (!e || !s) return;

        const z = this.view.zoom;
        const pad = 3 / z;
        const pts: [number, number][] = s.kind === 'box'
            ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [x * (s.w / 2 + pad), y * (s.h / 2 + pad)])
            : Array.from({ length: 64 }, (_, i) => {
                const a = (i / 64) * Math.PI * 2;
                return [Math.cos(a) * (s.r + pad), Math.sin(a) * (s.r + pad)];
            });

        const pos = new Float32Array(pts.length * 3);
        pts.forEach(([x, y], i) => pos.set([x, y, 0], i * 3));
        line.geometry.setAttribute('position', new BufferAttribute(pos, 3));
        line.computeLineDistances();
        line.material.dashSize = 4 / z;
        line.material.gapSize = 3 / z;

        e.updateMatrixWorld();
        line.matrix.copy(e.matrixWorld);
        line.matrixWorldNeedsUpdate = true;
    }

    private syncGizmo(opts: ViewOptions): void {
        const g = this.gizmo;
        const target = opts.building && opts.gizmo !== 'off' && opts.selected && this.world.has(opts.selected) ? opts.selected : null;
        if (g.camera !== this.view.camera) g.camera = this.view.camera;

        if (!target || opts.gizmo === 'off') {
            if (g.object) g.detach();
            g.enabled = false;
            return;
        }

        if (g.object !== target) g.attach(target);
        g.enabled = true;
        if (g.mode !== opts.gizmo) g.setMode(opts.gizmo);
        g.setSpace(opts.gizmo === 'rotate' ? 'local' : 'world');
        g.showX = opts.gizmo === 'translate' || !opts.flat;
        g.showY = opts.gizmo === 'translate' || !opts.flat;
        g.showZ = opts.gizmo === 'rotate' || !opts.flat;
    }

    private syncLabels(parts: ThreeEntity[], opts: ViewOptions): void {
        const show = opts.showLabels && this.view.zoom > 0.5;
        this.labels.hidden = !show;
        if (!show) return;

        let n = 0;
        for (const e of parts) {
            const s = this.world.getComponent<Shape>(e, Shape)!;
            const tag = this.world.getComponent<Meta>(e, Meta)?.tag;
            const deg = Math.round((e.rotation.z * 180) / Math.PI);
            const text = [tag ? `#${tag}` : '', `${e.position.x.toFixed(0)}, ${e.position.y.toFixed(0)}`, deg ? `${deg}°` : '']
                .filter(Boolean).join('  ');

            const top = e.position.clone();
            top.y += s.kind === 'ball' ? s.r : Math.max(s.w, s.h) / 2;
            const p = this.view.worldToScreen(top);
            if (p.z > 1 || p.x < -100 || p.y < -20 || p.x > this.view.width + 100 || p.y > this.view.height + 20) continue;

            const el = this.labelPool[n] ?? this.labels.appendChild(document.createElement('span'));
            this.labelPool[n++] = el;
            el.hidden = false;
            if (el.textContent !== text) el.textContent = text;
            el.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - 4).toFixed(1)}px) translate(-50%, -100%)`;
        }
        for (let i = n; i < this.labelPool.length; i++) this.labelPool[i].hidden = true;
    }
}

/** a line through the points (a LineLoop closes it) */
function pointsGeometry(points: [number, number][]): BufferGeometry {
    return new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(points.flatMap(([x, y]) => [x, y, 0])), 3));
}


function outline(color: number, opacity: number): LineLoop<BufferGeometry, LineDashedMaterial> {
    const line = new LineLoop(new BufferGeometry(), new LineDashedMaterial({ color, transparent: opacity < 1, opacity, depthTest: false }));
    line.matrixAutoUpdate = false;
    line.frustumCulled = false;
    line.renderOrder = 10;
    return line;
}
