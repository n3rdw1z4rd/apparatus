import { Engine } from "matter-js";

export const engine = Engine.create();

export function updatePhysics(delta: number) {
    Engine.update(engine, delta);
}
