import { hash32mix, TAU } from "./math";

export class Random {
    private _seed: number;

    constructor(seed: number = Date.now()) {
        this._seed = seed | 0;
    }

    get seed(): number {
        return this._seed;
    }

    set seed(value: number) {
        this._seed = value | 0;
    }

    static hash(...values: number[]): number {
        return hash32mix(...values);
    }

    static uint(...values: number[]): number {
        return hash32mix(...values);
    }

    static float(...values: number[]): number {
        return hash32mix(...values) / 0x100000000;
    }

    static bool(...values: number[]): boolean {
        return (hash32mix(...values) & 1) !== 0;
    }

    static sign(...values: number[]): -1 | 1 {
        return this.bool(...values) ? 1 : -1;
    }

    static angle(...values: number[]): number {
        return this.float(...values) * TAU;
    }

    uint(): number {
        return Random.uint(this._seed++);
    }

    float(): number {
        return Random.float(this._seed++);
    }

    bool(): boolean {
        return Random.bool(this._seed++);
    }

    sign(): -1 | 1 {
        return Random.sign(this._seed++);
    }

    angle(): number {
        return Random.angle(this._seed++);
    }
}
