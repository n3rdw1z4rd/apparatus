import { getNode, linksInto, type GraphNode } from '@n3rdw1z4rd/core/graph';
import {
    chainOf, doc, editPath, evaluateFrame, h, isAnimated, picked, registry, results, rootDoc, runtimeErrors, selection, status,
    type NodeBodyPlugin,
} from '@n3rdw1z4rd/smoke-ui-node-graph';
import { entitiesThrough, madeId, sourceOf } from './editor/highlight';
import { Engine } from './engine';
import type { SceneData } from './scene-nodes';

/* ------------------------------------------------------------------ */
/* The Viewport node's body: an engine running the scene the graph      */
/* evaluates to. ▶ plays (the whole graph animates while playing), ⤢   */
/* goes full screen. Clicking an entity selects the node that made it;  */
/* a selection outlines the entities its chain runs through.            */
/* ------------------------------------------------------------------ */

interface Viewport {
    host: HTMLElement;
    engine: Engine;
    playBtn: HTMLButtonElement;
}

const viewports = new Map<string, Viewport>();

/** the entity last clicked in a viewport (ringed while its node stays selected) */
let clicked: { entity: string; node: string } | null = null;

export const viewportPlugin: NodeBodyPlugin = {
    types: ['output/viewport'],
    hideCode: true,
    defaultSize: [420, 320],
    body: (node) => viewportBody(node),
    sized: (id) => viewports.get(id)?.host,
    dispose(id) {
        viewports.get(id)?.engine.dispose();
        viewports.delete(id);
    },
    refresh() {
        feedScenes();
        outline();
    },
};

/** The viewports (for the console and tests). */
export function allViewports(): ReadonlyMap<string, Viewport> {
    return viewports;
}

function viewportBody(node: GraphNode): HTMLElement {
    let vp = viewports.get(node.id);
    if (!vp) {
        const host = h('div', { className: 'viewport-host graph-interactive' });
        const engine = new Engine(host);
        const playBtn = h('button', { className: 'vp-btn', title: 'play / stop (the whole graph animates while playing)' }, '▶');
        vp = { host, engine, playBtn };
        const v = vp;
        playBtn.onclick = () => (engine.state === 'playing' ? engine.stop() : engine.play());
        engine.onBehaviorError = (errors) => {
            const next = new Map(runtimeErrors.get());
            for (const e of errors) next.set(e.node, e.message);
            runtimeErrors.set(next);
            const first = errors[0];
            const n = getNode(doc, first.node);
            status.set(`${n ? (n.title ?? registry.get(n.type)?.title ?? n.type) : first.type} failed while playing and was switched off on that entity: ${first.message}`);
        };
        engine.onStateChange = (s) => {
            if (s === 'playing' && runtimeErrors.get().size) runtimeErrors.set(new Map());
            // the node's button, and its full-screen twin if open
            for (const b of [v.playBtn, ...document.querySelectorAll<HTMLElement>(`.viewport-full[data-node="${node.id}"] .vp-play`)]) {
                b.textContent = s === 'playing' ? '■' : '▶';
                b.classList.toggle('on', s === 'playing');
            }
        };
        engine.onPick = (id, additive) => pick(id, additive);
        engine.onFrame = (time, dt, frame) => {
            if (frame === 0 || isAnimated()) void evaluateFrame({ time, dt, frame });
        };
        viewports.set(node.id, vp);
    }
    const v = vp;
    const full = h('button', { className: 'vp-btn', title: 'full screen (esc to leave)', onclick: () => fullscreen(node.id) }, '⤢');
    const fit = h('button', { className: 'vp-btn', title: 'fit (double-click the view)', onclick: () => v.engine.fit() }, '⌖');
    return h('div', { className: 'viewport' }, h('div', { className: 'vp-bar' }, v.playBtn, fit, full), v.host);
}

/** Viewports show whatever their scene input evaluated to. */
function feedScenes(): void {
    const res = results.get();
    for (const [id, vp] of viewports) {
        const link = getNode(rootDoc(), id)?.disabled ? undefined : linksInto(rootDoc(), id, 'scene')[0];
        const src = link && res.get(link.from.node);
        const scene = src && !src.error && !src.blocked ? (src.outputs[link.from.port] as SceneData) : null;
        vp.engine.setScene(scene?.kind === 'scene2d' ? scene : null);
    }
}

/** Outlines, in every viewport, the entities the selection's chain runs through. */
function outline(): void {
    const sel = new Set([...selection.get()].filter((id) => getNode(doc, id)));
    if (clicked && !sel.has(clicked.node)) clicked = null;
    const chain = sel.size ? chainOf(doc, sel).nodes : new Set<string>();
    const path = editPath.get();
    for (const vp of viewports.values()) {
        let ids = new Set<string>();
        if (sel.size && !path.length) {
            ids = entitiesThrough(chain, sel, results.get());
        } else if (sel.size) {
            // inside a subgraph there are no inner results: go by which node made each entity
            for (const id of vp.engine.entityIds()) {
                const src = sourceOf(id, rootDoc(), path);
                if (src && chain.has(src.node)) ids.add(madeId(id));
            }
        }
        vp.engine.setHighlight(ids, clicked?.entity ?? null);
    }
}

/** A click in a viewport: select the node that made the entity (shift / ⌘ adds or removes). */
function pick(entityId: string | null, additive: boolean): void {
    const src = entityId ? sourceOf(entityId, rootDoc(), editPath.get()) : null;
    if (!src) {
        if (!additive) {
            clicked = null;
            picked.set(null);
            selection.set(new Set());
        }
        return;
    }
    const sel = new Set(additive ? selection.get() : []);
    if (additive && sel.has(src.node)) sel.delete(src.node);
    else sel.add(src.node);
    const on = sel.has(src.node);
    clicked = on ? { entity: madeId(entityId!), node: src.node } : null;
    // the selection first: changing it clears a picked item whose node isn't selected
    selection.set(sel);
    picked.set(on && src.index !== null ? { node: src.node, index: src.index } : null);
}

function fullscreen(id: string): void {
    const vp = viewports.get(id);
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
