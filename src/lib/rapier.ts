import type { Vector } from "@dimforge/rapier2d";
import type RAPIER from "@dimforge/rapier2d";
import type { RigidBodyComponent } from "../poc/components/rigidbody";

export type Rapier = typeof RAPIER;

export function GetRapier(): Promise<Rapier> {
    return import('@dimforge/rapier2d');
}

export function pickBody(
    entities: { [id: number]: RigidBodyComponent },
    point: Vector,
) {
    for (const [entity, comp] of Object.entries(entities)) {
        const body = comp.body;

        if (body.collider(0)?.containsPoint(point)) {
            return +entity;
        }
    }

    return null;
}
