import { Signal } from '@n3rdw1z4rd/smoke-ui';
import {
    GraphEvaluator, createGraph, createNodeRegistry, normalizeGraph, type FrameInfo, type GraphDoc, type NodeResult,
} from '@n3rdw1z4rd/core/graph';
import { EVAL_HANG_MS, GraphWorker } from '../eval-client';
import type { NodeInterface } from '../eval-protocol';
import { registerSceneNodes } from '../scene-nodes';
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples';

/* ------------------------------------------------------------------ */
/* Editor state. The graph document is a plain object, mutated in       */
/* place through `edit()` (which records undo history, autosaves and    */
/* schedules evaluation); `docRevision` tells the views it changed.     */
/* ------------------------------------------------------------------ */

/*
 * The editor's registry mirrors the worker's: built-ins are the same code; script node types
 * are interfaces only (pins and widgets) — their code runs in the worker.
 */
export const registry = createNodeRegistry();
registerSceneNodes(registry);

/** used here only for `animated()` (which reads interfaces); evaluation happens in the worker */
const interfaces = new GraphEvaluator(registry);

export let doc: GraphDoc = createGraph();

/** bumped on every change to the document (structure, values, positions) */
export const docRevision = new Signal(0);
/** bumped when the whole document is swapped (load, undo): views rebuild everything */
export const docEpoch = new Signal(0);
/** bumped when node types change (a script recompiled) */
export const typesRevision = new Signal(0);
/** the last evaluation's results */
export const results = new Signal<Map<string, NodeResult>>(new Map());
export const selection = new Signal<Set<string>>(new Set());
export const status = new Signal('');
/** behaviours that threw while playing, by node id (cleared when play starts again) */
export const runtimeErrors = new Signal<Map<string, string>>(new Map());
/** scripts in a loaded graph wait for this before they compile */
export const scriptsTrusted = new Signal(true);
/** set when the worker was replaced because it stopped responding: scripts wait for `resumeScripts()` */
export const scriptsSuspended = new Signal(false);

const bump = (s: Signal<number>) => s.set(s.get() + 1);

/* ── history ─────────────────────────────────────────────────────── */

const undoStack: string[] = [];
const redoStack: string[] = [];
let lastLabel = '';
let lastAt = 0;

/** Continuous edits (a drag, scrubbing a field, a resize) merge into one undo step. */
const MERGING = /^(move|value:|resize:)/;

/**
 * Changes the document. Consecutive continuous edits with the same `label` within a second
 * merge into one undo step; every other edit (connect, delete, toggle…) is its own step.
 */
export function edit(label: string, change: (doc: GraphDoc) => void): void {
    const now = performance.now();
    if (!MERGING.test(label) || label !== lastLabel || now - lastAt > 1000) {
        undoStack.push(JSON.stringify(doc));
        if (undoStack.length > 200) undoStack.shift();
        redoStack.length = 0;
    }
    lastLabel = label;
    lastAt = now;
    change(doc);
    changed();
}

export function undo(): void {
    const prev = undoStack.pop();
    if (!prev) return;
    status.set('');
    redoStack.push(JSON.stringify(doc));
    replace(JSON.parse(prev), false);
}

export function redo(): void {
    const next = redoStack.pop();
    if (!next) return;
    status.set('');
    undoStack.push(JSON.stringify(doc));
    replace(JSON.parse(next), false);
}

/**
 * Opens another document as one undoable step (examples, reset): undo goes back to what
 * you had.
 */
export function openDocument(next: GraphDoc, trusted: boolean): void {
    undoStack.push(JSON.stringify(doc));
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    scriptsTrusted.set(trusted || !Object.keys(next.scripts ?? {}).length);
    replace(next, false);
}

/** Loads a built-in example (its script nodes are ours, so they're trusted). */
export function loadExample(id: string): void {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    openDocument(ex.make(registry), true);
    status.set(`example: ${ex.label} — ${ex.description} (undo to go back)`);
}

/** Swaps in another document (load, import, undo). */
export function replace(next: GraphDoc, resetHistory = true): void {
    doc = normalizeGraph(next);
    if (resetHistory) {
        undoStack.length = 0;
        redoStack.length = 0;
    }
    lastLabel = '';
    const ids = new Set(doc.nodes.map((n) => n.id));
    selection.set(new Set([...selection.get()].filter((id) => ids.has(id))));
    void compileScripts();
    bump(docEpoch);
    changed();
}

/** Node positions were tidied (not an edit of yours): redraw and save, no undo step. */
export function adjustLayout(): void {
    bump(docRevision);
    scheduleSave();
}

function changed(): void {
    bump(docRevision);
    scheduleEvaluate();
    scheduleSave();
}

/* ── evaluation (in a worker) ────────────────────────────────────── */

let worker = new GraphWorker();
/** script sources the current worker has compiled */
let workerScripts = new Map<string, string>();

let queued = false;
let running = false;
let again = false;
let frame: FrameInfo | undefined;

/** Evaluates on the next microtask (edits in the same tick coalesce). */
export function scheduleEvaluate(): void {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
        queued = false;
        void evaluate();
    });
}

/**
 * Evaluates for an animation frame (the viewport calls this while playing). Frames that
 * arrive while the worker is busy are folded into the next evaluation, not queued.
 */
export function evaluateFrame(f: FrameInfo): Promise<void> {
    frame = f;
    return evaluate();
}

/** Whether any output depends on an animated node. */
export function isAnimated(): boolean {
    return interfaces.animated(doc).length > 0;
}

async function evaluate(): Promise<void> {
    if (running) {
        again = true; // run once more when the current one is back
        return;
    }
    running = true;
    try {
        await worker.ready;
        const reply = await worker.evaluate(doc, docRevision.get(), frame);
        const keep = new Set(reply.order);
        const next = new Map<string, NodeResult>();
        for (const [id, r] of results.get()) if (keep.has(id)) next.set(id, r);
        for (const [id, r] of reply.results) next.set(id, r);
        results.set(next);
    } catch (err) {
        // a request cut off by a restart: the watchdog already said what happened
        if ((err as Error).message !== 'restarted') status.set(`evaluation failed: ${(err as Error).message}`);
    } finally {
        running = false;
        if (again) {
            again = false;
            scheduleEvaluate();
        }
    }
}

/* ── watchdog ────────────────────────────────────────────────────── */

setInterval(() => {
    if (!worker.hung) return;
    worker.dispose('restarted');
    worker = new GraphWorker();
    workerScripts = new Map();
    scriptsSuspended.set(true);
    status.set(`the graph stopped responding for ${EVAL_HANG_MS / 1000}s (a script node stuck in a loop?) — restarted with script nodes paused`);
    scheduleEvaluate();
}, 500);

/** Lets script nodes run again after a restart. */
export function resumeScripts(): void {
    scriptsSuspended.set(false);
    status.set('');
    void compileScripts();
}

/* ── script node types ───────────────────────────────────────────── */

/** Registers a script type's interface in the editor's registry (its code lives in the worker). */
function registerInterface(spec: NodeInterface): void {
    registry.register({ ...spec, run: () => { throw new Error('script nodes run in the graph worker'); } });
}

/** Compiles the document's script node types in the worker (once trusted and not suspended). */
export async function compileScripts(): Promise<void> {
    if (!scriptsTrusted.get() || scriptsSuspended.get()) return;
    const w = worker;
    for (const [type, source] of Object.entries(doc.scripts ?? {})) {
        if (workerScripts.get(type) === source && registry.get(type)?.source === source) continue;
        try {
            registerInterface(await w.compile(type, source));
            workerScripts.set(type, source);
        } catch (err) {
            if (w === worker) status.set(`script node ${type}: ${(err as Error).message}`);
        }
    }
    bump(typesRevision);
    scheduleEvaluate();
}

/**
 * Saves (and compiles) a script node type; throws on a compile error, leaving the old one.
 * While scripts are paused it only saves the source ('saved'); resuming compiles it.
 */
export async function saveScript(type: string, source: string): Promise<'compiled' | 'saved'> {
    if (scriptsSuspended.get()) {
        edit(`script:${type}`, (d) => {
            d.scripts = { ...(d.scripts ?? {}), [type]: source };
        });
        return 'saved';
    }
    const spec = await worker.compile(type, source);
    workerScripts.set(type, source);
    registerInterface(spec);
    edit(`script:${type}`, (d) => {
        d.scripts = { ...(d.scripts ?? {}), [type]: source };
    });
    bump(typesRevision);
    return 'compiled';
}

/** Whether a type is one of this graph's script node types (vs a built-in). */
export function isScriptType(type: string): boolean {
    return !!doc.scripts?.[type];
}

/** A free type name based on `base` (`custom/box`, `custom/box-2`, …). */
export function freeTypeName(base: string): string {
    let name = base;
    for (let k = 2; registry.get(name) || doc.scripts?.[name]; k++) name = `${base}-${k}`;
    return name;
}

/**
 * Saves `source` as a new script node type and switches the given nodes to it, keeping their
 * values and the wires whose ports still exist — one undo step. Throws on a compile error.
 */
export async function forkNodes(nodeIds: string[], type: string, source: string): Promise<void> {
    if (scriptsSuspended.get()) throw new Error('script nodes are paused — resume them first');
    if (registry.get(type) && !isScriptType(type)) throw new Error(`${type} is a built-in type — pick another name`);
    const spec = await worker.compile(type, source);
    workerScripts.set(type, source);
    registerInterface(spec);
    const def = registry.get(type)!;
    const ins = new Set(def.inputs.map((p) => p.name));
    const outs = new Set(def.outputs.map((p) => p.name));
    const ids = new Set(nodeIds);
    edit(`fork:${type}`, (d) => {
        d.scripts = { ...(d.scripts ?? {}), [type]: source };
        for (const n of d.nodes) if (ids.has(n.id)) n.type = type;
        d.links = d.links.filter((l) => !(ids.has(l.to.node) && !ins.has(l.to.port)) && !(ids.has(l.from.node) && !outs.has(l.from.port)));
    });
    bump(typesRevision);
}

/* ── autosave ────────────────────────────────────────────────────── */

const SAVE_KEY = 'apparatus.graph';
let saveTimer = 0;

function scheduleSave(): void {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(doc));
        } catch { /* storage unavailable: nothing to do */ }
    }, 400);
}

/** Loads the autosaved graph (your own, so its scripts are trusted), or the default example. */
export function boot(): void {
    try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
            replace(JSON.parse(saved));
            return;
        }
    } catch { /* fall through to the example */ }
    replace(DEFAULT_EXAMPLE.make(registry));
}

/** Loads a graph from a file; its scripts wait for trust. */
export async function importGraph(file: File): Promise<void> {
    const parsed = normalizeGraph(JSON.parse(await file.text()));
    scriptsTrusted.set(!Object.keys(parsed.scripts ?? {}).length);
    replace(parsed);
}

export function exportGraph(): void {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'graph.apparatus.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function trustScripts(): void {
    scriptsTrusted.set(true);
    void compileScripts();
}
