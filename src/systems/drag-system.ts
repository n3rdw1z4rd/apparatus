import { ECS } from "../lib/ecs";
import { snapToGrid } from "../grid";
import type { Camera } from "../camera";
import type { CanvasRenderer } from "../lib/canvas-renderer";
import type { Input } from "../lib/input";

export function dragSystem(ecs: ECS, input: Input, renderer: CanvasRenderer, camera: Camera) {
    const mouseX = input.mouseX;
    const mouseY = input.mouseY;

    const mouse = renderer.screenToWorld(mouseX, mouseY, camera);

    const pickedEntity = (input.mousePressed && !ecs.getEntitiesWith("Drag").length)
        ? renderer.pick(mouseX, mouseY, camera)
        : null;

    if (pickedEntity !== null) {
        const transform = ecs.getComponent<any>(pickedEntity, "Transform");

        ecs.addComponent(pickedEntity, "Drag", {
            offsetX: mouse.x - transform.x,
            offsetY: mouse.y - transform.y,
        });
    }

    if (!input.mouseDown) {
        const dragging = ecs.getEntitiesWith("Drag");

        for (const e of dragging) {
            ecs.removeComponent(e, "Drag");
        }
    }

    const dragging = ecs.getEntitiesWith("Drag");

    for (const e of dragging) {
        const drag = ecs.getComponent<any>(e, "Drag");
        // const rigidbody = ecs.getComponent<any>(e, "RigidBody");
        const transform = ecs.getComponent<any>(e, "Transform");
        // const renderRect = ecs.getComponent<any>(e, "RenderRect");

        const mouse = renderer.screenToWorld(mouseX, mouseY, camera);

        transform.x = snapToGrid(mouse.x - drag.offsetX);
        transform.y = snapToGrid(mouse.y - drag.offsetY);

        // const localAnchors = getEntityAnchors(renderRect.width, renderRect.height);

        // const worldAnchors = localAnchors.map(a => ({
        //     x: transform.x + a.x,
        //     y: transform.y + a.y,
        // }));

        // const snapped = snapToAnchors(transform.x, transform.y, worldAnchors);

        // transform.x = snap(snapped.x);
        // transform.y = snap(snapped.y);

        // rigidbody.body.setTranslation({ x: transform.x, y: transform.y }, true);
    }
}