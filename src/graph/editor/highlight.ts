import { getNode, type GraphDoc, type NodeResult } from '@n3rdw1z4rd/core/graph';

/* ------------------------------------------------------------------ */
/* Selection ⇄ viewport. Entity ids say where an entity was made:       */
/* `<node>:<index>` (plus `#2`... when the Scene had it twice), and     */
/* inside subgraph instances `<instance>#<i>/.../<node>:<index>`.       */
/* ------------------------------------------------------------------ */

/** An entity id without the Scene's duplicate suffix: the id the node that made it gave it. */
export function madeId(entityId: string): string {
    return entityId.replace(/(:\d+)#\d+$/, '$1');
}

/**
 * The node an entity came from, at the level being edited (`path`: the subgraph types entered):
 * the shape node that made it (with its list index), or the subgraph instance it came out of.
 * Null if it didn't come from this level.
 */
export function sourceOf(entityId: string, root: GraphDoc, path: string[]): { node: string; index: number | null } | null {
    const segments = madeId(entityId).split('/');
    const last = /^(.*):(\d+)$/.exec(segments.pop()!);
    if (!last) return null;
    const instances = segments.map((s) => s.replace(/#\d+$/, ''));
    if (instances.length < path.length) return null;
    let d: GraphDoc = root;
    for (let k = 0; k < path.length; k++) {
        const inst = getNode(d, instances[k]);
        const def = root.subgraphs?.[path[k]];
        if (!inst || inst.type !== path[k] || !def) return null;
        d = def as unknown as GraphDoc;
    }
    if (instances.length > path.length) return getNode(d, instances[path.length]) ? { node: instances[path.length], index: null } : null;
    return getNode(d, last[1]) ? { node: last[1], index: Number(last[2]) } : null;
}

const isEntity = (v: any) => !!v && typeof v === 'object' && typeof v.id === 'string' && (v.shape === 'box' || v.shape === 'ball');

/**
 * The entities that pass through a chain, from its nodes' results (the top level): every entity a
 * chain node outputs. A whole scene only counts on a selected node itself — otherwise selecting
 * anything would light up everything through the Scene node.
 */
export function entitiesThrough(chain: Set<string>, selected: Set<string>, results: Map<string, NodeResult>): Set<string> {
    const out = new Set<string>();
    const collect = (v: unknown, scenes: boolean) => {
        if (Array.isArray(v)) for (const x of v) collect(x, scenes);
        else if (isEntity(v)) out.add(madeId((v as { id: string }).id));
        else if (scenes && v && typeof v === 'object' && (v as { kind?: string }).kind === 'scene2d') {
            for (const e of (v as { entities: { id: string }[] }).entities) out.add(madeId(e.id));
        }
    };
    for (const id of chain) {
        const r = results.get(id);
        if (!r || r.error) continue;
        for (const v of Object.values(r.outputs)) collect(v, selected.has(id));
    }
    return out;
}
