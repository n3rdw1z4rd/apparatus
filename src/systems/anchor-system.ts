// import { ECS } from "../ecs";
// import type { Transform } from "../components/transform";
// import type { CanvasRenderer } from "../lib/canvas-renderer";
// import type { Shape } from "../components/shape";
// import { GRID_CELL_SIZE } from "../grid";
// import type { Anchors } from "../components/anchors";

// export const DEFAULT_ANCHOR_RADIUS = 4;

// export interface AnchorPoint {
//     x: number;
//     y: number;
//     radius?: number;
// }

// export function getEntityAnchors(width: number, height: number, cellSize: number = GRID_CELL_SIZE) {
//     const anchors: { x: number, y: number }[] = [];

//     const halfWidth = width / 2;
//     const halfHeight = height / 2;

//     const xc = width / cellSize;
//     const yc = height / cellSize;

//     for (let t = 0; t < xc; t++) {
//         for (let j = 0; j < yc; j++) {
//             anchors.push({
//                 x: (-halfWidth + cellSize / 2) + (t * cellSize),
//                 y: (-halfHeight + cellSize / 2) + (j * cellSize),
//             });
//         }
//     }

//     return anchors;
// }

// export function snapToAnchors(x: number, y: number, anchors: AnchorPoint[]): { x: number, y: number } {
//     let closest = anchors[0];
//     let minDist = Infinity;

//     for (const a of anchors) {
//         const dx = a.x - x;
//         const dy = a.y - y;
//         const dist = Math.sqrt(dx * dx + dy * dy);

//         if (dist < minDist && dist < DEFAULT_ANCHOR_RADIUS) {
//             minDist = dist;
//             closest = a;
//         }
//     }

//     return { x: closest.x, y: closest.y };
// }

// export function renderAnchors(ecs: ECS, renderer: CanvasRenderer) {
//     const entities = ecs.getEntitiesWith("Transform", "RenderRect");

//     for (const e of entities) {
//         const t = ecs.getComponent<Transform>(e, "Transform");
//         const r = ecs.getComponent<Shape>(e, "RenderRect");
//         const anchors = ecs.getComponent<Anchors>(e, "Anchors");

//         if (t && r && anchors) {
//             renderer.context.save();
//             renderer.context.translate(t.x, t.y);
//             renderer.context.rotate(t.rotation);

//             for (const a of anchors.anchors) {
//                 renderer.drawCircle(a.x, a.y, DEFAULT_ANCHOR_RADIUS, {
//                     filled: true,
//                     fillColor: "cyan",
//                 });
//             }

//             renderer.context.restore();
//         }
//     }
// }
