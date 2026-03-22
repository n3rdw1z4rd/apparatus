import { C } from "../components";
import { ECS } from "../ecs";

export function physicsSystem(ecs: ECS) {
    const entities = ecs.getEntitiesWith(C.RigidBody, C.Transform);

    for (const e of entities) {
        const rb = ecs.getComponent<any>(e, C.RigidBody);
        const transform = ecs.getComponent<any>(e, C.Transform);

        const pos = rb.body.translation();
        const rot = rb.body.rotation();

        transform.x = pos.x;
        transform.y = pos.y;
        transform.rotation = rot;
    }
}
