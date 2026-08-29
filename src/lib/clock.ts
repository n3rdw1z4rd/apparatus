import { Observable } from "@n3rdw1z4rd/smoke-ui";

export const ONE_SECOND = 1000;

export class Clock {
    private _fps: number = 0;
    private _frameCount: number = 0;
    private _frameTime: number = 0;
    private _isRunning: boolean = false;
    private _lastTime: number = 0;

    readonly onFpsUpdate = new Observable();
    readonly onFrame = new Observable();

    readonly startTime = performance.now();

    get elapsedTime(): number { return performance.now() - this.startTime; }
    get fps(): number { return this._fps; }
    get isRunning(): boolean { return this._isRunning; }

    update(time: number): number {
        const deltaTime = (time - this._lastTime) / ONE_SECOND;

        this._lastTime = time;

        if (this._frameTime + ONE_SECOND >= time) {
            this._frameCount++;
        } else {
            this._frameTime = time;
            this._fps = this._frameCount;
            this._frameCount = 0;

            this.onFpsUpdate.notify(this.fps);
        }

        return deltaTime;
    }

    start() {
        if (!this._isRunning) {
            const animate = (time: DOMHighResTimeStamp) => {
                this.onFrame.notify(this.update(time));

                if (this._isRunning)
                    requestAnimationFrame(animate);
            };

            this._isRunning = true;
            requestAnimationFrame(animate);
        }
    }

    stop() {
        this._isRunning = false;
    }
}
