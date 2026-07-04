import { Emitter } from "@n3rdw1z4rd/core";

export class Input extends Emitter {
    keys = new Set<string>();
    mouseX = 0;
    mouseY = 0;
    mouseDown = false;
    mousePressed = false;

    constructor() {
        super();

        window.addEventListener("keydown", e => {
            this.keys.add(e.key);
            this.emit('keydown', e);
        });

        window.addEventListener("keyup", e => {
            this.keys.delete(e.key);
            this.emit('keyup', e);
        });

        window.addEventListener("mousemove", e => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this.emit('mousemove', e);
        });

        window.addEventListener("mousedown", e => {
            if (e.button === 0) {
                this.mouseDown = true;
                this.mousePressed = true;
            }

            this.emit('mousedown', e);
        });

        window.addEventListener("mouseup", e => {
            if (e.button === 0) {
                this.mouseDown = false;
            }

            this.emit('mouseup', e);
        });
    }

    isDown(key: string) {
        return this.keys.has(key);
    }
}
