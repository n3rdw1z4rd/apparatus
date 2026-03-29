import type { ECS, Entity } from "../lib/ecs";
import type { Color } from "../lib/canvas-renderer";
import { snapToGrid } from "./grid";
import { C } from "./components";

export function createBox(
    ecs: ECS,
    x: number,
    y: number,
    width: number,
    height: number,
    color: Color,
    fixed = false,
): Entity {
    const entity = ecs.createEntity();

    x = snapToGrid(x);
    y = snapToGrid(y);

    ecs.addComponent(entity, C.Transform, { x, y, rotation: 0, fixed });
    ecs.addComponent(entity, C.Shape, { type: 'rectangle', width: width, height: height, color });

    return entity;
}

export function createBall(
    ecs: ECS,
    x: number,
    y: number,
    radius: number,
    color: Color,
    fixed = false,
): Entity {
    const entity = ecs.createEntity();

    x = snapToGrid(x);
    y = snapToGrid(y);

    ecs.addComponent(entity, C.Transform, { x, y, rotation: 0, fixed });
    ecs.addComponent(entity, C.Shape, { type: 'circle', radius, color });

    return entity;
}
