import { Signal } from '@n3rdw1z4rd/smoke-ui';
import { world } from './store';

/* ------------------------------------------------------------------ */
/* The World reports changes through its own events (core stays UI-     */
/* agnostic); these turn them into smoke-ui signals for the panels.     */
/* ------------------------------------------------------------------ */

/** Bumped on any change to entities or their components (including transform drags). */
export const worldRevision = new Signal(0);

/**
 * Bumped when the tree's shape or labels change: entities added / removed / reparented,
 * components added / removed, or an entity's name edited.
 */
export const treeRevision = new Signal(0);

const bump = (s: Signal<number>) => s.set(s.get() + 1);

world.on('entityAdded', () => { bump(treeRevision); bump(worldRevision); });
world.on('entityRemoved', () => { bump(treeRevision); bump(worldRevision); });
world.on('reparented', () => { bump(treeRevision); bump(worldRevision); });
world.on('componentAdded', () => { bump(treeRevision); bump(worldRevision); });
world.on('componentRemoved', () => { bump(treeRevision); bump(worldRevision); });
world.on('changed', (_e, component, field) => {
    bump(worldRevision);
    if (field === 'name' || (component === 'Meta' && field === 'tag')) bump(treeRevision);
});
