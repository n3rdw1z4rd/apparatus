import { Emitter } from "./emitter";

export class Input extends Emitter {
    keys = new Set<string>();
    pointerX = 0;
    pointerY = 0;
    pointerDown = false;
    pointerPressed = false;

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

        window.addEventListener("pointermove", e => {
            this.pointerX = e.clientX;
            this.pointerY = e.clientY;
            this.emit('pointermove', e);
        });

        window.addEventListener("pointerdown", e => {
            if (e.button === 0) {
                this.pointerDown = true;
                this.pointerPressed = true;
            }

            this.emit('pointerdown', e);
        });

        window.addEventListener("pointerup", e => {
            if (e.button === 0) {
                this.pointerDown = false;
            }

            this.emit('pointerup', e);
        });

        window.addEventListener("wheel", e => this.emit('wheel', e));
    }

    isDown(key: string) {
        return this.keys.has(key);
    }
}
