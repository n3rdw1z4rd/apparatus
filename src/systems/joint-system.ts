/*
 * import { ECS } from "../ecs";
import type { Rapier } from "../rapier";
import type { World } from "@dimforge/rapier2d";
import type { CanvasRenderer } from "../lib/canvas-renderer";
// import type { Camera } from "../camera";
import type { Input } from "../lib/input";
// import { getEntityAnchors } from "./anchor-system";

// let jointPending: {
//      entity: number;
//     anchor: { x: number; y: number };
// } | null = null;

export function jointSystem(
    // ecs: ECS,
    input: Input,
    // renderer: CanvasRenderer,
    // camera: Camera
) {
    if (!input.mouseDown) return;

    // Convert mouse to world
    // const mouse = {
    //    x: (input.mouseX - renderer.width / 2) / camera.zoom + camera.x,
    //    y: (input.mouseY - renderer.height / 2) / camera.zoom + camera.y,
    // };

    // Find closest anchor
    let closestAnchor: { entity: number; anchor: { x: number; y: number } } | null = null;

    // const entities = ecs.getEntitiesWith("Transform", "RenderRect");

    //for (const e of entities) {
        // const t = ecs.getComponent<any>(e, "Transform");
        // const r = ecs.getComponent<any>(e, "RenderRect");
        // const anchors = getEntityAnchors(t, r.width, r.height);

        // for (const a of anchors) {
        //     const dx = mouse.x - a.x;
        //     const dy = mouse.y - a.y;
        //     const dist = Math.sqrt(dx * dx + dy * dy);

        //     if (dist < 10) { // snap radius
        //         closestAnchor = { entity: e, anchor: a };
        //         break;
        //     }
        // }

        // if (closestAnchor) break;
    // }

    if (!closestAnchor) return;

    // First click
    // if (!jointPending) {
    //     jointPending = closestAnchor;
    // } else {
    //     // Second click → create joint
    //     const entity = ecs.createEntity();

    //     ecs.addComponent(entity, "Joint", {
    //         entityA: jointPending.entity,
    //         entityB: closestAnchor.entity,
    //         anchorA: jointPending.anchor,
    //         anchorB: closestAnchor.anchor,
    //         type: "hinge", // default for now
    //     });

    //     jointPending = null;
    // }
}

export function renderJoints(ecs: ECS, renderer: CanvasRenderer) {
    const joints = ecs.getEntitiesWith("Joint");

    for (const e of joints) {
        const j = ecs.getComponent<any>(e, "Joint");

        renderer.drawLine(
            j.anchorA.x, j.anchorA.y,
            j.anchorB.x, j.anchorB.y,
            { color: 'yellow', size: 2 }
        );
    }
}

export function createJoints(ecs: ECS, rapier: Rapier, world: World) {
    for (const e of ecs.getEntitiesWith("Joint")) {
        const j = ecs.getComponent<any>(e, "Joint");
        const rbA = ecs.getComponent<any>(j.entityA, "RigidBody").body;
        const rbB = ecs.getComponent<any>(j.entityB, "RigidBody").body;

        // Create hinge joint in Rapier
        world.createImpulseJoint(
            rapier.JointData.revolute(j.anchorA, j.anchorB),
            rbA, rbB, true,
        );
    }
}
*/
