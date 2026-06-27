import { C } from "../components";
import type { Shape } from "../components/shape";
import type { Transform } from "../components/transform";
import { ECS } from "../lib/ecs";
import type { CanvasRenderer } from "../lib/canvas-renderer";
import { GRID_CELL_SIZE } from "../grid";

function drawShape(renderer: CanvasRenderer, transform: Transform, shape: Shape) {
    switch (shape.type) {
        case 'rectangle':
            renderer.drawRect(0, 0, shape.width, shape.height, {
                filled: true,
                fillColor: shape.color,
            });

            break;
        case 'circle':
            renderer.drawCircle(0, 0, shape.radius, {
                filled: true,
                fillColor: shape.color,
            });

            break;

        default: break;
    }

    renderer.drawText(
        GRID_CELL_SIZE, -GRID_CELL_SIZE,
        `${transform.x.toFixed(2)}, ${transform.y.toFixed(2)}`,
    );

    renderer.drawText(
        GRID_CELL_SIZE, -GRID_CELL_SIZE + 14,
        `${transform.rotation.toFixed(2)}`,
    );

    renderer.drawText(
        GRID_CELL_SIZE, -GRID_CELL_SIZE + 28,
        shape.type === 'rectangle'
            ? `${shape.width.toFixed(2)}, ${shape.height.toFixed(2)}`
            : `${shape.radius.toFixed(2)}`,
    );
}

export function renderSystem(ecs: ECS, renderer: CanvasRenderer) {
    const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

    for (const e of entities) {
        const transform = ecs.getComponent<Transform>(e, C.Transform);
        const shape = ecs.getComponent<Shape>(e, C.Shape);

        if (transform && shape) {
            renderer.context.save();
            renderer.context.translate(transform.x, transform.y);
            renderer.context.rotate(transform.rotation);

            drawShape(renderer, transform, shape);

            renderer.context.restore();
        }
    }
}
