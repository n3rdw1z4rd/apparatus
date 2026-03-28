import { C } from "../components";
import type { Shape } from "../components/shape";
import type { Transform } from "../components/transform";
import { ECS } from "../lib/ecs";
import { GRID_CELL_SIZE } from "../grid";
import type { CanvasRenderer } from "../lib/canvas-renderer";

export function renderSystem(ecs: ECS, renderer: CanvasRenderer) {
    const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

    for (const e of entities) {
        const transform = ecs.getComponent<Transform>(e, C.Transform);
        const shape = ecs.getComponent<Shape>(e, C.Shape);

        if (transform && shape) {
            renderer.context.save();
            renderer.context.translate(transform.x, transform.y);
            renderer.context.rotate(transform.rotation);

            renderer.drawRect(0, 0, shape.width, shape.height, {
                filled: true,
                fillColor: shape.color,
            });

            renderer.drawText(
                GRID_CELL_SIZE, -GRID_CELL_SIZE,
                `[${e}] ${transform.x.toFixed(2)}, ${transform.y.toFixed(2)} | ${shape.width.toFixed(2)}, ${shape.height.toFixed(2)} | ${transform.rotation.toFixed(2)}`
            );

            renderer.context.restore();
        }
    }
}
