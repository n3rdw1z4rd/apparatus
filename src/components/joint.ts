export interface Joint {
    entityA: number;
    entityB: number;
    anchorA: { x: number; y: number };
    anchorB: { x: number; y: number };
    type: "hinge" | "rod"; // can expand later
}
