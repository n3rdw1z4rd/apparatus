import { Signal } from '@n3rdw1z4rd/smoke-ui';
import type { ThreeEntity } from '@n3rdw1z4rd/core/three';
import { Meta, RigidBody } from '../core/components';
import { labelOf } from '../app/inspector';
import { mode, selected, world } from '../app/store';
import { showTab } from '../app/ui-state';
import { treeRevision } from '../app/world-signals';

/* ------------------------------------------------------------------ */
/* The scene tree: every entity, nested by the three.js hierarchy.      */
/* Tap to select, double-tap to inspect. Rebuilt (at most once a frame) */
/* when entities come and go or are renamed; selection only toggles a  */
/* class.                                                               */
/* ------------------------------------------------------------------ */

/** rows past this are summarized, so a script spawning thousands doesn't bog the panel */
const MAX_ROWS = 500;

export function Hierarchy(): HTMLElement {
    const filter = new Signal('');
    const rows = new Map<string, HTMLElement>();
    const list = <div className="tree-list" role="tree" /> as HTMLElement;

    const markSelected = () => {
        const uuid = selected.get()?.uuid;
        for (const [id, row] of rows) {
            const on = id === uuid;
            row.classList.toggle('active', on);
            row.setAttribute('aria-selected', String(on));
        }
        if (uuid) rows.get(uuid)?.scrollIntoView({ block: 'nearest' });
    };

    const row = (e: ThreeEntity, depth: number): HTMLElement => {
        const meta = world.getComponent<Meta>(e, Meta);
        const body = world.getComponent<RigidBody>(e, RigidBody);
        const flags = [body?.fixed ? 'fixed' : '', meta?.gen ? 'gen' : '', meta?.spawned ? 'spawned' : '', body ? '' : 'no body']
            .filter(Boolean).join(' · ');
        const el = (
            <button
                className="tree-row"
                role="treeitem"
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                title={e.uuid}
                onClick={() => selected.set(e)}
                onDblClick={() => {
                    selected.set(e);
                    showTab('inspect');
                }}
            >
                <span className="tree-label">{labelOf(e)}</span>
                {flags ? <span className="tree-flags">{flags}</span> : ''}
            </button>
        ) as HTMLElement;
        rows.set(e.uuid, el);
        return el;
    };

    const rebuild = () => {
        rows.clear();
        const q = filter.get().trim().toLowerCase();
        const out: HTMLElement[] = [];
        let total = 0;

        const visit = (parent: ThreeEntity | undefined, depth: number) => {
            for (const e of world.childrenOf(parent)) {
                total++;
                const show = !q || labelOf(e).toLowerCase().includes(q) || e.uuid.startsWith(q);
                if (show && out.length < MAX_ROWS) out.push(row(e, q ? 0 : depth));
                visit(e, depth + 1);
            }
        };
        visit(undefined, 0);

        if (total === 0) out.push(<span className="ctl-text muted">no entities</span> as HTMLElement);
        else if (out.length === 0) out.push(<span className="ctl-text muted">nothing matches</span> as HTMLElement);
        else if (out.length >= MAX_ROWS) out.push(<span className="ctl-text muted">… first {MAX_ROWS} of {total} shown — filter to narrow</span> as HTMLElement);

        list.replaceChildren(...out);
        markSelected();
    };

    // coalesce bursts (a build() adding hundreds of parts, play spawning) into one rebuild a frame
    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            rebuild();
        });
    };

    treeRevision.subscribe(schedule);
    filter.subscribe(schedule);
    selected.subscribe(markSelected);
    // spawned bodies come and go every frame during play; refresh when play ends
    mode.subscribe(schedule);

    return (
        <div className="tree">
            <input
                className="text-input tree-filter"
                type="search"
                placeholder="filter by name, #tag or uuid"
                onInput={(ev: Event) => filter.set((ev.target as HTMLInputElement).value)}
            />
            {list}
        </div>
    ) as HTMLElement;
}
