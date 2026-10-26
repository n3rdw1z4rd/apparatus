import { graphId, type GraphDoc, type GraphGroup, type GraphLink, type GraphNode } from '@n3rdw1z4rd/core/graph';

/* ------------------------------------------------------------------ */
/* Copy / paste of nodes as JSON (works across tabs: it's on the        */
/* system clipboard). A clip carries the nodes, the wires between them, */
/* the script node types they use, and any group whose nodes all came   */
/* along.                                                               */
/* ------------------------------------------------------------------ */

export const CLIP_FORMAT = 'n3rdw1z4rd.graph-clip';

export interface Clip {
    format: typeof CLIP_FORMAT;
    nodes: GraphNode[];
    links: GraphLink[];
    scripts?: Record<string, string>;
    groups?: GraphGroup[];
}

/** The part of `doc` made of `ids` (deep copies). `inside(group)` lists a group's node ids. */
export function makeClip(doc: GraphDoc, ids: Set<string>, inside: (g: GraphGroup) => string[]): Clip {
    const nodes = doc.nodes.filter((n) => ids.has(n.id)).map((n) => structuredClone(n));
    const links = doc.links.filter((l) => ids.has(l.from.node) && ids.has(l.to.node)).map((l) => structuredClone(l));
    const scripts: Record<string, string> = {};
    for (const n of nodes) if (doc.scripts?.[n.type]) scripts[n.type] = doc.scripts[n.type];
    const groups = (doc.groups ?? []).filter((g) => {
        const members = inside(g);
        return members.length > 0 && members.every((id) => ids.has(id));
    }).map((g) => structuredClone(g));
    return { format: CLIP_FORMAT, nodes, links, ...(Object.keys(scripts).length ? { scripts } : {}), ...(groups.length ? { groups } : {}) };
}

export function parseClip(text: string): Clip | null {
    try {
        const c = JSON.parse(text);
        return c && c.format === CLIP_FORMAT && Array.isArray(c.nodes) ? c as Clip : null;
    } catch {
        return null;
    }
}

/**
 * Adds a clip to `doc` with fresh ids, its top-left at `at` (graph units). Script types the
 * graph doesn't have yet come along; an existing one with the same name is kept. Returns the
 * new node ids.
 */
export function pasteClip(doc: GraphDoc, clip: Clip, at: [number, number]): string[] {
    const ids = new Map<string, string>();
    let minX = Infinity, minY = Infinity;
    for (const n of clip.nodes) {
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
    }
    for (const g of clip.groups ?? []) {
        minX = Math.min(minX, g.rect[0]);
        minY = Math.min(minY, g.rect[1]);
    }
    const dx = at[0] - minX;
    const dy = at[1] - minY;

    for (const n of clip.nodes) {
        const id = graphId();
        ids.set(n.id, id);
        doc.nodes.push({ ...structuredClone(n), id, pos: [Math.round(n.pos[0] + dx), Math.round(n.pos[1] + dy)] });
    }
    for (const l of clip.links) {
        const from = ids.get(l.from.node);
        const to = ids.get(l.to.node);
        if (from && to) doc.links.push({ id: graphId('l'), from: { node: from, port: l.from.port }, to: { node: to, port: l.to.port } });
    }
    for (const [type, source] of Object.entries(clip.scripts ?? {})) {
        doc.scripts ??= {};
        doc.scripts[type] ??= source;
    }
    for (const g of clip.groups ?? []) {
        doc.groups = [...(doc.groups ?? []), { ...structuredClone(g), id: graphId('g'), rect: [g.rect[0] + dx, g.rect[1] + dy, g.rect[2], g.rect[3]] }];
    }
    return [...ids.values()];
}
