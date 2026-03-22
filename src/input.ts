export class Input {
    keys = new Set<string>();
    mouseX = 0;
    mouseY = 0;
    mouseDown = false;
    mousePressed = false;

    constructor() {
        window.addEventListener("keydown", e => this.keys.add(e.key));

        window.addEventListener("keyup", e => this.keys.delete(e.key));

        window.addEventListener("mousemove", e => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        });

        window.addEventListener("mousedown", e => {
            if (e.button === 0) {
                this.mouseDown = true;
                this.mousePressed = true;
            }
        });

        window.addEventListener("mouseup", e => {
            if (e.button === 0) {
                this.mouseDown = false;
            }
        });
    }

    isDown(key: string) {
        return this.keys.has(key);
    }
}
