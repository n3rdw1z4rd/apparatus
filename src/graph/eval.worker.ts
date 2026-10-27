/// <reference lib="webworker" />
import { GraphEvaluator, compileNodeScript, createNodeRegistry, registerSubgraphs, type GraphDoc, type NodeResult } from '@n3rdw1z4rd/core/graph';
import type { FromEvalWorker, NodeInterface, ToEvalWorker } from './eval-protocol';
import { registerSceneNodes } from './scene-nodes';

/* ------------------------------------------------------------------ */
/* Graph evaluation, off the main thread. Script nodes are compiled     */
/* and run only here, so one stuck in a loop can't freeze the editor:   */
/* the editor notices the silence and replaces this worker.             */
/* ------------------------------------------------------------------ */

const registry = createNodeRegistry();
registerSceneNodes(registry);
const evaluator = new GraphEvaluator(registry);

let doc: GraphDoc | null = null;
/** the stamp each node's result had when it was last sent */
const sent = new Map<string, number>();

const post = (msg: FromEvalWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (ev: MessageEvent<ToEvalWorker>) => {
    const msg = ev.data;
    switch (msg.t) {
        case 'doc':
            doc = msg.doc;
            // subgraph types are defined by the document (changed ones are re-registered)
            registerSubgraphs(doc, registry);
            break;

        case 'eval': {
            if (!doc) return post({ t: 'failed', id: msg.id, error: 'no document yet' });
            try {
                const r = await evaluator.evaluate(doc, { frame: msg.frame });
                const changed: [string, NodeResult][] = [];
                for (const id of r.order) {
                    const res = r.results.get(id)!;
                    if (sent.get(id) === res.stamp) continue;
                    sent.set(id, res.stamp);
                    changed.push([id, cloneable(res)]);
                }
                for (const id of [...sent.keys()]) if (!r.results.has(id)) sent.delete(id);
                post({ t: 'result', id: msg.id, order: r.order, results: changed });
            } catch (err) {
                post({ t: 'failed', id: msg.id, error: (err as Error).message });
            }
            break;
        }

        case 'compile': {
            try {
                const def = await compileNodeScript(msg.type, msg.source);
                registry.register(def);
                const spec: NodeInterface = {
                    type: def.type, title: def.title, category: def.category, description: def.description,
                    output: def.output, animate: def.animate, source: def.source,
                    inputs: Object.fromEntries(def.inputs.map(({ name, base: _b, list: _l, ...p }) => [name, p])),
                    params: Object.fromEntries(def.params.map(({ name, ...p }) => [name, p])),
                    outputs: Object.fromEntries(def.outputs.map(({ name, base: _b, list: _l, ...p }) => [name, p])),
                };
                post({ t: 'compiled', id: msg.id, type: msg.type, spec: structuredClone(spec) });
            } catch (err) {
                post({ t: 'compiled', id: msg.id, type: msg.type, error: (err as Error).message });
            }
            break;
        }
    }
};

/** A result that can be posted: a script returning functions or class instances gets an error instead. */
function cloneable(res: NodeResult): NodeResult {
    try {
        return structuredClone(res);
    } catch {
        return { ...res, outputs: {}, lists: {}, error: 'an output isn’t plain data (functions and class instances can’t leave the worker)' };
    }
}

post({ t: 'ready' });
