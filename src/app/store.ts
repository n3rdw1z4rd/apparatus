import { computed, Signal } from '@n3rdw1z4rd/smoke-ui';
import { ECS, log, type Entity } from '@n3rdw1z4rd/core';
import { Camera } from '../core/camera';
import {
    Body, Meta, Shape, Transform, addPart, boundsOf, partEntities, partOf, partsOf, snapPosition,
} from '../core/components';
import {
    BUILTIN_SCRIPTS, PALETTE, PRESETS, PX_PER_M, decodeScene, defaultScene, encodeScene, hashString,
    normalizeScene, randomSeed, type PartDef, type PartShape, type SceneConfig,
} from '../core/scene';
import { exportsHook, SCRIPT_EXAMPLES } from '../core/script';
import { HANG_MS, PhysicsClient, type FrameInfo } from '../physics/physics-client';
import type { PointerMsg } from '../physics/protocol';
import { toast } from '../ui/toast';

/* ------------------------------------------------------------------ */
/* Reactive state — every control in the UI binds straight to these.   */
/* ------------------------------------------------------------------ */

export type Mode = 'build' | 'play';

export const sceneName = new Signal('sandbox');
export const seed = new Signal(1);
/** m/s², +y is down */
export const gravityX = new Signal(0);
export const gravityY = new Signal(9.81);
export const gridSize = new Signal(PX_PER_M);
export const snap = new Signal(true);
export const timeScale = new Signal(1);
export const showGrid = new Signal(true);
export const showLabels = new Signal(false);

export const mode = new Signal<Mode>('build');
export const paused = new Signal(false);
export const playing = computed(() => mode.get() === 'play');

/** The selected part (an entity id), or null. */
export const selected = new Signal<Entity | null>(null);
/** Bumped on every edit to the scene's parts (not on physics frames). */
export const revision = new Signal(0);
export const partCount = new Signal(0);

export const fps = new Signal(0);
export const simRate = new Signal('–');
export const simTime = new Signal('0.0');

export type ScriptState =
    | { kind: 'off' } // no script
    | { kind: 'ready' } // trusted; runs on play / "run build"
    | { kind: 'running' } // playing with setup/step hooks
    | { kind: 'pending' } // from a shared link or file, not reviewed yet
    | { kind: 'disabled' } // the user chose to ignore it
    | { kind: 'error'; message: string };

/** Source in the editor; also what the scene saves. */
export const scriptSource = new Signal('');
export const scriptState = new Signal<ScriptState>({ kind: 'off' });
export const editorOpen = new Signal(false);

/* ------------------------------------------------------------------ */
/* Engine instances                                                     */
/* ------------------------------------------------------------------ */

export const ecs = new ECS();
export const camera = new Camera();
export let physics: PhysicsClient;

/** Hovered part, for the renderer (not reactive). */
export let hovered: Entity | null = null;
export function setHovered(e: Entity | null): void {
    hovered = e;
}

/** Physics ids of bodies spawned by scripts during play → their entities. */
const spawnedEntities = new Map<number, Entity>();
/** The scene as it was when play started; restored on stop. */
let buildSnapshot: { parts: PartDef[]; selectedIndex: number } | null = null;

function createPhysics(): void {
    physics = new PhysicsClient();
    physics.onFrame = applyFrame;
    physics.onError.subscribe((err) => {
        console.error('physics worker error', err);
        restartPhysics('The physics worker crashed and was restarted.');
    });
}

/** Replaces a stuck or crashed worker. Play stops; the script is turned off. */
function restartPhysics(message: string): void {
    physics.dispose(message);
    createPhysics();
    if (mode.get() === 'play') stop();
    if (scriptSource.get().trim()) scriptState.set({ kind: 'error', message });
    toast(message, true);
}

/* ------------------------------------------------------------------ */
/* Script trust                                                         */
/* ------------------------------------------------------------------ */

const TRUST_KEY = 'apparatus.trustedScripts';

function trustedHashes(): Set<string> {
    try {
        return new Set(JSON.parse(localStorage.getItem(TRUST_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function isTrusted(source: string): boolean {
    const h = hashString(source);
    return BUILTIN_SCRIPTS.has(h) || trustedHashes().has(h);
}

function trust(source: string): void {
    try {
        const set = trustedHashes();
        set.add(hashString(source));
        localStorage.setItem(TRUST_KEY, JSON.stringify([...set].slice(-200)));
    } catch { /* storage unavailable — trust lasts for this session only */ }
}

/** Whether play should run the script's setup/step. */
function scriptRunnable(): boolean {
    const s = scriptState.get().kind;
    // An errored script stays off until it's run again from the editor.
    return !!scriptSource.get().trim() && (s === 'ready' || s === 'running');
}

function idleScriptState(): ScriptState {
    return scriptSource.get().trim() ? { kind: 'ready' } : { kind: 'off' };
}

/** Accepts the current (shared) script so it can run. */
export function trustScript(): void {
    trust(scriptSource.get());
    scriptState.set(idleScriptState());
}

/** Keeps a shared script in the editor but never runs it. */
export function ignoreScript(): void {
    scriptState.set({ kind: 'disabled' });
}

/* ------------------------------------------------------------------ */
/* Scene <-> state                                                      */
/* ------------------------------------------------------------------ */

export function snapshot(): SceneConfig {
    return normalizeScene({
        v: 1,
        name: sceneName.get(),
        seed: seed.get(),
        gravity: { x: gravityX.get(), y: gravityY.get() },
        grid: gridSize.get(),
        snap: snap.get(),
        parts: buildSnapshot ? buildSnapshot.parts : partsOf(ecs),
        // An untouched template in the editor isn't part of the scene.
        script: scriptSource.get() === SCRIPT_EXAMPLES[0].source ? '' : scriptSource.get(),
    });
}

function setParts(parts: PartDef[]): Entity[] {
    ecs.clear();
    spawnedEntities.clear();
    return parts.map((p) => addPart(ecs, p));
}

export async function loadScene(cfg: SceneConfig, opts: { untrusted?: boolean; fit?: boolean } = {}): Promise<void> {
    if (mode.get() === 'play') stop();

    sceneName.set(cfg.name);
    seed.set(cfg.seed);
    gravityX.set(cfg.gravity.x);
    gravityY.set(cfg.gravity.y);
    gridSize.set(cfg.grid);
    snap.set(cfg.snap);
    selected.set(null);
    setParts(cfg.parts);

    scriptSource.set(cfg.script);
    if (!cfg.script.trim()) scriptState.set({ kind: 'off' });
    else if (opts.untrusted && !isTrusted(cfg.script)) scriptState.set({ kind: 'pending' });
    else scriptState.set({ kind: 'ready' });

    markDirty();
    if (opts.fit !== false) fitView();

    // A scene whose board comes from its own build() (e.g. plinko) builds on load.
    if (scriptState.get().kind === 'ready' && !cfg.parts.length && exportsHook(cfg.script, 'build')) {
        await runBuild(cfg.script, { quiet: true });
        fitView();
    }
}

export function loadPreset(id: string): void {
    const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
    void loadScene(preset.make());
}

/* ------------------------------------------------------------------ */
/* Edits                                                                */
/* ------------------------------------------------------------------ */

let urlTimer = 0;

/** Call after any change to the scene; refreshes the UI and (soon) the URL. */
export function markDirty(): void {
    revision.set(revision.get() + 1);
    partCount.set(partEntities(ecs).length);
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => void writeUrl(), 400);
}

/** Where a new part goes: the middle of the view, snapped. */
function spawnPoint(): { x: number; y: number } {
    return { x: camera.x, y: camera.y };
}

export function addNewPart(shape: PartShape, fixed = false): void {
    if (mode.get() === 'play') stop();
    const g = gridSize.get();
    const at = spawnPoint();
    const part: PartDef = shape === 'box'
        ? { shape, x: at.x, y: at.y, w: g * 2, h: g, fixed }
        : { shape, x: at.x, y: at.y, r: g / 2, fixed };
    part.color = fixed ? undefined : PALETTE[(partCount.get() + 1) % PALETTE.length];
    const e = addPart(ecs, part);
    if (snap.get()) snapEntity(e);
    selected.set(e);
    markDirty();
}

export function snapEntity(e: Entity): void {
    const t = ecs.getComponent(e, Transform);
    const s = ecs.getComponent(e, Shape);
    if (!t || !s) return;
    const p = snapPosition(s, t.angle, t.x, t.y, gridSize.get());
    t.x = p.x;
    t.y = p.y;
}

export function moveEntity(e: Entity, x: number, y: number): void {
    const t = ecs.getComponent(e, Transform);
    if (!t) return;
    t.x = x;
    t.y = y;
    if (snap.get()) snapEntity(e);
    // Moving a generated part by hand makes it yours: build() won't replace it.
    const meta = ecs.getComponent(e, Meta);
    if (meta) meta.gen = false;
    markDirty();
}

export function deleteSelected(): void {
    const e = selected.get();
    if (e === null || mode.get() === 'play') return;
    ecs.destroyEntity(e);
    selected.set(null);
    markDirty();
}

export function duplicateSelected(): void {
    const e = selected.get();
    if (e === null || mode.get() === 'play') return;
    const part = partOf(ecs, e);
    if (!part) return;
    const g = gridSize.get();
    const copy = addPart(ecs, { ...part, x: part.x + g, y: part.y - g, gen: false });
    if (snap.get()) snapEntity(copy);
    selected.set(copy);
    markDirty();
}

export function rotateSelected(degrees: number): void {
    const e = selected.get();
    if (e === null || mode.get() === 'play') return;
    const t = ecs.getComponent(e, Transform);
    if (!t) return;
    const step = (Math.PI / 180) * degrees;
    t.angle = Math.round((t.angle + step) / step) * step;
    if (Math.abs(t.angle) >= Math.PI * 2 - 1e-6) t.angle = 0;
    markDirty();
}

export function toggleSelectedFixed(): void {
    const e = selected.get();
    const b = e === null ? undefined : ecs.getComponent(e, Body);
    if (!b || mode.get() === 'play') return;
    b.fixed = !b.fixed;
    markDirty();
}

/** Removes every part (keeps the script and settings). */
export function clearParts(): void {
    if (mode.get() === 'play') stop();
    setParts([]);
    selected.set(null);
    markDirty();
}

export function removeGenerated(): void {
    if (mode.get() === 'play') stop();
    for (const e of partEntities(ecs)) {
        if (ecs.getComponent(e, Meta)?.gen) ecs.destroyEntity(e);
    }
    if (selected.get() !== null && !ecs.hasComponent(selected.get()!, Transform)) selected.set(null);
    markDirty();
}

/* ------------------------------------------------------------------ */
/* Play / stop                                                          */
/* ------------------------------------------------------------------ */

export function play(): void {
    if (mode.get() === 'play') return;

    const entities = partEntities(ecs);
    const parts = entities.map((e) => partOf(ecs, e)!);
    buildSnapshot = { parts, selectedIndex: entities.indexOf(selected.get() ?? -1) };

    const script = scriptRunnable() ? scriptSource.get() : null;
    physics.play({
        bodies: entities.map((id, i) => ({ id, part: parts[i] })),
        gravity: { x: gravityX.get(), y: gravityY.get() },
        timeScale: timeScale.get(),
        paused: paused.get(),
        seed: seed.get(),
        grid: gridSize.get(),
        script,
    });

    mode.set('play');
    if (script && (exportsHook(script, 'step') || exportsHook(script, 'setup'))) scriptState.set({ kind: 'running' });
    simTime.set('0.0');
}

export function stop(): void {
    if (mode.get() !== 'play') return;
    physics.stop();

    const snap = buildSnapshot;
    buildSnapshot = null;
    if (snap) {
        const entities = setParts(snap.parts);
        selected.set(snap.selectedIndex >= 0 ? entities[snap.selectedIndex] ?? null : null);
    }

    mode.set('build');
    if (scriptState.get().kind === 'running') scriptState.set(idleScriptState());
    markDirty();
}

export function togglePlay(): void {
    if (mode.get() === 'play') stop();
    else play();
}

export function togglePause(): void {
    paused.set(!paused.get());
}

/** Advances one physics step (starts play paused if building). */
export function stepOnce(): void {
    if (mode.get() === 'build') {
        paused.set(true);
        play();
    }
    physics.step();
}

paused.subscribe((p) => physics?.pause(p));

const sendParams = () => physics?.setParams({ x: gravityX.get(), y: gravityY.get() }, timeScale.get());
gravityX.subscribe(sendParams);
gravityY.subscribe(sendParams);
timeScale.subscribe(sendParams);

for (const s of [gravityX, gravityY, gridSize, snap, sceneName, seed] as Signal<any>[]) {
    s.subscribe(() => {
        if (physics) markDirty();
    });
}

export function setPointer(p: PointerMsg): void {
    if (mode.get() === 'play') physics.setPointer(p);
}

function applyFrame(f: FrameInfo): void {
    if (mode.get() !== 'play') return;

    for (const s of f.spawned) {
        spawnedEntities.set(s.id, addPart(ecs, s.part, { spawned: true }));
    }

    for (const id of f.removed) {
        const e = spawnedEntities.get(id) ?? id;
        spawnedEntities.delete(id);
        ecs.destroyEntity(e);
        if (selected.get() === e) selected.set(null);
    }

    const d = f.data;
    for (let i = 0; i < d.length; i += 4) {
        const id = d[i];
        const e = spawnedEntities.get(id) ?? id;
        const t = ecs.getComponent(e, Transform);
        if (t) {
            t.x = d[i + 1];
            t.y = d[i + 2];
            t.angle = d[i + 3];
        }
    }

    if (f.spawned.length || f.removed.length) partCount.set(partEntities(ecs).length);
    simTime.set(f.time.toFixed(1));

    if (f.scriptError) {
        scriptState.set({ kind: 'error', message: f.scriptError });
        toast(f.scriptError.split('\n')[0], true);
    }
}

/* ------------------------------------------------------------------ */
/* Scripts                                                              */
/* ------------------------------------------------------------------ */

let building = false;

/**
 * Runs the script's build() in the worker: its parts replace the previous
 * generated ones; hand-placed parts stay. Running a script also trusts it.
 */
export async function runBuild(source = scriptSource.get(), opts: { quiet?: boolean } = {}): Promise<boolean> {
    if (building) return false;
    if (mode.get() === 'play') stop();
    if (source !== scriptSource.get()) scriptSource.set(source);
    if (!source.trim()) return false;

    trust(source);
    building = true;
    try {
        const hand = partsOf(ecs).filter((p) => !p.gen);
        const res = await physics.build(source, hand, gridSize.get(), seed.get());

        if (res.error) {
            scriptState.set({ kind: 'error', message: `build() failed:\n${res.error}` });
            if (!opts.quiet) toast('build() failed — see the script editor', true);
            return false;
        }

        const keep = partsOf(ecs).filter((p) => !p.gen);
        const sel = selected.get();
        const selIndex = sel === null ? -1 : partEntities(ecs).indexOf(sel);
        const entities = setParts([...keep, ...(res.parts ?? [])]);
        selected.set(selIndex >= 0 && selIndex < keep.length ? entities[selIndex] : null);

        scriptState.set({ kind: 'ready' });
        markDirty();
        if (!opts.quiet) {
            toast(exportsHook(source, 'build')
                ? `build(): ${res.parts?.length ?? 0} parts`
                : 'script saved — no build(), it runs on play');
        }
        return true;
    } finally {
        building = false;
    }
}

/** Saves the editor's script as the scene's and trusts it, without building. */
export function applyScript(source = scriptSource.get()): void {
    scriptSource.set(source);
    trust(source);
    scriptState.set(idleScriptState());
    markDirty();
}

export function clearScript(): void {
    if (mode.get() === 'play') stop();
    scriptSource.set('');
    scriptState.set({ kind: 'off' });
    markDirty();
}

/* ------------------------------------------------------------------ */
/* View                                                                 */
/* ------------------------------------------------------------------ */

/** Screen edges covered by UI (the dock, the action bar); set by main.tsx. */
export let viewInsets: () => { l: number; r: number; t: number; b: number } = () => ({ l: 0, r: 0, t: 0, b: 0 });
export function setViewInsets(fn: typeof viewInsets): void {
    viewInsets = fn;
}

/** Frames every part; an empty scene centers on the origin. */
export function fitView(): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const huge = 24 * gridSize.get();
    for (const [e, t, s] of ecs.query(Transform, Shape)) {
        const b = boundsOf(t, s);
        minY = Math.min(minY, b.minY);
        maxY = Math.max(maxY, b.maxY);
        // A long fixed floor or wall shouldn't zoom the interesting parts down to specks:
        // it only counts vertically.
        if (ecs.getComponent(e, Body)?.fixed && b.maxX - b.minX > huge) continue;
        minX = Math.min(minX, b.minX);
        maxX = Math.max(maxX, b.maxX);
    }
    if (!Number.isFinite(minX) && Number.isFinite(minY)) {
        minX = -huge / 2;
        maxX = huge / 2;
    }
    if (!Number.isFinite(minX)) {
        camera.x = 0;
        camera.y = 0;
        camera.zoom = 1;
        return;
    }
    camera.fit(minX, minY, maxX, maxY, viewInsets());
}

/* ------------------------------------------------------------------ */
/* Sharing                                                              */
/* ------------------------------------------------------------------ */

async function writeUrl(): Promise<void> {
    if (mode.get() === 'play') return;
    try {
        const encoded = await encodeScene(snapshot());
        const url = new URL(location.href);
        url.search = '';
        url.searchParams.set('s', encoded);
        history.replaceState(null, '', url);
    } catch (err) {
        log('could not write the URL', err);
    }
}

export async function shareLink(): Promise<void> {
    await writeUrl();
    try {
        await navigator.clipboard.writeText(location.href);
        toast('link copied');
    } catch {
        toast('copy failed — the link is in the address bar', true);
    }
}

export function exportJson(): void {
    const cfg = snapshot();
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cfg.name || 'scene'}.apparatus.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importJson(file: File): Promise<void> {
    try {
        const cfg = normalizeScene(JSON.parse(await file.text()));
        await loadScene(cfg, { untrusted: true });
        toast(`loaded ${cfg.name || file.name}`);
    } catch (err) {
        toast(`import failed: ${(err as Error).message}`, true);
    }
}

export function pickAndImportJson(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => input.files?.[0] && void importJson(input.files[0]);
    input.click();
}

export function newSeed(): void {
    seed.set(randomSeed());
    if (exportsHook(scriptSource.get(), 'build') && scriptRunnable()) void runBuild(scriptSource.get(), { quiet: true });
}

async function sceneFromUrl(): Promise<{ cfg: SceneConfig; untrusted: boolean }> {
    const params = new URLSearchParams(location.search);
    const s = params.get('s');
    if (s) {
        try {
            return { cfg: await decodeScene(s), untrusted: true };
        } catch (err) {
            toast('That link is damaged — loaded the default scene instead.', true);
            log('bad scene link', err);
        }
    }
    const preset = params.get('preset');
    const found = PRESETS.find((p) => p.id === preset);
    return { cfg: found ? found.make() : defaultScene(), untrusted: false };
}

/* ------------------------------------------------------------------ */
/* Boot + main loop                                                     */
/* ------------------------------------------------------------------ */

let fpsFrames = 0;
let fpsTime = 0;

/** Called once per rendered frame by main.tsx. */
export function frameTick(dt: number): void {
    fpsFrames++;
    fpsTime += dt;
    if (fpsTime >= 0.5) {
        fps.set(Math.round(fpsFrames / fpsTime));
        simRate.set(mode.get() !== 'play' ? 'building' : paused.get() ? 'paused' : `${physics.stepsPerSecond}/s (${physics.stepMs.toFixed(1)} ms)`);
        fpsFrames = 0;
        fpsTime = 0;
    }

    if (physics.hung) {
        restartPhysics(`Physics stopped responding for ${HANG_MS / 1000}s (probably a script stuck in a loop) — it was restarted and the script turned off.`);
    }
}

export async function boot(): Promise<void> {
    createPhysics();
    const { cfg, untrusted } = await sceneFromUrl();
    await physics.ready;
    await loadScene(cfg, { untrusted });
}
