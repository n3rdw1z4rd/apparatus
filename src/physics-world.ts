import { Emitter } from "@n3rdw1z4rd/core";
import type {
    BodyDesc,
    JointDesc,
    PhysicsCommand,
    PhysicsEvent,
    Vec3,
} from "./physics-protocol";

// Main-thread client for the physics worker. Talks the typed PhysicsCommand /
// PhysicsEvent protocol (see physics-protocol.ts) instead of raw postMessage
// strings, so the worker's API reads like a normal physics world: create it,
// add/remove bodies, start/pause the simulation, apply forces.
//
// Every rapier body still only exists inside the worker - these methods are
// fire-and-forget commands, not calls into a live object. The only data that
// ever comes back is the 'step' buffer (applied to render transforms) and
// one-off events (ready/collision/log).
export class PhysicsWorld extends Emitter {
    private _worker: Worker;

    constructor() {
        super();

        this._worker = new Worker(
            new URL('./physics-worker.ts', import.meta.url),
            { type: 'module' },
        );

        this._worker.onerror = (error: ErrorEvent) =>
            this.emit('error', error);

        this._worker.onmessage = ({ data }: MessageEvent<PhysicsEvent>) => {
            switch (data.type) {
                case 'ready': this.emit('ready'); break;
                case 'step': this.emit('step', data.buffer); break;
                case 'collision': this.emit('collision', data.a, data.b, data.started); break;
                case 'log': this.emit('log', data.level, data.message); break;
            }
        };
    }

    private send(command: PhysicsCommand, transfer?: Transferable[]) {
        this._worker.postMessage(command, { transfer });
    }

    createWorld(gravity: Vec3) {
        this.send({ cmd: 'createWorld', gravity });
    }

    setGravity(gravity: Vec3) {
        this.send({ cmd: 'setGravity', gravity });
    }

    addBody(id: number, desc: BodyDesc) {
        this.send({ cmd: 'addBody', id, desc });
    }

    removeBody(id: number) {
        this.send({ cmd: 'removeBody', id });
    }

    addJoint(id: number, desc: JointDesc) {
        this.send({ cmd: 'addJoint', id, desc });
    }

    removeJoint(id: number) {
        this.send({ cmd: 'removeJoint', id });
    }

    applyImpulse(id: number, impulse: Vec3, point?: Vec3) {
        this.send({ cmd: 'applyImpulse', id, impulse, point });
    }

    applyTorqueImpulse(id: number, torque: Vec3) {
        this.send({ cmd: 'applyTorqueImpulse', id, torque });
    }

    setLinvel(id: number, velocity: Vec3) {
        this.send({ cmd: 'setLinvel', id, velocity });
    }

    setAngvel(id: number, velocity: Vec3) {
        this.send({ cmd: 'setAngvel', id, velocity });
    }

    start() {
        this.send({ cmd: 'start' });
    }

    pause() {
        this.send({ cmd: 'pause' });
    }

    // Named clearWorld() (not clear()) since Emitter already owns clear()
    // for removing listeners - don't want to shadow that.
    clearWorld() {
        this.send({ cmd: 'clear' });
    }

    terminate() {
        this._worker.terminate();
    }
}
