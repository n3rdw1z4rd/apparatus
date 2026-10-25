import { computed } from '@n3rdw1z4rd/smoke-ui';
import { setTheme } from '@n3rdw1z4rd/smoke-ui-components';
import * as store from './app/store';
import {
    addNewPart, boot, camera, deleteSelected, duplicateSelected, editorOpen, fitView, fps, frameTick, gizmoEdited,
    gizmoMode, gridSize, hovered, mode, partCount, paused, rotateSelected, sceneName, scriptState, selected, showGrid,
    showLabels, simRate, simTime, stepOnce, stop, togglePause, togglePlay, trustScript, ignoreScript, viewMode, world,
} from './app/store';
import './app/inspector';
import { dockEdge, dockOpen, toggleDock, toggleUi, uiHidden } from './app/ui-state';
import { attachStageInput } from './input/stage-input';
import { Renderer } from './render/renderer';
import { ActionBar } from './ui/action-bar';
import { Dock } from './ui/dock';
import { ScriptEditor } from './ui/script-editor';

setTheme({
    bg: 'rgba(17, 17, 17, 0.82)',
    bgElevated: '#1d1d1d',
    fg: '#d3d3d3',
    fgMuted: '#808080',
    accent: '#3fd1a4',
    border: '#3a3a3a',
    fontSizeMd: '12px',
});

const Stats = () => (
    <div className="stats">
        <span className={computed(() => `mode mode-${mode.get()}`)}>{computed(() => (mode.get() === 'play' ? (paused.get() ? 'paused' : 'playing') : 'building'))}</span>
        {' · '}<span>{sceneName}</span>
        {' · '}<span>{partCount}</span> parts
        {' · '}<span>{fps}</span> fps
        {' · '}physics <span>{simRate}</span>
        {' · '}t <span>{simTime}</span>s
    </div>
);

/** Shown when a shared link/file carries a script the user hasn't reviewed. */
const ScriptBanner = () => (
    <div className="banner" style={{ display: computed(() => (scriptState.get().kind === 'pending' ? '' : 'none')) }}>
        <span>This shared scene includes a <b>script</b>. Scripts run as code in this page — review it first.</span>
        <span className="banner-actions">
            <button className="btn" onClick={() => editorOpen.set(true)}>review</button>
            <button className="btn primary" onClick={trustScript}>trust</button>
            <button className="btn" onClick={ignoreScript}>ignore</button>
        </span>
    </div>
);

/*
 * Layout: the canvas fills the screen and the dock floats over it; `data-*`
 * attributes on the shell drive all of the docking CSS.
 */
const stage = (
    <main className="stage">
        <Stats />
        <ScriptBanner />
        <ActionBar />
        <ScriptEditor />
    </main>
) as HTMLElement;

const app = (
    <div
        className="app"
        data-edge={dockEdge}
        data-open={computed(() => String(dockOpen.get()))}
        data-ui-hidden={computed(() => String(uiHidden.get()))}
        data-mode={mode}
    >
        {stage}
        <Dock />
    </div>
) as HTMLElement;

document.getElementById('root')!.append(app);

/* ------------------------------------------------------------------ */
/* Renderer + input + main loop                                         */
/* ------------------------------------------------------------------ */

const renderer = new Renderer(stage, camera, world);
renderer.onGizmoChange = gizmoEdited;

// What the dock and action bar cover, so "fit view" frames the scene in the space that's left.
store.setViewInsets(() => {
    const insets = { l: 0, r: 0, t: 0, b: 0 };
    const canvas = renderer.canvas.getBoundingClientRect();
    const bar = app.querySelector('.action-bar')?.getBoundingClientRect();
    if (bar) insets.b = Math.max(0, canvas.bottom - bar.top);
    if (dockOpen.get() && !uiHidden.get()) {
        const dock = app.querySelector('.dock')!.getBoundingClientRect();
        switch (dockEdge.get()) {
            case 'left': insets.l = Math.max(0, dock.right - canvas.left); break;
            case 'right': insets.r = Math.max(0, canvas.right - dock.left); break;
            case 'top': insets.t = Math.max(0, dock.bottom - canvas.top); break;
            case 'bottom': insets.b = Math.max(insets.b, canvas.bottom - dock.top); break;
        }
    }
    return insets;
});
const input = attachStageInput(renderer.canvas, { gizmoActive: () => renderer.gizmoActive });

renderer.start((dt) => {
    input.update();
    frameTick(dt);
    renderer.draw({
        grid: gridSize.get(),
        showGrid: showGrid.get(),
        showLabels: showLabels.get(),
        selected: selected.get(),
        hovered,
        building: mode.get() === 'build',
        gizmo: gizmoMode.get(),
        flat: viewMode.get() === '2d',
    });
});

/* ------------------------------------------------------------------ */
/* Keyboard shortcuts                                                   */
/* ------------------------------------------------------------------ */

function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest('.cm-editor'));
}

window.addEventListener('keydown', (ev) => {
    if (isTyping(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (document.querySelector('dialog[open]')) return;

    switch (ev.key) {
        case ' ': togglePlay(); break;
        case 'Escape':
            if (mode.get() === 'play') stop();
            else selected.set(null);
            break;
        case 'p': if (mode.get() === 'play') togglePause(); break;
        case '.': stepOnce(); break;
        case 'b': addNewPart('box'); break;
        case 'o': addNewPart('ball'); break;
        case 'w': addNewPart('box', true); break;
        case 'd': duplicateSelected(); break;
        case 'Delete':
        case 'Backspace': deleteSelected(); break;
        case '[': rotateSelected(-15); break;
        case ']': rotateSelected(15); break;
        case 'f': fitView(); break;
        case 'g': gizmoMode.set(gizmoMode.get() === 'translate' ? 'off' : 'translate'); break;
        case 'r': gizmoMode.set(gizmoMode.get() === 'rotate' ? 'off' : 'rotate'); break;
        case 'v': viewMode.set(viewMode.get() === '2d' ? '3d' : '2d'); break;
        case 'e': editorOpen.set(true); break;
        case 'Tab': toggleDock(); break;
        case 'h': toggleUi(); break;
        default: return;
    }

    // Keep Space from also "clicking" whatever button has focus.
    (document.activeElement as HTMLElement | null)?.blur?.();
    ev.preventDefault();
});

void boot();

// Console access for live tinkering: `apparatus.store.addNewPart('ball')`, `apparatus.world`, …
(window as any).apparatus = {
    store,
    world,
    camera,
    renderer,
    get physics() { return store.physics; },
};
