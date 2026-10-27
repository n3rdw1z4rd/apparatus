import { WorkerInterface } from '@n3rdw1z4rd/core';
import type { PartDef } from '../core/scene';
import type { BodyInit, JointInit, FromWorker, PointerMsg, SpawnedBody, ToWorker, Vec2 } from './protocol';
import workerUrl from './physics.worker.ts?worker&url';

/** No answer for this long means the worker is stuck (e.g. a script looping forever). */
export const HANG_MS = 3000;

export interface FrameInfo {
    data: Float32Array;
    time: number;
    frame: number;
    stepMs: number;
    spawned: SpawnedBody[];
    removed: number[];
    toggled?: [number, boolean][];
    scriptError?: string;
    behaviorErrors?: { node: string; type: string; message: string }[];
}

/**
 * Main-thread handle to physics.worker.ts (Rapier + scene scripts).
 *
 * Messages are posted in order; while playing, the worker steps on its own
 * clock and sends a frame per step. `hung` turns true when an expected answer
 * (a frame while playing, or a build result) is overdue, so the store can
 * replace the worker.
 */
export class PhysicsClient extends WorkerInterface<FromWorker, ToWorker> {
    readonly ready: Promise<void>;

    onFrame: (frame: FrameInfo) => void = () => {};

    /** Physics steps per second (measured over ~0.5 s) and average ms per step. */
    stepsPerSecond = 0;
    stepMs = 0;

    private _playing = false;
    private _paused = false;
    private _lastFrameAt = 0;
    private _buildSince = 0;
    private _buildId = 0;
    private _builds = new Map<number, (r: { parts?: PartDef[]; error?: string }) => void>();
    private _rateSteps = 0;
    private _rateMs = 0;
    private _rateStart = performance.now();
    private _disposed = false;

    constructor() {
        super(workerUrl);

        let resolveReady!: () => void;
        this.ready = new Promise((r) => (resolveReady = r));

        this.onMessage.subscribe(({ data: msg }) => {
            switch (msg.t) {
                case 'ready':
                    resolveReady();
                    break;

                case 'frame':
                    this._lastFrameAt = performance.now();
                    this._measure(msg.stepMs);
                    this.onFrame(msg);
                    break;

                case 'built': {
                    const done = this._builds.get(msg.id);
                    this._builds.delete(msg.id);
                    if (!this._builds.size) this._buildSince = 0;
                    done?.(msg);
                    break;
                }
            }
        });
    }

    private _send(msg: ToWorker): void {
        if (!this._disposed) this.postMessage(msg);
    }

    private _measure(stepMs: number): void {
        this._rateSteps++;
        this._rateMs += stepMs;
        const now = performance.now();
        if (now - this._rateStart >= 500) {
            this.stepsPerSecond = Math.round((this._rateSteps * 1000) / (now - this._rateStart));
            this.stepMs = this._rateSteps ? this._rateMs / this._rateSteps : 0;
            this._rateSteps = 0;
            this._rateMs = 0;
            this._rateStart = now;
        }
    }

    get playing(): boolean {
        return this._playing;
    }

    /** True when the worker has gone quiet for longer than HANG_MS. */
    get hung(): boolean {
        const now = performance.now();
        if (this._buildSince && now - this._buildSince > HANG_MS) return true;
        return this._playing && !this._paused && this._lastFrameAt > 0 && now - this._lastFrameAt > HANG_MS;
    }

    play(opts: { bodies: BodyInit[]; joints?: JointInit[]; gravity: Vec2; timeScale: number; paused: boolean; seed: number; grid: number; script: string | null }): void {
        this._playing = true;
        this._paused = opts.paused;
        // Give the first frame (script compile + setup) the full grace period.
        this._lastFrameAt = performance.now();
        this._send({ t: 'play', ...opts });
    }

    stop(): void {
        this._playing = false;
        this._send({ t: 'stop' });
    }

    pause(paused: boolean): void {
        this._paused = paused;
        this._lastFrameAt = performance.now();
        this._send({ t: 'pause', paused });
    }

    step(): void {
        this._send({ t: 'step' });
    }

    setParams(gravity: Vec2, timeScale: number): void {
        this._send({ t: 'params', gravity, timeScale });
    }

    setPointer(p: PointerMsg): void {
        this._send({ t: 'pointer', ...p });
    }

    /** Runs the script's build() in the worker and resolves with the parts it made. */
    build(script: string, parts: PartDef[], grid: number, seed: number): Promise<{ parts?: PartDef[]; error?: string }> {
        const id = ++this._buildId;
        if (!this._buildSince) this._buildSince = performance.now();
        return new Promise((resolve) => {
            this._builds.set(id, resolve);
            this._send({ t: 'build', id, script, parts, grid, seed });
        });
    }

    /** Stops the worker; pending builds resolve with `reason` as their error. */
    dispose(reason = 'physics worker stopped'): void {
        this._disposed = true;
        this._playing = false;
        this.terminate();
        for (const done of this._builds.values()) done({ error: reason });
        this._builds.clear();
        this._buildSince = 0;
    }
}
