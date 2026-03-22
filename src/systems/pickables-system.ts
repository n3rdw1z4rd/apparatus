import type { RenderRect } from "../components/render-rect";
import type { Transform } from "../components/transform";
import type { ECS } from "../ecs";
import type { CanvasRenderer } from "../lib/canvas-renderer";

export function buildPickablesSystem(ecs: ECS, renderer: CanvasRenderer) {
    renderer.clearPickables();

    const entities = ecs.getEntitiesWith("Transform", "RenderRect");

    for (const e of entities) {
        const t = ecs.getComponent<Transform>(e, "Transform");
        const r = ecs.getComponent<RenderRect>(e, "RenderRect");

        if (t && r) {
            renderer.registerPickable({
                entity: e,
                x: t.x,
                y: t.y,
                width: r.width,
                height: r.height,
                rotation: t.rotation,
            });
        }
    }
}
