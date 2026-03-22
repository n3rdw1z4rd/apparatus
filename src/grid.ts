import type { CanvasRenderer } from "./lib/canvas-renderer";

export const GRID_CELL_SIZE = 32;
export const GRID_SIZE = GRID_CELL_SIZE * 1000;

export function snapToGrid(value: number, gridSize: number = GRID_CELL_SIZE): number {
    return Math.round(value / gridSize) * gridSize;
}

export function drawGrid(
    renderer: CanvasRenderer,
    gridSize: number = GRID_SIZE,
    cellSize: number = GRID_CELL_SIZE,
    color: string = "#444",
) {
    const ctx = renderer.context;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    for (let v = -gridSize; v <= gridSize; v += cellSize) {
        ctx.beginPath();
        ctx.moveTo(v, -gridSize);
        ctx.lineTo(v, gridSize);
        ctx.moveTo(-gridSize, v);
        ctx.lineTo(gridSize, v);
        ctx.stroke();
    }
}
