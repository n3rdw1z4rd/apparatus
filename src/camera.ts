import { log } from "./lib/log";

export class Camera {
    x: number = 0;
    y: number = 0;

    zoom: number = 1;

    constructor() {
        // window.addEventListener('wheel', (ev: WheelEvent) => {
        //     const { deltaY } = ev;
        //     this.zoom += deltaY;
        //     log('zoom:', this.zoom);
        // });
    }
}
