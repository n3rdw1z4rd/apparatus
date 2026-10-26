import { Signal } from '@n3rdw1z4rd/smoke-ui';
import {
    GraphEvaluator, compileNodeScript, createNodeRegistry, normalizeGraph, type FrameInfo, type GraphDoc, type NodeResult,
} from '@n3rdw1z4rd/core/graph';
import { registerSceneNodes } from '../scene-nodes';
import { exampleGraph } from './example';

/* ------------------------------------------------------------------ */
/* Editor state. The graph document is a plain object, mutated in       */
/* place through `edit()` (which records undo history, autosaves and    */
/* schedules evaluation); `docRevision` tells the views it changed.     */
/* ------------------------------------------------------------------ */

export const registry = createNodeRegistry();
registerSceneNodes(registry);

export const evaluator = new GraphEvaluator(registry);

export let doc: GraphDoc = exampleGraph(registry);

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
/** scripts in a loaded graph wait for this before they compile */
export const scriptsTrusted = new Signal(true);

const bump = (s: Signal<number>) => s.set(s.get() + 1);

/* ── history ─────────────────────────────────────────────────────── */

const undoStack: string[] = [];
const redoStack: string[] = [];
let lastLabel = '';
let lastAt = 0;

/**
 * Changes the document. Consecutive edits with the same `label` within a second merge into
 * one undo step (dragging a node, typing in a field).
 */
export function edit(label: string, change: (doc: GraphDoc) => void): void {
    const now = performance.now();
    if (label !== lastLabel || now - lastAt > 1000) {
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
    redoStack.push(JSON.stringify(doc));
    replace(JSON.parse(prev), false);
}

export function redo(): void {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(JSON.stringify(doc));
    replace(JSON.parse(next), false);
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

function changed(): void {
    bump(docRevision);
    scheduleEvaluate();
    scheduleSave();
}

/* ── evaluation ──────────────────────────────────────────────────── */

let queued = false;
let running = false;
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

/** Evaluates for an animation frame (the viewport calls this while playing). */
export function evaluateFrame(f: FrameInfo): Promise<void> {
    frame = f;
    return evaluate();
}

/** Whether any output depends on an animated node. */
export function isAnimated(): boolean {
    return evaluator.animated(doc).length > 0;
}

async function evaluate(): Promise<void> {
    if (running) {
        scheduleEvaluate();
        return;
    }
    running = true;
    try {
        const r = await evaluator.evaluate(doc, { frame });
        results.set(r.results);
    } catch (err) {
        status.set(`evaluation failed: ${(err as Error).message}`);
    } finally {
        running = false;
    }
}

/* ── script node types ───────────────────────────────────────────── */

/** Compiles the document's script node types into the registry. */
export async function compileScripts(): Promise<void> {
    if (!scriptsTrusted.get()) return;
    for (const [type, source] of Object.entries(doc.scripts ?? {})) {
        if (registry.get(type)?.source === source) continue;
        try {
            registry.register(await compileNodeScript(type, source));
        } catch (err) {
            status.set(`script node ${type}: ${(err as Error).message}`);
        }
    }
    bump(typesRevision);
    scheduleEvaluate();
}

/** Saves (and compiles) a script node type; throws on a compile error, leaving the old one. */
export async function saveScript(type: string, source: string): Promise<void> {
    const def = await compileNodeScript(type, source);
    registry.register(def);
    edit(`script:${type}`, (d) => {
        d.scripts = { ...(d.scripts ?? {}), [type]: source };
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

/** Loads the autosaved graph (your own, so its scripts are trusted), or the example. */
export function boot(): void {
    try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) {
            replace(JSON.parse(saved));
            return;
        }
    } catch { /* fall through to the example */ }
    replace(exampleGraph(registry));
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
