import { computed } from '@n3rdw1z4rd/smoke-ui';
import { addNode } from '@n3rdw1z4rd/core/graph';
import { GraphCanvas } from './editor/canvas';
import { openScriptPanel, setScriptAddHandler } from './editor/script-panel';
import {
    boot, doc, edit, exportGraph, importGraph, redo, registry, replace, resumeScripts, scriptsSuspended, scriptsTrusted,
    selection, status, trustScripts, undo,
} from './editor/state';
import { exampleGraph } from './editor/example';

/* ------------------------------------------------------------------ */
/* apparatus · graph — the scene as a node graph. Nodes are functions   */
/* (built-in, or scripts you write); the Viewport node runs the scene   */
/* the graph evaluates to.                                              */
/* ------------------------------------------------------------------ */

const canvas = new GraphCanvas();

setScriptAddHandler((type) => {
    const def = registry.get(type);
    if (!def) return;
    const r = canvas.el.getBoundingClientRect();
    const [x, y] = canvas.toGraph(r.left + r.width / 2, r.top + r.height / 2);
    edit('add node', (d) => {
        const n = addNode(d, def, [x, y]);
        selection.set(new Set([n.id]));
    });
});

const pickImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
        const f = input.files?.[0];
        if (f) importGraph(f).catch((err) => status.set(`import failed: ${(err as Error).message}`));
    };
    input.click();
};

const Toolbar = () => (
    <nav className="graph-bar">
        <a className="graph-brand" href="./" title="the scene editor">apparatus</a>
        <span className="graph-brand muted">graph</span>
        <button className="btn" title="add a node (a, double-click or right-click the canvas)" onClick={() => {
            const r = canvas.el.getBoundingClientRect();
            canvas.addNodeAt(r.left + r.width / 2 - 140, r.top + 80);
        }}>+ node</button>
        <button className="btn" title="write node types by hand" onClick={() => void openScriptPanel()}>scripts</button>
        <button className="btn" title="undo (ctrl/⌘+z)" onClick={undo}>↶</button>
        <button className="btn" title="redo (ctrl/⌘+shift+z)" onClick={redo}>↷</button>
        <button className="btn" title="frame every node (f)" onClick={() => canvas.fit()}>fit</button>
        <button className="btn" title="save the graph as JSON" onClick={exportGraph}>export</button>
        <button className="btn" title="load a graph from JSON" onClick={pickImport}>import</button>
        <button className="btn" title="start over from the example graph" onClick={() => {
            if (confirm('Replace this graph with the example? (undo can’t bring it back)')) replace(exampleGraph(registry));
        }}>reset</button>
        <span className="graph-status">{status}</span>
    </nav>
) as HTMLElement;

const TrustBanner = () => (
    <div className="graph-banner" style={{ display: computed(() => (scriptsTrusted.get() ? 'none' : '')) }}>
        <span>This graph includes <b>script nodes</b>. They run as code in this page — review them first.</span>
        <button className="btn" onClick={() => void openScriptPanel()}>review</button>
        <button className="btn primary" onClick={trustScripts}>trust</button>
    </div>
) as HTMLElement;

const SuspendedBanner = () => (
    <div className="graph-banner" style={{ display: computed(() => (scriptsSuspended.get() ? '' : 'none')) }}>
        <span>The graph stopped responding and was restarted. <b>Script nodes are paused</b> — fix the stuck one, then resume.</span>
        <button className="btn" onClick={() => void openScriptPanel()}>scripts</button>
        <button className="btn primary" onClick={resumeScripts}>resume</button>
    </div>
) as HTMLElement;

document.getElementById('root')!.append(
    <div className="graph-app">
        <Toolbar />
        <TrustBanner />
        <SuspendedBanner />
        {canvas.el}
        <div className="graph-help"><span className="legend ok">ok</span> <span className="legend error">error</span> <span className="legend slow">slow</span> <span className="legend skipped">skipped</span> · drag empty space to pan · wheel / pinch to zoom · drag from a pin to wire · double-click, right-click or <b>a</b> to add · <b>m</b> disables · <b>del</b> deletes · <b>f</b> fits</div>
    </div> as HTMLElement,
);

boot();
requestAnimationFrame(() => canvas.fit());

// console access: `graph.doc`, `graph.registry`, `graph.canvas`
(window as any).graph = { get doc() { return doc; }, registry, canvas, selection };
