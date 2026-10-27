import { clamp } from '@n3rdw1z4rd/core';
import { Signal } from '@n3rdw1z4rd/smoke-ui';

/* ------------------------------------------------------------------ */
/* Layout state for the dockable panel — persisted per browser.         */
/* ------------------------------------------------------------------ */

export type DockEdge = 'left' | 'right' | 'top' | 'bottom';

const STORAGE_KEY = 'apparatus.ui';

interface StoredUi {
    edge?: DockEdge;
    open?: boolean;
    tab?: string;
    sheet?: number;
}

function load(): StoredUi {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

/** Phones and other narrow / touch-first screens start with a bottom sheet. */
export function isCompact(): boolean {
    return matchMedia('(max-width: 720px), (pointer: coarse) and (max-width: 1024px)').matches;
}

/** Bottom sheet on portrait phones; a side panel everywhere else (incl. landscape phones). */
function defaultEdge(): DockEdge {
    return isCompact() && innerHeight > innerWidth ? 'bottom' : 'right';
}

const stored = load();
const EDGES: DockEdge[] = ['left', 'right', 'top', 'bottom'];

export const dockEdge = new Signal<DockEdge>(EDGES.includes(stored.edge!) ? stored.edge! : defaultEdge());
export const dockOpen = new Signal<boolean>(stored.open ?? !isCompact());
export const activeTab = new Signal<string>(stored.tab ?? 'scene');
/** Height of a bottom sheet as a fraction of the screen (set by dragging its grip). */
export const sheetFraction = new Signal<number>(
    typeof stored.sheet === 'number' ? clamp(stored.sheet, 0.2, 0.85) : 0.5,
);
/** Hides the dock and stats; the action bar shrinks to a single "show UI" button. */
export const uiHidden = new Signal(false);

function save(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ edge: dockEdge.get(), open: dockOpen.get(), tab: activeTab.get(), sheet: sheetFraction.get() }));
    } catch { /* storage unavailable — fine */ }
}

dockEdge.subscribe(save);
dockOpen.subscribe(save);
activeTab.subscribe(save);
sheetFraction.subscribe(save);

export function toggleDock(): void {
    dockOpen.set(!dockOpen.get());
}

export function toggleUi(): void {
    uiHidden.set(!uiHidden.get());
}

/** Opens the panel on a tab (e.g. long-press a part → its inspector). */
export function showTab(id: string): void {
    activeTab.set(id);
    dockOpen.set(true);
    uiHidden.set(false);
}
