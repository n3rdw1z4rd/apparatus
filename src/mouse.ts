import { CanvasRenderer } from "@n3rdw1z4rd/core";
import type { Camera } from "./camera";

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
