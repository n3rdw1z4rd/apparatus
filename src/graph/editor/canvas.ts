import {
    addNode, canConnect, connect, disconnect, getNode, graphId, linksInto, portTypes, removeNode,
    type GraphNode, type NodeDef, type PortRef,
} from '@n3rdw1z4rd/core/graph';
import { Engine } from '../engine';
import type { SceneData } from '../scene-nodes';
import { h, svg } from './dom';
import { openNodeMenu } from './menu';
import { openScriptPanel } from './script-panel';
import {
    adjustLayout, doc, docEpoch, docRevision, edit, evaluateFrame, isAnimated, isScriptType, redo, registry, results, scriptsSuspended,
    scriptsTrusted, selection, typesRevision, undo,
} from './state';
import { hasWidget, preview, widget } from './widgets';

/* ------------------------------------------------------------------ */
/* The graph canvas: nodes (DOM), wires (SVG), pan / zoom, dragging     */
/* nodes and wires, selection, keys. Node views are rebuilt only when   */
/* their shape changes (links, type, flags); positions and results are  */
/* patched in place.                                                    */
/* ------------------------------------------------------------------ */

/**
 * A run this long (ms) marks a node as a likely bottleneck — half a 60 fps frame. Animated
 * nodes run every frame while playing, so they get a tighter budget.
 */
export const SLOW_MS = 8;
export const SLOW_ANIMATED_MS = 4;

/** A node's state, shown by its border color. */
export type NodeState = 'ok' | 'error' | 'slow' | 'skipped';

const STATE_TEXT: Record<NodeState, string> = {
    ok: 'ran fine',
    error: 'error',
    slow: 'slow — a likely bottleneck',
    skipped: 'skipped',
};

const CATEGORY_COLORS: Record<string, string> = {
    value: '#3fd1a4', math: '#4ea8de', vec2: '#4ea8de', list: '#9b6dde', shape: '#f2a541',
    physics: '#e8554e', scene: '#f4d35e', output: '#e86fb0', scripts: '#d3d3d3',
};

interface NodeView {
    el: HTMLElement;
    key: string;
    pins: Map<string, HTMLElement>;
    foot: HTMLElement;
}

interface Viewport {
    host: HTMLElement;
    engine: Engine;
    playBtn: HTMLButtonElement;
}

type Drag =
    | { kind: 'pan'; last: { x: number; y: number } }
    | { kind: 'nodes'; last: { x: number; y: number }; moved: boolean }
    | { kind: 'wire'; from: PortRef; path: SVGPathElement; color: string }
    | { kind: 'resize'; node: string; start: { x: number; y: number }; size: [number, number] };

export class GraphCanvas {
    readonly el: HTMLElement;
    private readonly layer: HTMLElement;
    private readonly wires: SVGSVGElement;
    private readonly views = new Map<string, NodeView>();
    private readonly viewports = new Map<string, Viewport>();
    private view = { x: 40, y: 40, zoom: 0.8 };
    private drag: Drag | null = null;
    private selectedLink: string | null = null;
    private readonly pointers = new Map<number, { x: number; y: number }>();
    private pinchDist = 0;
    private wiresQueued = false;
    /** nodes change size as fonts load and widgets settle: their pins move, so the wires follow */
    private readonly nodeSizes = new ResizeObserver(() => this.drawWires());

    constructor() {
        this.wires = svg('svg', { class: 'graph-wires' });
        this.layer = h('div', { className: 'graph-layer' }, this.wires as unknown as Node);
        this.el = h('div', { className: 'graph', tabIndex: 0 }, this.layer);

        this.attachInput();
        docRevision.subscribe(() => this.render());
        docEpoch.subscribe(() => this.render(true));
        typesRevision.subscribe(() => this.render(true));
        results.subscribe(() => this.showResults());
        scriptsSuspended.subscribe(() => this.showResults());
        selection.subscribe(() => this.markSelection());
        new ResizeObserver(() => this.drawWires()).observe(this.el);
        void document.fonts?.ready.then(() => this.drawWires());
        this.applyView();
    }

    /* ── coordinates ───────────────────────────────────────────── */

    /** screen (client) px → graph units */
    toGraph(cx: number, cy: number): [number, number] {
        const r = this.el.getBoundingClientRect();
        return [(cx - r.left - this.view.x) / this.view.zoom, (cy - r.top - this.view.y) / this.view.zoom];
    }

    private applyView(): void {
        const { x, y, zoom } = this.view;
        this.layer.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
        this.el.style.setProperty('--zoom', String(zoom));
        this.el.style.backgroundPosition = `${x}px ${y}px`;
        this.el.style.backgroundSize = `${24 * zoom}px ${24 * zoom}px`;
    }

    private zoomAt(cx: number, cy: number, factor: number): void {
        const r = this.el.getBoundingClientRect();
        const px = cx - r.left;
        const py = cy - r.top;
        const z = Math.min(2.5, Math.max(0.15, this.view.zoom * factor));
        this.view.x = px - ((px - this.view.x) * z) / this.view.zoom;
        this.view.y = py - ((py - this.view.y) * z) / this.view.zoom;
        this.view.zoom = z;
        this.applyView();
    }

    /** Frames every node. */
    fit(): void {
        if (!doc.nodes.length) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of doc.nodes) {
            const v = this.views.get(n.id);
            const w = v ? v.el.offsetWidth : 200;
            const ht = v ? v.el.offsetHeight : 100;
            minX = Math.min(minX, n.pos[0]); minY = Math.min(minY, n.pos[1]);
            maxX = Math.max(maxX, n.pos[0] + w); maxY = Math.max(maxY, n.pos[1] + ht);
        }
        const r = this.el.getBoundingClientRect();
        const pad = 60;
        // don't zoom out so far that nodes become unreadable. A graph too wide to fit keeps its
        // right side in view — that's where the output (the viewport) is
        const z = Math.min(1.2, Math.max(0.75, Math.min((r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY))));
        const fitsX = (maxX - minX) * z <= r.width - pad * 2;
        const fitsY = (maxY - minY) * z <= r.height - pad * 2;
        this.view = {
            zoom: z,
            x: fitsX ? (r.width - (maxX - minX) * z) / 2 - minX * z : r.width - pad / 2 - maxX * z,
            y: fitsY ? (r.height - (maxY - minY) * z) / 2 - minY * z : pad - minY * z,
        };
        this.applyView();
    }

    /* ── rendering ─────────────────────────────────────────────── */

    private render(force = false): void {
        const alive = new Set(doc.nodes.map((n) => n.id));
        for (const [id, v] of this.views) {
            if (alive.has(id)) continue;
            this.nodeSizes.unobserve(v.el);
            v.el.remove();
            this.views.delete(id);
            const vp = this.viewports.get(id);
            if (vp) {
                vp.engine.dispose();
                this.viewports.delete(id);
            }
        }

        for (const node of doc.nodes) {
            const def = registry.get(node.type);
            const key = this.shapeKey(node, def);
            let v = this.views.get(node.id);
            if (!v || force || v.key !== key) {
                const next = this.buildNode(node, def, key);
                if (v) {
                    this.nodeSizes.unobserve(v.el);
                    v.el.replaceWith(next.el);
                } else {
                    this.layer.append(next.el);
                }
                this.nodeSizes.observe(next.el);
                v = next;
                this.views.set(node.id, v);
            }
            v.el.style.transform = `translate(${node.pos[0]}px, ${node.pos[1]}px)`;
            if (node.size) {
                v.el.style.width = `${node.size[0]}px`;
                const host = this.viewports.get(node.id)?.host;
                if (host) host.style.height = `${node.size[1]}px`;
            }
        }
        this.markSelection();
        this.showResults();
        this.drawWires();
    }

    /** What a node view depends on besides positions and values. */
    private shapeKey(node: GraphNode, def: NodeDef | undefined): string {
        const linked = doc.links.filter((l) => l.to.node === node.id).map((l) => l.to.port).sort().join(',');
        return [def?.type ?? '?', def?.revision ?? 0, linked, node.animate ?? '', node.disabled ?? '', node.title ?? '', node.collapsed ?? ''].join('|');
    }

    private buildNode(node: GraphNode, def: NodeDef | undefined, key: string): NodeView {
        const pins = new Map<string, HTMLElement>();
        const color = CATEGORY_COLORS[def?.category.split('/')[0] ?? ''] ?? '#808080';
        const animated = node.animate ?? def?.animate ?? false;

        const head = h('header', { className: 'gnode-head', style: { '--cat': color } as any },
            h('span', { className: 'gnode-title', title: def ? `${def.type}${def.description ? ` — ${def.description}` : ''}` : node.type },
                node.title ?? def?.title ?? node.type),
            def?.source && def.type !== 'output/viewport'
                ? h('button', {
                    className: 'gnode-btn',
                    title: isScriptType(def.type) ? 'edit this node’s script' : 'view this node’s code — save it as a custom version',
                    onclick: () => void openScriptPanel({ type: def.type, nodeId: node.id }),
                }, '✎')
                : null,
            def && !def.output ? h('button', {
                className: animated ? 'gnode-btn on' : 'gnode-btn',
                title: animated ? 'animated: re-runs every frame while playing (click to stop)' : 'animate: re-run every frame while playing',
                onclick: () => edit('animate', (d) => {
                    const n = getNode(d, node.id)!;
                    n.animate = !animated;
                }),
            }, '⟳') : null,
            h('button', {
                className: node.disabled ? 'gnode-btn power' : 'gnode-btn power on',
                title: node.disabled ? 'disabled — click to enable (m)' : 'enabled — click to disable (m)',
                onclick: () => this.toggleDisabled([node.id]),
            }, '⏻'),
            h('button', { className: 'gnode-btn', title: 'delete (del)', onclick: () => this.deleteNodes([node.id]) }, '×'));
        head.addEventListener('pointerdown', (e) => this.startNodeDrag(e, node.id));

        const body = h('div', { className: 'gnode-body' });
        if (!def) {
            body.append(h('div', { className: 'gnode-row muted' }, `unknown type ${node.type}`));
        } else {
            for (const p of def.outputs) {
                const pin = this.pin('out', node.id, p.name, p.type);
                pins.set(`out:${p.name}`, pin);
                body.append(h('div', { className: 'gnode-row out' }, h('span', { className: 'gnode-label' }, p.name), pin));
            }
            for (const p of def.inputs) {
                const pin = this.pin('in', node.id, p.name, p.type, p.multi);
                pins.set(`in:${p.name}`, pin);
                const linked = linksInto(doc, node.id, p.name).length > 0;
                const w = !linked && hasWidget(p.type, p)
                    ? widget(p.type, p, node.values[p.name] ?? p.default, (v) => this.setValue(node.id, p.name, v))
                    : null;
                body.append(h('div', { className: 'gnode-row in' }, pin, h('span', { className: 'gnode-label', title: p.description ?? '' }, p.label ?? p.name), w));
            }
            for (const p of def.params) {
                const w = widget(p.type, p, node.values[p.name] ?? p.default, (v) => this.setValue(node.id, p.name, v));
                body.append(h('div', { className: 'gnode-row param' }, h('span', { className: 'gnode-label', title: p.description ?? '' }, p.label ?? p.name), w));
            }
            if (def.type === 'output/viewport') body.append(this.viewportFor(node));
        }

        const foot = h('footer', { className: 'gnode-foot' });
        const el = h('div', { className: def?.output ? 'gnode output' : 'gnode', dataset: { node: node.id } }, head, body, foot);
        if (node.disabled) el.dataset.disabled = '';
        if (def?.type === 'output/viewport') {
            const grip = h('div', { className: 'gnode-resize', title: 'resize' });
            grip.addEventListener('pointerdown', (e) => this.startResize(e, node));
            el.append(grip);
        }
        el.addEventListener('pointerdown', (e) => {
            // a press on the body (not a widget) selects too
            if ((e.target as HTMLElement).closest('input, select, textarea, button, .gnode-pin, .viewport-host')) return;
            if (!e.shiftKey && !selection.get().has(node.id)) selection.set(new Set([node.id]));
        });
        return { el, key, pins, foot };
    }

    private pin(dir: 'in' | 'out', node: string, port: string, type: string, multi = false): HTMLElement {
        const list = type.trim().endsWith('[]');
        const pin = h('span', {
            className: `gnode-pin ${dir}${list ? ' list' : ''}${multi ? ' multi' : ''}`,
            title: `${port}: ${type}${multi ? ' (takes several links)' : ''}`,
            style: { '--pin': portTypes.color(type) } as any,
            dataset: { dir, node, port, type },
        });
        pin.addEventListener('pointerdown', (e) => this.startWire(e, dir, node, port));
        return pin;
    }

    private setValue(nodeId: string, name: string, v: unknown): void {
        edit(`value:${nodeId}:${name}`, (d) => {
            getNode(d, nodeId)!.values[name] = v;
        });
    }

    private markSelection(): void {
        const sel = selection.get();
        for (const [id, v] of this.views) v.el.classList.toggle('selected', sel.has(id));
    }

    private showResults(): void {
        const res = results.get();
        const pausedScripts = scriptsSuspended.get() || !scriptsTrusted.get();
        for (const [id, v] of this.views) {
            const r = res.get(id);
            const node = getNode(doc, id);
            const def = node && registry.get(node.type);
            const animated = !!(node && (node.animate ?? def?.animate));
            const paused = !!def && isScriptType(def.type) && pausedScripts;

            // state → border color; skipping propagates (blocked = an upstream node failed or was skipped)
            let state: NodeState;
            let text = '';
            if (node?.disabled) {
                state = 'skipped';
                text = 'disabled';
            } else if (!r) {
                state = 'skipped';
                text = def?.output ? '' : 'skipped — nothing it feeds is shown';
            } else if (paused && r.error) {
                state = 'skipped';
                text = scriptsSuspended.get() ? 'skipped — script nodes are paused' : 'skipped — the graph’s scripts aren’t trusted yet';
            } else if (r.blocked) {
                state = 'skipped';
                const up = getNode(doc, r.blocked);
                const name = up ? (up.title ?? registry.get(up.type)?.title ?? up.type) : 'an upstream node';
                text = up?.disabled ? `skipped — ${name} is disabled` : `skipped — waiting on ${name}`;
            } else if (r.error) {
                state = 'error';
                text = r.error;
            } else {
                state = r.ms >= (animated ? SLOW_ANIMATED_MS : SLOW_MS) ? 'slow' : 'ok';
                const parts: string[] = [];
                if (def && def.outputs.length) {
                    const first = def.outputs[0];
                    parts.push(preview(r.outputs[first.name], r.lists[first.name]));
                }
                if (r.ms >= 0.05) parts.push(`${r.ms.toFixed(1)} ms${state === 'slow' ? ' ⚠' : ''}`);
                if (r.skipped?.length) parts.push(`${r.skipped.length} input${r.skipped.length === 1 ? '' : 's'} skipped`);
                text = parts.join(' · ');
            }

            if (v.el.dataset.state !== state) {
                v.el.dataset.state = state;
                v.el.title = STATE_TEXT[state];
            }
            if (v.foot.textContent !== text) v.foot.textContent = text;
            if (def && r && !r.error) {
                for (const p of def.outputs) {
                    const pin = v.pins.get(`out:${p.name}`);
                    if (pin) pin.title = `${p.name}: ${p.type} = ${preview(r.outputs[p.name], r.lists[p.name])}`;
                }
            }
        }
        // viewports show whatever their scene input evaluated to
        for (const [id, vp] of this.viewports) {
            const link = getNode(doc, id)?.disabled ? undefined : linksInto(doc, id, 'scene')[0];
            const src = link && res.get(link.from.node);
            const scene = src && !src.error && !src.blocked ? (src.outputs[link.from.port] as SceneData) : null;
            vp.engine.setScene(scene?.kind === 'scene2d' ? scene : null);
        }
    }

    /* ── wires ─────────────────────────────────────────────────── */

    private pinCenter(pin: HTMLElement): [number, number] {
        const r = pin.getBoundingClientRect();
        const l = this.layer.getBoundingClientRect();
        return [(r.left + r.width / 2 - l.left) / this.view.zoom, (r.top + r.height / 2 - l.top) / this.view.zoom];
    }

    /** Redraws every wire on the next frame. */
    drawWires(): void {
        if (this.wiresQueued) return;
        this.wiresQueued = true;
        requestAnimationFrame(() => {
            this.wiresQueued = false;
            this.drawWiresNow();
        });
    }

    private drawWiresNow(): void {
        const keep = this.drag?.kind === 'wire' ? this.drag.path : null;
        this.wires.replaceChildren(...(keep ? [keep] : []));
        for (const l of doc.links) {
            const a = this.views.get(l.from.node)?.pins.get(`out:${l.from.port}`);
            const b = this.views.get(l.to.node)?.pins.get(`in:${l.to.port}`);
            if (!a || !b) continue;
            const type = a.dataset.type ?? 'any';
            const path = svg('path', { class: l.id === this.selectedLink ? 'wire selected' : 'wire', d: curve(this.pinCenter(a), this.pinCenter(b)) });
            path.style.setProperty('--pin', portTypes.color(type));
            path.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                this.selectedLink = l.id;
                selection.set(new Set());
                this.drawWires();
            });
            this.wires.prepend(path);
        }
    }

    private startWire(e: PointerEvent, dir: 'in' | 'out', node: string, port: string): void {
        e.stopPropagation();
        e.preventDefault();
        let from: PortRef = { node, port };
        if (dir === 'in') {
            // pick up the input's (last) link and re-route it from its source
            const links = linksInto(doc, node, port);
            const link = links[links.length - 1];
            if (!link) return;
            from = link.from;
            edit('disconnect', (d) => disconnect(d, link.id));
        }
        const fromNode = getNode(doc, from.node)!;
        const type = registry.get(fromNode.type)?.outputs.find((p) => p.name === from.port)?.type ?? 'any';
        const color = portTypes.color(type);
        const path = svg('path', { class: 'wire dragging' });
        path.style.setProperty('--pin', color);
        this.wires.append(path);
        this.drag = { kind: 'wire', from, path, color };
        this.el.setPointerCapture(e.pointerId);
        this.el.classList.add('wiring');

        // light up the inputs this can connect to
        for (const [id, v] of this.views) {
            for (const [key, pin] of v.pins) {
                if (!key.startsWith('in:')) continue;
                const ok = canConnect(doc, registry, from, { node: id, port: key.slice(3) }).ok;
                pin.classList.toggle('can', ok);
            }
        }
        this.moveWire(e.clientX, e.clientY);
    }

    private moveWire(cx: number, cy: number): void {
        if (this.drag?.kind !== 'wire') return;
        const a = this.views.get(this.drag.from.node)?.pins.get(`out:${this.drag.from.port}`);
        if (!a) return;
        this.drag.path.setAttribute('d', curve(this.pinCenter(a), this.toGraph(cx, cy)));
    }

    private endWire(cx: number, cy: number): void {
        if (this.drag?.kind !== 'wire') return;
        const { from } = this.drag;
        this.drag.path.remove();
        this.drag = null;
        this.el.classList.remove('wiring');
        for (const v of this.views.values()) for (const pin of v.pins.values()) pin.classList.remove('can');

        const target = (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest<HTMLElement>('.gnode-pin.in');
        if (target) {
            const to = { node: target.dataset.node!, port: target.dataset.port! };
            const check = canConnect(doc, registry, from, to);
            if (check.ok) edit('connect', (d) => connect(d, registry, from, to));
            else this.flash(check.reason);
            return;
        }
        // dropped on empty canvas: pick a node to connect to
        const at = this.toGraph(cx, cy);
        openNodeMenu(this.el, cx, cy, (def) => {
            edit('add node', (d) => {
                const n = addNode(d, def, [at[0], at[1] - 20]);
                const fromType = registry.get(getNode(d, from.node)!.type)?.outputs.find((p) => p.name === from.port)?.type ?? 'any';
                const input = def.inputs.find((p) => portTypes.canConnect(fromType, p.type));
                if (input) connect(d, registry, from, { node: n.id, port: input.name });
                selection.set(new Set([n.id]));
            });
        }, { fromType: registry.get(getNode(doc, from.node)!.type)?.outputs.find((p) => p.name === from.port)?.type });
    }

    /* ── nodes ─────────────────────────────────────────────────── */

    private startNodeDrag(e: PointerEvent, id: string): void {
        if ((e.target as HTMLElement).closest('button')) return;
        e.stopPropagation();
        const sel = new Set(selection.get());
        if (e.shiftKey) {
            if (sel.has(id)) sel.delete(id);
            else sel.add(id);
        } else if (!sel.has(id)) {
            sel.clear();
            sel.add(id);
        }
        selection.set(sel);
        this.selectedLink = null;
        this.drag = { kind: 'nodes', last: { x: e.clientX, y: e.clientY }, moved: false };
        this.el.setPointerCapture(e.pointerId);
    }

    private startResize(e: PointerEvent, node: GraphNode): void {
        e.stopPropagation();
        e.preventDefault();
        const host = this.viewports.get(node.id)?.host;
        const size: [number, number] = node.size ?? [this.views.get(node.id)!.el.offsetWidth, host?.offsetHeight ?? 300];
        this.drag = { kind: 'resize', node: node.id, start: { x: e.clientX, y: e.clientY }, size };
        this.el.setPointerCapture(e.pointerId);
    }

    /** Disables the nodes, or enables them all if they're all disabled already. */
    toggleDisabled(ids: string[]): void {
        if (!ids.length) return;
        const enable = ids.every((id) => getNode(doc, id)?.disabled);
        edit('enable', (d) => {
            for (const id of ids) {
                const n = getNode(d, id);
                if (!n) continue;
                if (enable) delete n.disabled;
                else n.disabled = true;
            }
        });
    }

    deleteNodes(ids: string[]): void {
        if (!ids.length) return;
        edit('delete', (d) => {
            for (const id of ids) removeNode(d, id);
        });
        selection.set(new Set());
    }

    duplicateSelection(): void {
        const ids = [...selection.get()];
        if (!ids.length) return;
        const map = new Map<string, string>();
        edit('duplicate', (d) => {
            for (const id of ids) {
                const n = getNode(d, id)!;
                const copy: GraphNode = { ...structuredClone(n), id: graphId(), pos: [n.pos[0] + 30, n.pos[1] + 30] };
                map.set(id, copy.id);
                d.nodes.push(copy);
            }
            // links between duplicated nodes come along
            for (const l of [...d.links]) {
                if (map.has(l.from.node) && map.has(l.to.node)) {
                    d.links.push({ id: graphId('l'), from: { node: map.get(l.from.node)!, port: l.from.port }, to: { node: map.get(l.to.node)!, port: l.to.port } });
                }
            }
        });
        selection.set(new Set(map.values()));
    }

    /**
     * Tidies a hand-laid-out graph (the examples) once nodes have their real sizes: nodes at
     * about the same x form a column; columns are spaced by their widest node, and each
     * column is stacked top-down with a gap, so nothing overlaps whatever the font size.
     * Not an undo step: it's part of what was just loaded.
     */
    unstack(gap = 28): void {
        const boxes = doc.nodes.map((n) => {
            const el = this.views.get(n.id)?.el;
            return { n, w: el?.offsetWidth ?? 200, h: el?.offsetHeight ?? 100 };
        }).sort((a, b) => a.n.pos[0] - b.n.pos[0]);

        const columns: (typeof boxes)[] = [];
        for (const b of boxes) {
            const col = columns[columns.length - 1];
            if (col && b.n.pos[0] - col[0].n.pos[0] < 60) col.push(b);
            else columns.push([b]);
        }

        let moved = false;
        let right = -Infinity;
        for (const col of columns) {
            const x = Math.max(col[0].n.pos[0], right + gap * 2);
            const width = Math.max(...col.map((b) => b.w));
            col.sort((a, b) => a.n.pos[1] - b.n.pos[1]);
            let bottom = -Infinity;
            for (const b of col) {
                const y = Math.max(b.n.pos[1], bottom + gap);
                if (b.n.pos[0] !== x || b.n.pos[1] !== y) {
                    b.n.pos = [x, y];
                    moved = true;
                }
                bottom = y + b.h;
            }
            right = x + width;
        }
        if (moved) adjustLayout();
    }

    /** Opens the add-node menu at a client point. */
    addNodeAt(cx: number, cy: number): void {
        const at = this.toGraph(cx, cy);
        openNodeMenu(this.el, cx, cy, (def) => {
            edit('add node', (d) => {
                const n = addNode(d, def, at);
                if (def.type === 'output/viewport') n.size = [420, 320];
                selection.set(new Set([n.id]));
            });
        });
    }

    /* ── viewport nodes ────────────────────────────────────────── */

    private viewportFor(node: GraphNode): HTMLElement {
        let vp = this.viewports.get(node.id);
        if (!vp) {
            const host = h('div', { className: 'viewport-host' });
            const engine = new Engine(host);
            const playBtn = h('button', { className: 'vp-btn', title: 'play / stop (the whole graph animates while playing)' }, '▶');
            vp = { host, engine, playBtn };
            const v = vp;
            playBtn.onclick = () => (engine.state === 'playing' ? engine.stop() : engine.play());
            engine.onStateChange = (s) => {
                // the node's button, and its full-screen twin if open
                for (const b of [v.playBtn, ...document.querySelectorAll<HTMLElement>(`.viewport-full[data-node="${node.id}"] .vp-play`)]) {
                    b.textContent = s === 'playing' ? '■' : '▶';
                    b.classList.toggle('on', s === 'playing');
                }
            };
            engine.onFrame = (time, dt, frame) => {
                if (frame === 0 || isAnimated()) void evaluateFrame({ time, dt, frame });
            };
            this.viewports.set(node.id, vp);
        }
        const v = vp;
        const full = h('button', { className: 'vp-btn', title: 'full screen (esc to leave)', onclick: () => this.fullscreen(node.id) }, '⤢');
        const fit = h('button', { className: 'vp-btn', title: 'fit (double-click the view)', onclick: () => v.engine.fit() }, '⌖');
        return h('div', { className: 'viewport' }, h('div', { className: 'vp-bar' }, v.playBtn, fit, full), v.host);
    }

    private fullscreen(id: string): void {
        const vp = this.viewports.get(id);
        if (!vp) return;
        const home = vp.host.parentElement!;
        const overlay = h('div', { className: 'viewport-full', dataset: { node: id } });
        const refit = () => requestAnimationFrame(() => requestAnimationFrame(() => vp.engine.fit()));
        const exit = () => {
            home.append(vp.host);
            overlay.remove();
            refit();
            window.removeEventListener('keydown', onKey, true);
            if (document.fullscreenElement) void document.exitFullscreen();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                exit();
            }
            if (e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                vp.playBtn.click();
            }
        };
        overlay.append(h('div', { className: 'vp-bar floating' },
            h('button', { className: `vp-btn vp-play${vp.engine.state === 'playing' ? ' on' : ''}`, title: 'play / stop (space)', onclick: () => vp.playBtn.click() },
                vp.engine.state === 'playing' ? '■' : '▶'),
            h('button', { className: 'vp-btn', title: 'leave full screen (esc)', onclick: exit }, '✕')), vp.host);
        document.body.append(overlay);
        refit();
        window.addEventListener('keydown', onKey, true);
        overlay.requestFullscreen?.().catch(() => { /* the overlay already fills the window */ });
        document.addEventListener('fullscreenchange', function off() {
            if (!document.fullscreenElement && overlay.isConnected) exit();
            if (!overlay.isConnected) document.removeEventListener('fullscreenchange', off);
        });
    }

    /* ── input ─────────────────────────────────────────────────── */

    private attachInput(): void {
        const el = this.el;

        el.addEventListener('pointerdown', (e) => {
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.drag) return;
            const onBackground = e.target === el || e.target === this.layer || e.target === this.wires;
            if (this.pointers.size === 2) {
                // second finger: pinch / pan the canvas
                const [a, b] = [...this.pointers.values()];
                this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
                this.drag = { kind: 'pan', last: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
                return;
            }
            if (onBackground || e.button === 1) {
                if (onBackground && e.button === 0 && !e.shiftKey) {
                    selection.set(new Set());
                    if (this.selectedLink) {
                        this.selectedLink = null;
                        this.drawWires();
                    }
                }
                el.focus({ preventScroll: true });
                this.drag = { kind: 'pan', last: { x: e.clientX, y: e.clientY } };
                el.setPointerCapture(e.pointerId);
                el.classList.add('panning');
            }
        });

        el.addEventListener('pointermove', (e) => {
            if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const d = this.drag;
            if (!d) return;
            switch (d.kind) {
                case 'pan': {
                    if (this.pointers.size >= 2) {
                        const [a, b] = [...this.pointers.values()];
                        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                        const dist = Math.hypot(a.x - b.x, a.y - b.y);
                        this.view.x += c.x - d.last.x;
                        this.view.y += c.y - d.last.y;
                        if (this.pinchDist) this.zoomAt(c.x, c.y, dist / this.pinchDist);
                        this.pinchDist = dist;
                        d.last = c;
                    } else {
                        this.view.x += e.clientX - d.last.x;
                        this.view.y += e.clientY - d.last.y;
                        d.last = { x: e.clientX, y: e.clientY };
                    }
                    this.applyView();
                    break;
                }
                case 'nodes': {
                    const dx = (e.clientX - d.last.x) / this.view.zoom;
                    const dy = (e.clientY - d.last.y) / this.view.zoom;
                    d.last = { x: e.clientX, y: e.clientY };
                    if (!dx && !dy) break;
                    d.moved = true;
                    const ids = selection.get();
                    edit('move', (doc) => {
                        for (const n of doc.nodes) if (ids.has(n.id)) n.pos = [n.pos[0] + dx, n.pos[1] + dy];
                    });
                    break;
                }
                case 'wire':
                    this.moveWire(e.clientX, e.clientY);
                    break;
                case 'resize': {
                    const w = Math.max(240, d.size[0] + (e.clientX - d.start.x) / this.view.zoom);
                    const ht = Math.max(140, d.size[1] + (e.clientY - d.start.y) / this.view.zoom);
                    edit(`resize:${d.node}`, (doc) => {
                        getNode(doc, d.node)!.size = [Math.round(w), Math.round(ht)];
                    });
                    break;
                }
            }
        });

        const up = (e: PointerEvent) => {
            this.pointers.delete(e.pointerId);
            this.pinchDist = 0;
            const d = this.drag;
            if (!d) return;
            if (d.kind === 'wire') this.endWire(e.clientX, e.clientY);
            if (d.kind === 'pan' && this.pointers.size > 0) return; // one finger still down
            this.drag = null;
            el.classList.remove('panning');
            if (d.kind === 'nodes' && d.moved) {
                // snap to an 8-unit grid when the drag ends
                const ids = selection.get();
                edit('move', (doc) => {
                    for (const n of doc.nodes) if (ids.has(n.id)) n.pos = [Math.round(n.pos[0] / 8) * 8, Math.round(n.pos[1] / 8) * 8];
                });
            }
        };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);

        el.addEventListener('wheel', (e) => {
            if ((e.target as HTMLElement).closest('.viewport-host, textarea, select')) return;
            e.preventDefault();
            const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
            // trackpad two-finger scroll pans; pinch (ctrlKey) and mouse wheels zoom
            if (!e.ctrlKey && e.deltaX !== 0) {
                this.view.x -= e.deltaX * scale;
                this.view.y -= e.deltaY * scale;
                this.applyView();
                return;
            }
            this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * scale * (e.ctrlKey ? 0.01 : 0.0015)));
        }, { passive: false });

        el.addEventListener('dblclick', (e) => {
            if (e.target === el || e.target === this.layer || e.target === this.wires) this.addNodeAt(e.clientX, e.clientY);
        });
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (e.target === el || e.target === this.layer || e.target === this.wires) this.addNodeAt(e.clientX, e.clientY);
        });

        window.addEventListener('keydown', (e) => {
            const t = e.target as HTMLElement | null;
            if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || t.closest('.cm-editor, .script-panel, .node-menu'))) return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            } else if (mod && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
            } else if (mod && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                this.duplicateSelection();
            } else if (mod && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                selection.set(new Set(doc.nodes.map((n) => n.id)));
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedLink) {
                    const id = this.selectedLink;
                    this.selectedLink = null;
                    edit('disconnect', (d) => disconnect(d, id));
                } else {
                    this.deleteNodes([...selection.get()]);
                }
            } else if (e.key === 'f') {
                this.fit();
            } else if (e.key === 'm' && !mod) {
                this.toggleDisabled([...selection.get()]);
            } else if (e.key === 'a' && !mod) {
                const r = this.el.getBoundingClientRect();
                this.addNodeAt(r.left + r.width / 2, r.top + r.height / 3);
            } else {
                return;
            }
            e.preventDefault();
        });
    }

    private flash(message: string): void {
        const tip = h('div', { className: 'graph-flash' }, message);
        this.el.append(tip);
        setTimeout(() => tip.remove(), 1600);
    }
}

/** A wire from an output (a) to an input (b): a horizontal S-curve. */
function curve([x1, y1]: [number, number], [x2, y2]: [number, number]): string {
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
