import type { World } from "@dimforge/rapier2d";
import type { Rapier } from "./rapier";
import type { ECS, Entity } from "./ecs";
import type { Color } from "./lib/canvas-renderer";
import { snapToGrid } from "./grid";
import { getEntityAnchors } from "./systems/anchor-system";

export function createBox(
    rapier: Rapier,
    world: World,
    ecs: ECS,
    x: number,
    y: number,
    w: number,
    h: number,
    color: Color,
    fixed = false,
): Entity {
    const entity = ecs.createEntity();

    x = snapToGrid(x);
    y = snapToGrid(y);

    const body = world.createRigidBody(
        (fixed
            ? rapier.RigidBodyDesc.fixed()
            : rapier.RigidBodyDesc.dynamic()
        ).setTranslation(x, y)
    );

    world.createCollider(
        rapier.ColliderDesc.cuboid(w / 2, h / 2),
        body
    );

    ecs.addComponent(entity, "RigidBody", { body });
    ecs.addComponent(entity, "Transform", { x, y, rotation: 0 });
    ecs.addComponent(entity, "RenderRect", { width: w, height: h, color });

    const anchors = getEntityAnchors(w, h);
    ecs.addComponent(entity, "Anchors", { anchors });

    return entity;
}
