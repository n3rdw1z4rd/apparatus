import type { Shape } from "../components/shape";
import type { Transform } from "../components/transform";
import type { ECS } from "../lib/ecs";
import type { CanvasRenderer } from "../lib/canvas-renderer";

export function buildPickablesSystem(ecs: ECS, renderer: CanvasRenderer) {
    renderer.clearPickables();

    const entities = ecs.getEntitiesWith("Transform", "RenderRect");

    for (const e of entities) {
        const t = ecs.getComponent<Transform>(e, "Transform");
        const r = ecs.getComponent<Shape>(e, "RenderRect");

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
