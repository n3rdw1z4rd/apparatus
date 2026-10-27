import type { ThreeEntity } from '@n3rdw1z4rd/core/three';
import { BufferAttribute, BufferGeometry, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { JointData } from './joints';
import type { SceneData } from './scene-nodes';

/* ------------------------------------------------------------------ */
/* Draws joints over the scene: ropes (sagging when slack), springs     */
/* (a zigzag) and anchors (a pin). Endpoints follow the drawn entities, */
/* so it's the same while building and while physics moves them.       */
/* Editor coordinates: +y up, radians counter-clockwise.                */
/* ------------------------------------------------------------------ */

type Vec2 = { x: number; y: number };

const ROPE_POINTS = 25;
const SPRING_POINTS = 26;
const ROPE_WIDTH = 3;
const SPRING_WIDTH = 2;
const SPRING_AMP = 6;

const DOT = new CircleGeometry(1, 20);
const SQUARE = new PlaneGeometry(1, 1);
const PIN_RING = new MeshBasicMaterial({ color: 0xd3d3d3 });
const PIN_HOLE = new MeshBasicMaterial({ color: 0x111111 });

/** A triangle-strip ribbon of n points, as indexed triangles. */
function ribbon(n: number, color: string): Mesh {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const index: number[] = [];
    for (let i = 0; i < n - 1; i++) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(index);
    const m = new Mesh(g, new MeshBasicMaterial({ color, side: DoubleSide }));
    m.frustumCulled = false;
    return m;
}

function setRibbon(mesh: Mesh, pts: Vec2[], width: number): void {
    const pos = mesh.geometry.getAttribute('position') as BufferAttribute;
    const a = pos.array as Float32Array;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
        let dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        const nx = -dy * width / 2, ny = dx * width / 2;
        a.set([pts[i].x + nx, pts[i].y + ny, 0, pts[i].x - nx, pts[i].y - ny, 0], i * 6);
    }
    pos.needsUpdate = true;
}

/** An offset in an entity's own frame → a world point. */
export function worldPoint(e: { x: number; y: number; angle: number }, off: Vec2): Vec2 {
    const c = Math.cos(e.angle), s = Math.sin(e.angle);
    return { x: e.x + off.x * c - off.y * s, y: e.y + off.x * s + off.y * c };
}

interface Drawn {
    kind: JointData['kind'];
    root: Group;
    line?: Mesh;
    key: string;
}

export class JointView {
    readonly group = new Group();
    private drawn = new Map<string, Drawn>();
    /** rope / spring lengths fixed when play started ("0: as placed"), by joint key */
    lengths = new Map<string, number>();

    /** Each joint's key: the entity's id and its place in the entity's list. */
    static key(entityId: string, i: number): string {
        return `${entityId}|${i}`;
    }

    update(scene: SceneData | null, byId: Map<string, ThreeEntity>): void {
        const live = new Set<string>();
        const g = scene?.gravity ?? { x: 0, y: -1 };
        const gl = Math.hypot(g.x, g.y);
        const down = gl > 1e-6 ? { x: g.x / gl, y: g.y / gl } : null;
        const at = (e: ThreeEntity) => ({ x: e.position.x, y: e.position.y, angle: e.rotation.z });

        for (const data of scene?.entities ?? []) {
            const ea = byId.get(data.id);
            (data.joints ?? []).forEach((j, i) => {
                const key = JointView.key(data.id, i);
                const eb = j.to ? byId.get(j.to) : null;
                if (!ea || !ea.visible || eb === undefined || (eb && !eb.visible)) return;
                live.add(key);
                const d = this.drawnFor(key, j);
                const pA = worldPoint(at(ea), j.at);

                if (j.kind === 'anchor') {
                    d.root.position.set(pA.x, pA.y, 0);
                    d.root.rotation.z = ea.rotation.z;
                    return;
                }
                const pB = eb ? worldPoint(at(eb), j.toAt) : j.toAt;
                const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
                const length = this.lengths.get(key) ?? (j.length || dist);
                setRibbon(d.line!, j.kind === 'rope' ? ropePoints(pA, pB, dist, length, down) : springPoints(pA, pB, dist), j.kind === 'rope' ? ROPE_WIDTH : SPRING_WIDTH);
            });
        }
        for (const [key, d] of this.drawn) {
            if (live.has(key)) continue;
            this.group.remove(d.root);
            d.line?.geometry.dispose();
            this.drawn.delete(key);
        }
    }

    private drawnFor(key: string, j: JointData): Drawn {
        const look = `${j.kind}|${j.hinge}|${j.color ?? ''}`;
        let d = this.drawn.get(key);
        if (d && d.key === look) return d;
        if (d) {
            this.group.remove(d.root);
            d.line?.geometry.dispose();
        }
        const root = new Group();
        d = { kind: j.kind, root, key: look };
        if (j.kind === 'anchor') {
            // a pin: round for a hinge, square for a weld
            const ring = new Mesh(j.hinge ? DOT : SQUARE, PIN_RING);
            ring.scale.setScalar(j.hinge ? 4.5 : 8);
            const hole = new Mesh(j.hinge ? DOT : SQUARE, PIN_HOLE);
            hole.scale.setScalar(j.hinge ? 2 : 3.5);
            hole.position.z = 0.001;
            root.add(ring, hole);
        } else {
            d.line = ribbon(j.kind === 'rope' ? ROPE_POINTS : SPRING_POINTS, j.color ?? (j.kind === 'rope' ? '#c8a46e' : '#9aa5ad'));
            root.add(d.line);
        }
        this.group.add(root);
        this.drawn.set(key, d);
        return d;
    }
}

/** A rope: straight when taut; slack, it sags along gravity (a parabola about as long as the rope). */
function ropePoints(a: Vec2, b: Vec2, dist: number, length: number, down: Vec2 | null): Vec2[] {
    const slack = length - dist;
    let sag = 0;
    if (down && slack > 0.5) sag = dist < 1 ? length / 2 : Math.min(length / 2, Math.sqrt((3 * dist * slack) / 8));
    // quadratic Bezier: the control point sits twice as far out as the curve's middle
    const cx = (a.x + b.x) / 2 + (down?.x ?? 0) * sag * 2;
    const cy = (a.y + b.y) / 2 + (down?.y ?? 0) * sag * 2;
    const pts: Vec2[] = [];
    for (let i = 0; i < ROPE_POINTS; i++) {
        const t = i / (ROPE_POINTS - 1), u = 1 - t;
        pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
    }
    return pts;
}

/** A spring: a zigzag with straight ends. */
function springPoints(a: Vec2, b: Vec2, dist: number): Vec2[] {
    const dx = (b.x - a.x) / (dist || 1), dy = (b.y - a.y) / (dist || 1);
    const pts: Vec2[] = [];
    for (let i = 0; i < SPRING_POINTS; i++) {
        const t = i / (SPRING_POINTS - 1);
        const side = i === 0 || i === SPRING_POINTS - 1 || i === 1 || i === SPRING_POINTS - 2 ? 0 : (i % 2 ? 1 : -1) * SPRING_AMP;
        pts.push({ x: a.x + (b.x - a.x) * t - dy * side, y: a.y + (b.y - a.y) * t + dx * side });
    }
    return pts;
}
