import type { Vector } from "@dimforge/rapier2d";
import type { ECS, Entity } from "../../lib/ecs";
import type { Input } from "../../lib/input";
import type { Camera } from "../camera";
import { C, type Shape, type Transform } from "../components";
import type { CanvasRenderer } from "../../lib/canvas-renderer";

function screenToWorld(
    mouseX: number, mouseY: number,
    screenWidth: number, screenHeight: number,
    camera: Camera,
): Vector {
    return {
        x: (mouseX - screenWidth / 2) / camera.zoom + camera.x,
        y: (mouseY - screenHeight / 2) / camera.zoom + camera.y,
    };
}

export function PickingSystem(
    ecs: ECS,
    input: Input,
    renderer: CanvasRenderer,
    camera: Camera,
): Entity | null {
    const mouse = screenToWorld(
        input.pointerX, input.pointerY,
        renderer.width / 2, renderer.height / 2,
        camera,
    );

    const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

    for (const entity of entities) {
        const shape = ecs.getComponent<Shape>(entity, C.Shape);
        const transform = ecs.getComponent<Transform>(entity, C.Transform);

        if (!transform || !shape) continue;

        const dx = mouse.x - transform.position.x;
        const dy = mouse.y - transform.position.y;

        const cos = Math.cos(-transform.rotation);
        const sin = Math.sin(-transform.rotation);

        const x = dx * cos - dy * sin;
        const y = dx * sin + dy * cos;

        switch (shape.type) {
            case 'box': {
                const halfWidth = shape.width / 2;
                const halfHeight = shape.height / 2;

                if (
                    x >= -halfWidth &&
                    x <= halfWidth &&
                    y >= -halfHeight &&
                    y <= halfHeight
                ) {
                    return entity;
                }

                break;
            }

            case 'ball':
                if ((dx * dx + dy * dy) <= shape.radius * shape.radius) {
                    return entity;
                }

                break;

            default: break;
        }
    }

    return null;
}
