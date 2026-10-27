import { addPreviewer } from '@n3rdw1z4rd/smoke-ui-node-graph';

/* Footer and pin-tooltip previews for apparatus's values: scenes, entities, behaviours, cameras. */

export function registerPreviews(): void {
    addPreviewer((v, preview) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
        const o = v as Record<string, unknown>;
        if (o.kind === 'scene2d') return `scene · ${(o.entities as unknown[]).length} entities`;
        if (o.kind === 'behavior') return `behaviour · ${String(o.type).split('/').pop()}`;
        if ('deadzone' in o && 'view' in o) {
            const view = o.view ? ` · ${preview(o.view)}px tall` : '';
            return o.follow ? `camera · follows ${String(o.followName ?? o.follow)}${view}` : `camera @ ${preview(o.at)}${view}`;
        }
        if (typeof o.shape === 'string') {
            const n = Array.isArray(o.behaviors) ? o.behaviors.length : 0;
            const j = Array.isArray(o.joints) ? o.joints.length : 0;
            return `${o.shape} @ (${preview(o.x)}, ${preview(o.y)})`
                + (n ? ` · ${n} behaviour${n === 1 ? '' : 's'}` : '')
                + (j ? ` · ${j} joint${j === 1 ? '' : 's'}` : '');
        }
        return undefined;
    });
}
