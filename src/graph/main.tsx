import { configure, createGraphEditor, doc, openDocument, registry, selection, status } from '@n3rdw1z4rd/smoke-ui-node-graph';
import '@n3rdw1z4rd/smoke-ui-node-graph/style.css';
import './apparatus.css';
import { DEFAULT_EXAMPLE, EXAMPLES } from './editor/examples';
import { registerPreviews } from './previews';
import { registerSceneNodes } from './scene-nodes';
import { allViewports, viewportPlugin } from './viewport';

/* ------------------------------------------------------------------ */
/* apparatus · graph — the scene as a node graph. Nodes are functions   */
/* (built-in, or scripts you write); the Viewport node runs the scene   */
/* the graph evaluates to. The editor is smoke-ui-node-graph; this is   */
/* what apparatus plugs into it.                                        */
/* ------------------------------------------------------------------ */

configure({
    register: registerSceneNodes,
    worker: () => new Worker(new URL('./eval.worker.ts', import.meta.url), { type: 'module' }),
    initial: (r) => DEFAULT_EXAMPLE.make(r),
    storageKey: 'apparatus.graph',
    exportName: 'graph.apparatus.json',
});
registerPreviews();

/** Loads a built-in example (its script nodes are ours, so they're trusted): one undo step. */
function loadExample(id: string): void {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    openDocument(ex.make(registry), true);
    status.set(`example: ${ex.label} — ${ex.description} (undo to go back)`);
}

/** The Examples dropdown (far right of the toolbar). Picking one is a single undo step. */
const ExamplesMenu = () => {
    const select = (
        <select className="btn graph-examples" title="load an example graph (undo to go back)">
            <option value="" disabled selected>Examples</option>
            {EXAMPLES.map((e) => <option value={e.id} title={e.description}>{e.label}</option>)}
        </select>
    ) as HTMLSelectElement;
    select.addEventListener('change', () => {
        loadExample(select.value);
        select.value = '';
        editor.settle();
    });
    return select;
};

const editor = createGraphEditor({
    brand: { label: 'apparatus', href: './' },
    plugins: [viewportPlugin],
    categoryColors: { shape: '#f2a541', physics: '#e8554e', scene: '#f4d35e', behavior: '#ff7f9f' },
    resetTitle: `start over from the ${DEFAULT_EXAMPLE.label.toLowerCase()} scene (undo to go back)`,
    toolbarEnd: () => [
        ExamplesMenu(),
        <a className="graph-legacy" href="./legacy.html" title="the original apparatus scene editor">legacy editor</a> as HTMLElement,
    ],
});

document.getElementById('root')!.append(editor.el);
editor.start();

// console access: `graph.doc`, `graph.registry`, `graph.canvas`, `graph.viewports`
(window as any).graph = { get doc() { return doc; }, registry, canvas: editor.canvas, selection, viewports: allViewports() };
