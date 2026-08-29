import { CanvasRenderer, ECS, Input } from "@n3rdw1z4rd/core";
import { screenToWorld } from "../mouse";
import { snapToGrid } from "../grid";
import type { Camera } from "../camera";
import { Drag } from "../components/drag";
import { Transform } from "../components/transform";

export function dragSystem(ecs: ECS, input: Input, renderer: CanvasRenderer, camera: Camera) {
    const mouseX = input.pointerPosition.x;
    const mouseY = input.pointerPosition.y;

    const mouse = screenToWorld(mouseX, mouseY, renderer, camera);

    // const pickedEntity = (input.isDown('Button0') && !ecs.getEntitiesWithComponents("Drag").length)
    //     ? renderer.pick(mouseX, mouseY, camera)
    //     : null;
    const pickedEntity = null;

    if (pickedEntity !== null) {
        const transform = ecs.getComponent<Transform>(pickedEntity, "Transform");

        if (transform) {
            ecs.addComponent(pickedEntity, "Drag", {
                offsetX: mouse.x - transform.x,
                offsetY: mouse.y - transform.y,
            });
        }
    }

    if (!input.isDown('Button0')) {
        const dragging = ecs.getEntitiesWithComponents("Drag");

        for (const e of dragging) {
            ecs.removeComponent(e, "Drag");
        }
    }

    const dragging = ecs.getEntitiesWithComponents("Drag");

    for (const e of dragging) {
        const drag = ecs.getComponent<Drag>(e, "Drag"); // e.components.get("Drag");
        const transform = ecs.getComponent<Transform>(e, "Transform"); // e.components.get("Transform");

        if (drag && transform) {
            const mouse = screenToWorld(mouseX, mouseY, renderer, camera);

            transform.x = snapToGrid(mouse.x - drag.offsetX);
            transform.y = snapToGrid(mouse.y - drag.offsetY);

            // const rigidbody = ecs.getComponent<any>(e, "RigidBody");
            // const renderRect = ecs.getComponent<any>(e, "RenderRect");

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
}