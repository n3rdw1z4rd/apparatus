import { computed, Signal } from '@n3rdw1z4rd/smoke-ui';
import {
    addNewPart, clearParts, deleteSelected, duplicateSelected, editorOpen, exportJson, fitView, gravityX, gravityY,
    gridSize, loadPreset, mode, partCount, paused, pickAndImportJson, removeGenerated, rotateSelected, runBuild,
    sceneName, scriptSource, scriptState, shareLink, showGrid, showLabels, snap, stepOnce, timeScale, togglePause,
    togglePlay, trustScript, ignoreScript, newSeed, gizmoMode, viewMode, addEmptyEntity, world,
} from './store';
import {
    addComponentButtons, componentGroup, editable, hasSelection, selAngle, selGenerated, selLabel, selName, selX, selY,
} from './inspector';
import { DockEdge, dockEdge, showTab, toggleUi } from './ui-state';
import { PRESETS } from '../core/scene';
import { exportsHook } from '../core/script';

/* ------------------------------------------------------------------ */
/* The control panel described as data.                                 */
/*                                                                      */
/* Nothing here touches the DOM: src/ui/controls-dom renders it today,  */
/* and another renderer (e.g. a VR panel) can render the same           */
/* description later. All state flows through signals, so every         */
/* renderer stays in sync for free.                                     */
/* ------------------------------------------------------------------ */

type Text = string | Signal<string>;

interface Base {
    /** Hidden while this is false. */
    visible?: Signal<boolean>;
}

export interface SliderControl extends Base {
    kind: 'slider';
    label: string;
    signal: Signal<number>;
    min: number;
    max: number;
    step: number;
}

export interface NumberControl extends Base {
    kind: 'number';
    label: string;
    signal: Signal<number>;
    step?: number;
    min?: number;
    max?: number;
}

export interface ToggleControl extends Base {
    kind: 'toggle';
    label: string;
    signal: Signal<boolean>;
}

export interface ColorControl extends Base {
    kind: 'color';
    label: string;
    signal: Signal<string>;
}

export interface InputControl extends Base {
    kind: 'input';
    label: string;
    signal: Signal<string>;
    placeholder?: string;
}

export interface ChoiceControl<T = any> extends Base {
    kind: 'choice';
    label?: string;
    options: { value: T; label: string }[];
    value: Signal<T>;
    /** Defaults to `value.set`. */
    select?: (value: T) => void;
}

export interface ButtonControl extends Base {
    kind: 'button';
    label: Text;
    title?: string;
    primary?: boolean;
    action: () => void;
}

export interface TextControl extends Base {
    kind: 'text';
    text: Text;
    /** Styling hint, e.g. a status class. */
    tone?: Signal<string>;
}

/** Widgets too specific for a generic control; each renderer supplies its own by id. */
export interface CustomControl extends Base {
    kind: 'custom';
    id: 'seed' | 'hierarchy';
}

/** Lays its children out on one line (wrapping if needed). */
export interface RowControl extends Base {
    kind: 'row';
    controls: Control[];
}

export type Control =
    | SliderControl | NumberControl | ToggleControl | ColorControl | InputControl | ChoiceControl
    | ButtonControl | TextControl | CustomControl | RowControl;

export interface Section {
    id: string;
    title: string;
    controls: Control[];
}

const when = (fn: () => boolean) => computed(fn);
const building = when(() => mode.get() === 'build');

const scriptStatus = computed(() => {
    const s = scriptState.get();
    switch (s.kind) {
        case 'running': return '● script running';
        case 'ready': return '○ script ready';
        case 'pending': return '⚠ shared script — review it';
        case 'disabled': return '■ script ignored';
        case 'error': return '✖ script error';
        default: return '— no script';
    }
});

const hasBuild = when(() => exportsHook(scriptSource.get(), 'build'));

export const SECTIONS: Section[] = [
    {
        id: 'scene',
        title: 'scene',
        controls: [
            {
                kind: 'row',
                controls: [
                    {
                        kind: 'choice',
                        options: [{ value: 'build', label: 'build' }, { value: 'play', label: 'play' }],
                        value: mode,
                        select: (m) => m !== mode.get() && togglePlay(),
                    },
                    { kind: 'button', label: computed(() => (paused.get() ? '▶ resume' : '❚❚ pause')), title: 'pause / resume (p)', action: togglePause, visible: when(() => mode.get() === 'play') },
                    { kind: 'button', label: 'step', title: 'one physics step (.)', action: stepOnce },
                ],
            },
            { kind: 'input', label: 'name', signal: sceneName, placeholder: 'untitled' },
            {
                kind: 'row',
                controls: [
                    { kind: 'custom', id: 'seed' },
                    { kind: 'button', label: '🎲', title: 'new seed (re-runs build())', action: newSeed },
                ],
            },
            { kind: 'text', text: 'presets', tone: new Signal('heading') },
            {
                kind: 'row',
                controls: PRESETS.map((p) => ({ kind: 'button' as const, label: p.label, action: () => loadPreset(p.id) })),
            },
            {
                kind: 'row',
                controls: [
                    { kind: 'button', label: 'fit view', title: 'frame the scene (f)', action: fitView },
                    { kind: 'button', label: 'clear parts', title: 'remove every part', action: clearParts },
                ],
            },
        ],
    },
    {
        id: 'parts',
        title: 'parts',
        controls: [
            { kind: 'text', text: 'add', tone: new Signal('heading') },
            {
                kind: 'row',
                controls: [
                    { kind: 'button', label: '▭ box', title: 'add a box (b)', action: () => addNewPart('box') },
                    { kind: 'button', label: '● ball', title: 'add a ball (o)', action: () => addNewPart('ball') },
                    { kind: 'button', label: '▭ wall', title: 'add a fixed box (w)', action: () => addNewPart('box', true) },
                    { kind: 'button', label: '• peg', title: 'add a fixed ball', action: () => addNewPart('ball', true) },
                ],
            },
            { kind: 'text', text: computed(() => `${partCount.get()} parts`), tone: new Signal('muted') },
            { kind: 'text', text: 'selected', tone: new Signal('heading'), visible: editable },
            {
                kind: 'row',
                visible: editable,
                controls: [
                    { kind: 'button', label: '⟲ 15°', title: 'rotate left ([)', action: () => rotateSelected(-15) },
                    { kind: 'button', label: '⟳ 15°', title: 'rotate right (])', action: () => rotateSelected(15) },
                    { kind: 'button', label: 'duplicate', title: 'duplicate (d)', action: duplicateSelected },
                    { kind: 'button', label: 'delete', title: 'delete (del)', action: deleteSelected },
                ],
            },
            { kind: 'button', label: 'edit selected part →', action: () => showTab('inspect'), visible: editable },
        ],
    },
    {
        id: 'tree',
        title: 'tree',
        controls: [
            {
                kind: 'row',
                controls: [
                    { kind: 'button', label: '+ entity', title: 'add an empty entity', action: addEmptyEntity },
                    { kind: 'button', label: 'inspect →', action: () => showTab('inspect'), visible: hasSelection },
                ],
            },
            { kind: 'custom', id: 'hierarchy' },
        ],
    },
    {
        id: 'inspect',
        title: 'inspect',
        controls: [
            { kind: 'text', text: 'nothing selected — tap a part', tone: new Signal('muted'), visible: when(() => !hasSelection.get()) },
            { kind: 'text', text: 'stop to edit parts', tone: new Signal('muted'), visible: when(() => hasSelection.get() && mode.get() === 'play') },
            {
                kind: 'text',
                text: computed(() => `${selLabel.get()}${selGenerated.get() ? ' · generated by build()' : ''}`),
                tone: new Signal('heading'),
                visible: editable,
            },
            { kind: 'input', label: 'name', signal: selName, placeholder: 'entity name', visible: editable },
            {
                kind: 'row',
                visible: editable,
                controls: [
                    { kind: 'number', label: 'x', signal: selX, step: 1 },
                    { kind: 'number', label: 'y', signal: selY, step: 1 },
                ],
            },
            { kind: 'slider', label: 'angle °', signal: selAngle, min: -180, max: 180, step: 1, visible: editable },
            // one group per registered component type, generated from its schema
            ...world.registry.all().flatMap(componentGroup),
            ...addComponentButtons(world.registry.all()),
        ],
    },
    {
        id: 'physics',
        title: 'physics',
        controls: [
            { kind: 'slider', label: 'gravity x', signal: gravityX, min: -30, max: 30, step: 0.01 },
            { kind: 'slider', label: 'gravity y', signal: gravityY, min: -30, max: 30, step: 0.01 },
            {
                kind: 'row',
                controls: [
                    { kind: 'button', label: 'earth', action: () => { gravityX.set(0); gravityY.set(9.81); } },
                    { kind: 'button', label: 'moon', action: () => { gravityX.set(0); gravityY.set(1.62); } },
                    { kind: 'button', label: 'zero-g', action: () => { gravityX.set(0); gravityY.set(0); } },
                    { kind: 'button', label: 'flip', action: () => { gravityX.set(-gravityX.get()); gravityY.set(-gravityY.get()); } },
                ],
            },
            { kind: 'slider', label: 'speed', signal: timeScale, min: 0.05, max: 3, step: 0.05 },
        ],
    },
    {
        id: 'view',
        title: 'view',
        controls: [
            {
                kind: 'choice',
                label: 'grid',
                options: [8, 16, 32, 64].map((g) => ({ value: g, label: String(g) })),
                value: gridSize,
            },
            {
                kind: 'choice',
                label: 'view',
                options: [{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }],
                value: viewMode,
            },
            {
                kind: 'choice',
                label: 'gizmo',
                options: [{ value: 'off', label: 'off' }, { value: 'translate', label: 'move' }, { value: 'rotate', label: 'rotate' }],
                value: gizmoMode,
            },
            { kind: 'toggle', label: 'snap', signal: snap },
            { kind: 'toggle', label: 'show grid', signal: showGrid },
            { kind: 'toggle', label: 'labels', signal: showLabels },
            { kind: 'button', label: 'fit view', title: 'frame the scene (f)', action: fitView },
        ],
    },
    {
        id: 'script',
        title: 'script',
        controls: [
            {
                kind: 'row',
                controls: [
                    { kind: 'text', text: scriptStatus, tone: computed(() => `status-${scriptState.get().kind}`) },
                    {
                        kind: 'button',
                        label: computed(() => (scriptState.get().kind === 'pending' ? 'review' : 'edit')),
                        title: 'open the script editor (e)',
                        action: () => editorOpen.set(true),
                    },
                ],
            },
            {
                kind: 'row',
                visible: when(() => scriptState.get().kind === 'pending'),
                controls: [
                    { kind: 'button', label: 'trust & enable', primary: true, action: trustScript },
                    { kind: 'button', label: 'ignore', action: ignoreScript },
                ],
            },
            {
                kind: 'row',
                visible: building,
                controls: [
                    { kind: 'button', label: '▶ run build', title: 'regenerate the parts made by build()', action: () => void runBuild(), visible: hasBuild },
                    { kind: 'button', label: 'remove generated', action: removeGenerated, visible: hasBuild },
                ],
            },
            {
                kind: 'text',
                text: 'build(scene) generates parts; setup(world) / step(world, dt) run during play. Open the editor for the API.',
                tone: new Signal('muted'),
            },
        ],
    },
    {
        id: 'share',
        title: 'share',
        controls: [
            {
                kind: 'row',
                controls: [
                    { kind: 'button', label: 'copy link', title: 'the whole scene — parts, settings, script — in one URL', action: () => void shareLink() },
                    { kind: 'button', label: 'export json', action: exportJson },
                    { kind: 'button', label: 'import json', action: pickAndImportJson },
                ],
            },
        ],
    },
    {
        id: 'layout',
        title: 'layout',
        controls: [
            {
                kind: 'choice',
                label: 'dock',
                options: (['left', 'right', 'top', 'bottom'] as DockEdge[]).map((e) => ({ value: e, label: e })),
                value: dockEdge,
            },
            { kind: 'button', label: 'hide UI', title: 'hide UI (h)', action: toggleUi },
            {
                kind: 'text',
                text: 'space play/stop · p pause · . step · b box · o ball · w wall · d duplicate · del delete · [ ] rotate · f fit · e script · tab panel · h hide UI · drag empty space to pan · scroll to zoom',
                tone: new Signal('shortcuts'),
            },
        ],
    },
];
