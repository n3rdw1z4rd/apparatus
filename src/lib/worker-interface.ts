import { Observable } from "@n3rdw1z4rd/smoke-ui";

export class WorkerInterface {
    private _worker: Worker;

    readonly onError = new Observable();
    readonly onMessage = new Observable();

    constructor(path: string) {
        this._worker = new Worker(new URL(path, import.meta.url), { type: 'module' });
        this._worker.onerror = (error: ErrorEvent) => this.onError.notify(error);
        this._worker.onmessage = (message: MessageEvent) => this.onMessage.notify(message);
    }

    postMessage(message: any, options?: StructuredSerializeOptions | undefined) {
        this._worker.postMessage(message, options);
    }
}
