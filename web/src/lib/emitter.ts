export type Listener = (...args: any[]) => void;

export class Emitter {
    private listeners: Map<string, Listener[]> = new Map<string, Listener[]>();

    constructor() { }

    public on<T extends string[]>(...eventName: [...T, Listener]): this {
        const listener = eventName.pop() as Listener;
        const events: string[] = eventName.filter((ev: any) => (typeof ev === 'string')) as string[];

        events.forEach((event: string) => {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, new Array<Listener>());
            }

            this.listeners.get(event)?.push(listener);
        });

        return this;
    }

    public emit(eventName: string, ...args: any[]): this {
        this.listeners.get(eventName)?.forEach((listener: Listener) => listener(...args, eventName));

        return this;
    }

    public clear(eventName?: string): this {
        if (eventName) {
            this.listeners.delete(eventName);
        } else {
            this.listeners.clear();
        }

        return this;
    }
}
