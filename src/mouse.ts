import type { Camera } from "./camera";
import type { CanvasRenderer } from "./lib/canvas-renderer";

export function screenToWorld(
    mouseX: number,
    mouseY: number,
    renderer: CanvasRenderer,
    camera: Camera
) {
    return {
        x: (mouseX - renderer.width / 2) / camera.zoom + camera.x,
        y: (mouseY - renderer.height / 2) / camera.zoom + camera.y,
    };
}
