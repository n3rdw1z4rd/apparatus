// import { Emitter } from "./lib/emitter";

// export class PhysicsInterface extends Emitter {
//     private _worker: Worker;

//     constructor() {
//         super();

//         this._worker = new Worker(
//             new URL('./physics-worker.ts', import.meta.url),
//             { type: 'module' },
//         );

//         this._worker.onerror = (error: ErrorEvent) =>
//             this.emit('error', error);

//         this._worker.onmessage = ({ data: { type, payload } }: MessageEvent) =>
//             this.emit(type, payload);
//     }

//     postMessage(type: string, payload?: any, options?: StructuredSerializeOptions | undefined) {
//         this._worker.postMessage({ type, payload }, options);
//     }
// }
