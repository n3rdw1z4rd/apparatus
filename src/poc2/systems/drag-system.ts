import type { CanvasRenderer } from "../../lib/canvas-renderer";
import type { ECS, Entity } from "../../lib/ecs";
import type { Input } from "../../lib/input";
import type { Camera } from "../camera";
import { C, type Drag, type Transform } from "../components";
import { snapToGrid } from "../grid";

export function DragSystem(
    ecs: ECS,
    input: Input,
    renderer: CanvasRenderer,
    camera: Camera,
    pickedEntity?: Entity | null,
) {
    const pointerX = input.pointerX;
    const pointerY = input.pointerY;

    const mouse = renderer.screenToWorld(pointerX, pointerY, camera);

    if (pickedEntity) {
        const transform = ecs.getComponent<Transform>(pickedEntity, C.Transform);

        if (transform) {
            ecs.addComponent(pickedEntity, C.Drag, {
                offsetX: mouse.x - transform.position.x,
                offsetY: mouse.y - transform.position.y,
            });
        }
    }

    if (!input.pointerDown) {
        const dragging = ecs.getEntitiesWith(C.Drag);

        for (const e of dragging) {
            ecs.removeComponent(e, C.Drag);
        }
    }

    const dragging = ecs.getEntitiesWith(C.Drag);

    for (const e of dragging) {
        const drag = ecs.getComponent<Drag>(e, C.Drag);
        const transform = ecs.getComponent<Transform>(e, C.Transform);

        if (!drag || !transform) continue;

        const mouse = renderer.screenToWorld(pointerX, pointerY, camera);

        transform.position.x = snapToGrid(mouse.x - drag.offsetX);
        transform.position.y = snapToGrid(mouse.y - drag.offsetY);
    }
}
