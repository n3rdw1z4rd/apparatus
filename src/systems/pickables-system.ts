import type { Shape } from "../components/shape";
import type { Transform } from "../components/transform";
import type { ECS } from "../lib/ecs";
import type { CanvasRenderer } from "../lib/canvas-renderer";
import { C } from "../components";

export function buildPickablesSystem(ecs: ECS, renderer: CanvasRenderer) {
    renderer.clearPickables();

    const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

    for (const e of entities) {
        const transform = ecs.getComponent<Transform>(e, C.Transform);
        const shape = ecs.getComponent<Shape>(e, C.Shape);

        if (transform && shape) {
            renderer.registerPickable({
                entity: e,
                x: transform.x,
                y: transform.y,
                width: shape.width,
                height: shape.height,
                rotation: transform.rotation,
            });
        }
    }
}
