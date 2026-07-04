import type RAPIER from "@dimforge/rapier3d";

export type Rapier = typeof RAPIER;

export function GetRapier(): Promise<Rapier> {
    return import('@dimforge/rapier3d');
}
