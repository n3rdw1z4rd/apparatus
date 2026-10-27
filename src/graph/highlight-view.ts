import type { ThreeEntity } from '@n3rdw1z4rd/core/three';
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineLoop } from 'three';
import { madeId } from './editor/highlight';
import type { SceneData } from './scene-nodes';

/* ------------------------------------------------------------------ */
/* Outlines around the entities the graph selection runs through (and   */
/* a second ring around the one you clicked). They follow the drawn     */
/* entities, so they stay on bodies while playing.                      */
/* ------------------------------------------------------------------ */

const loop = (pts: [number, number][]) => new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(pts.flatMap(([x, y]) => [x, y, 0])), 3));
const SQUARE = loop([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]);
const CIRCLE = loop(Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)] as [number, number];
}));
const LINE = new LineBasicMaterial({ color: 0xe6e6e6, transparent: true, opacity: 0.9 });
const PICKED = new LineBasicMaterial({ color: 0xffffff });

export class HighlightView {
    readonly group = new Group();
    private ids = new Set<string>();
    private picked: string | null = null;
    private pool: LineLoop[] = [];

    set(ids: Set<string>, picked: string | null): void {
        this.ids = ids;
        this.picked = picked;
    }

    update(scene: SceneData | null, byId: Map<string, ThreeEntity>, zoom: number): void {
        let used = 0;
        const ring = (e: ThreeEntity, d: SceneData['entities'][number], gap: number, mat: LineBasicMaterial) => {
            let l = this.pool[used];
            if (!l) {
                l = new LineLoop(SQUARE, LINE);
                l.frustumCulled = false;
                this.pool.push(l);
                this.group.add(l);
            }
            used++;
            l.visible = true;
            l.material = mat;
            l.geometry = d.shape === 'ball' ? CIRCLE : SQUARE;
            l.position.set(e.position.x, e.position.y, 0);
            l.rotation.z = e.rotation.z;
            const g = gap / zoom; // constant on screen
            if (d.shape === 'ball') l.scale.set(d.r + g, d.r + g, 1);
            else l.scale.set(d.w + 2 * g, d.h + 2 * g, 1);
        };
        if (this.ids.size || this.picked) {
            for (const d of scene?.entities ?? []) {
                const id = madeId(d.id);
                const e = byId.get(d.id);
                if (!e || !e.visible) continue;
                if (this.ids.has(id)) ring(e, d, 3, LINE);
                if (id === this.picked) ring(e, d, 6, PICKED);
            }
        }
        for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;
    }
}
