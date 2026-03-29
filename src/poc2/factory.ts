import type { Color } from "../lib/canvas-renderer";
import type { ECS } from "../lib/ecs";
import { C, type Shape, type Transform } from "./components";

export interface CreateBodyParams {
    shape?: 'box' | 'ball',
    position?: XY,
    rotation?: number,
    color?: Color,
    width?: number,
    height?: number,
    radius?: number,
    pickable?: boolean,
}

export function CreateBody(
    ecs: ECS,
    params: CreateBodyParams,
) {
    const body = ecs.createEntity();

    const shape = params.shape ?? {
        type: 'box',
        width: params.width ?? 32,
        height: params.height ?? 32,
        color: params.color ?? 'magenta',
    };

    ecs.addComponent<Transform>(body, C.Transform, {
        position: params.position ?? { x: 0, y: 0 },
        rotation: params.rotation ?? 0,
    });

    switch (shape) {
        case 'box':
            ecs.addComponent<Shape>(body, C.Shape, {
                type: 'box',
                width: params.width ?? 32,
                height: params.height ?? 32,
                color: params.color ?? 'magenta',
            });
            break;

        case 'ball':
            ecs.addComponent<Shape>(body, C.Shape, {
                type: 'ball',
                radius: params.radius ?? 32,
                color: params.color ?? 'magenta',
            });
            break;

        default: break;
    }

    return body;
}
