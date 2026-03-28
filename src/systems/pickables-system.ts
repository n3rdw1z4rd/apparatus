import type { Shape } from "../components/shape";
import type { Transform } from "../components/transform";
import type { ECS } from "../lib/ecs";
import type { CanvasRenderer } from "../lib/canvas-renderer";
import { C } from "../components";

export function buildPickablesSystem(ecs: ECS, renderer: CanvasRenderer) {
    renderer.clearPickables();

    const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

    for (const entity of entities) {
        const transform = ecs.getComponent<Transform>(entity, C.Transform);
        const shape = ecs.getComponent<Shape>(entity, C.Shape);

        if (transform && shape) {
            renderer.registerPickable({ entity, transform, shape });
        }
    }
}
