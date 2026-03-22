import { C } from "../components";
import type { RenderRect } from "../components/render-rect";
import type { Transform } from "../components/transform";
import { ECS } from "../ecs";
import { GRID_CELL_SIZE } from "../grid";
import type { CanvasRenderer } from "../lib/canvas-renderer";

export function renderSystem(ecs: ECS, renderer: CanvasRenderer) {
    const entities = ecs.getEntitiesWith(C.Transform, C.RenderRect);

    for (const e of entities) {
        const t = ecs.getComponent<Transform>(e, C.Transform);
        const r = ecs.getComponent<RenderRect>(e, C.RenderRect);

        if (t && r) {
            renderer.context.save();
            renderer.context.translate(t.x, t.y);
            renderer.context.rotate(t.rotation);

            renderer.drawRect(0, 0, r.width, r.height, {
                filled: true,
                fillColor: r.color,
            });

            renderer.drawText(
                GRID_CELL_SIZE, -GRID_CELL_SIZE,
                `[${e}] ${t.x.toFixed(2)}, ${t.y.toFixed(2)} | ${r.width.toFixed(2)}, ${r.height.toFixed(2)} | ${t.rotation.toFixed(2)}`
            );

            renderer.context.restore();
        }
    }
}
