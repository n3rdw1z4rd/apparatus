import { Observable } from "@n3rdw1z4rd/smoke-ui";
import { Vector } from "./vector";

export class Input {
    private _isDown = new Map<string, number>();
    private _position = new Vector();
    private _activePointerId: number | null = null;

    readonly onDown = new Observable();
    readonly onUp = new Observable();
    readonly onPressed = new Observable();
    readonly onMove = new Observable();
    readonly onWheel = new Observable();

    get position(): Vector { return this._position; }

    inputThreshold = 200;

    constructor(target: Window | HTMLElement) {
        window.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (this._isEditableTarget(ev.target)) return;

            if (!ev.repeat) {
                this._isDown.set(ev.code, ev.timeStamp);
                this.onDown.notify(ev);
            }
        });

        window.addEventListener('keyup', (ev: KeyboardEvent) => {
            if (this._isEditableTarget(ev.target)) return;

            const downTime: number = this._isDown.get(ev.code) ?? 0;

            if (ev.timeStamp - downTime < this.inputThreshold) {
                this.onPressed.notify(ev);
            }

            this._isDown.delete(ev.code);
            this.onUp.notify(ev);
        });

        target.addEventListener('pointerdown', (evt: Event) => {
            const ev = evt as PointerEvent;

            this._isDown.set(`Button${ev.button}`, ev.timeStamp);
            this._activePointerId = ev.pointerId;

            if (target instanceof HTMLElement) {
                target.setPointerCapture(ev.pointerId);
            }

            this.onDown.notify(ev);
        });

        target.addEventListener('pointerup', (evt: Event) => {
            const ev = evt as PointerEvent;

            const button = `Button${ev.button}`;
            const downTime: number = this._isDown.get(button) ?? 0;

            if (ev.timeStamp - downTime < this.inputThreshold) {
                this.onPressed.notify(ev);
            }

            this._isDown.delete(button);

            if (target instanceof HTMLElement && this._activePointerId === ev.pointerId) {
                target.releasePointerCapture(ev.pointerId);
                this._activePointerId = null;
            }

            this.onUp.notify(ev);
        });

        target.addEventListener('pointermove', (evt: Event) => {
            const ev = evt as PointerEvent;

            this._position.set(ev.clientX, ev.clientY);
            this.onMove.notify(ev);
        });

        target.addEventListener('wheel', (ev: Event) => {
            this.onWheel.notify(ev as WheelEvent);
        });
    }

    private _isEditableTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;

        return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    }

    isDown(name: string): boolean {
        return this._isDown.has(name);
    }
}
