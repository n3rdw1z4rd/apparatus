import { clamp } from '@n3rdw1z4rd/core';
import { computed } from '@n3rdw1z4rd/smoke-ui';
import { SECTIONS } from '../app/controls';
import { activeTab, sheetFraction } from '../app/ui-state';
import { renderSection } from './controls-dom';

/**
 * Drag the bottom sheet's grip to make it taller or shorter.
 *
 * Touch uses touch events rather than pointer events: mobile browsers can
 * cancel a pointer drag midway (treating it as a page/toolbar gesture), while
 * touch events stay bound to the grip for the whole drag and can be
 * preventDefault()-ed. Mouse and pen use pointer events.
 */
function SheetGrip(): HTMLElement {
    const grip = <div className="dock-grip" role="separator" aria-orientation="horizontal" aria-label="resize panel" /> as HTMLElement;

    const app = () => grip.closest('.app') as HTMLElement;
    const resizeTo = (clientY: number) => {
        const rect = app().getBoundingClientRect();
        const fraction = (rect.bottom - clientY) / rect.height;
        sheetFraction.set(clamp(fraction, 0.2, 0.85));
    };

    // touch
    const onTouch = (ev: TouchEvent) => {
        ev.preventDefault();
        const t = ev.touches[0];
        if (ev.type === 'touchstart') app().classList.add('resizing');
        if (t && ev.type === 'touchmove') resizeTo(t.clientY);
    };
    const endTouch = () => app().classList.remove('resizing');
    grip.addEventListener('touchstart', onTouch, { passive: false });
    grip.addEventListener('touchmove', onTouch, { passive: false });
    grip.addEventListener('touchend', endTouch);
    grip.addEventListener('touchcancel', endTouch);

    // mouse / pen
    grip.addEventListener('pointerdown', (ev) => {
        if (ev.pointerType === 'touch') return;
        ev.preventDefault();
        app().classList.add('resizing');
        const move = (e: PointerEvent) => resizeTo(e.clientY);
        const up = () => {
            app().classList.remove('resizing');
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    });

    return grip;
}

/**
 * The control panel, dockable to any screen edge and shown/hidden entirely
 * from the action bar. Sections become tabs; every section is rendered once
 * and shown/hidden, so widgets (the matrix editor, inputs mid-edit) keep
 * their state when switching tabs.
 */
export function Dock(): HTMLElement {
    const bodies = new Map(SECTIONS.map((s) => [s.id, renderSection(s)]));

    activeTab.subscribe((id) => {
        if (!bodies.has(id)) return activeTab.set(SECTIONS[0].id);
        bodies.forEach((el, key) => (el.hidden = key !== id));
    });

    const dock = (
        <aside className="dock" aria-label="controls">
            <SheetGrip />
            <nav className="dock-tabs" role="tablist">
                {SECTIONS.map((s) => (
                    <button
                        className={computed(() => (activeTab.get() === s.id ? 'tab active' : 'tab'))}
                        role="tab"
                        aria-selected={computed(() => String(activeTab.get() === s.id))}
                        onClick={() => activeTab.set(s.id)}
                    >
                        {s.title}
                    </button>
                ))}
            </nav>
            <div className="dock-body">{[...bodies.values()]}</div>
        </aside>
    ) as HTMLElement;

    // On :root so the overlays (action bar, toasts…) can sit above the sheet too.
    sheetFraction.subscribe((f) => document.documentElement.style.setProperty('--sheet', String(f)));

    return dock;
}
