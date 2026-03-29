import type { CanvasRenderer } from "../../lib/canvas-renderer";
import type { ECS } from "../../lib/ecs";
import { C, type Shape, type Transform } from "../components";

function drawShape(renderer: CanvasRenderer, shape: Shape) {
    switch (shape.type) {
        case 'box':
            renderer.drawRect(0, 0, shape.width, shape.height, {
                filled: true,
                color: shape.color,
            });

            break;
        case 'ball':
            renderer.drawCircle(0, 0, shape.radius, {
                filled: true,
                color: shape.color,
            });

            break;

        default: break;
    }
}

export function RenderSystem(ecs: ECS, renderer: CanvasRenderer) {
    const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

    for (const e of entities) {
        const transform = ecs.getComponent<Transform>(e, C.Transform);
        const shape = ecs.getComponent<Shape>(e, C.Shape);

        if (!transform || !shape) continue;

        renderer.context.save();
        renderer.context.translate(transform.position.x, transform.position.y);
        renderer.context.rotate(transform.rotation);

        drawShape(renderer, shape);

        renderer.context.restore();
    }
}
