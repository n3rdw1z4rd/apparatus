import type { Camera } from "./camera";
import type { CanvasRenderer } from "./lib/canvas-renderer";
import { ceil, floor, round } from "@n3rdw1z4rd/core";

export const GRID_CELL_SIZE = 32;
export const GRID_SIZE = GRID_CELL_SIZE * 1000;

export function snapToGrid(value: number, gridSize: number = GRID_CELL_SIZE): number {
    return round(value / gridSize) * gridSize;
}

export function drawGrid(
    renderer: CanvasRenderer,
    camera: Camera,
    cellSize: number = GRID_CELL_SIZE,
    color: string = "#444",
) {
    const ctx = renderer.context;

    const width = renderer.width / camera.zoom;
    const height = renderer.height / camera.zoom;

    const startX = floor((camera.x - width / 2) / cellSize) * cellSize;
    const endX = ceil((camera.x + width / 2) / cellSize) * cellSize;

    const startY = floor((camera.y - height / 2) / cellSize) * cellSize;
    const endY = ceil((camera.y + height / 2) / cellSize) * cellSize;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    ctx.beginPath();

    for (let x = startX; x <= endX; x += cellSize) {
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
    }

    for (let y = startY; y <= endY; y += cellSize) {
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
    }

    ctx.stroke();
}
