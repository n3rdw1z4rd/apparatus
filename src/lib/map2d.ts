export const DEFAULT_MAP_2D_VALUE = -1;

// 2^21 per axis: safe range is roughly ±1,048,575, comfortably covers voxel/tile coordinates
const BASE_2D = 0x200000;
const OFFSET_2D = 0x100000;

export type Map2DData = Map<number, number>;

export class Map2D {
    readonly defaultValue: number;

    private _data: Map2DData;

    get data(): Map2DData { return this._data; }
    get size(): number { return this._data.size; }

    constructor(
        defaultValue: number = DEFAULT_MAP_2D_VALUE,
        mapData?: Map2DData,
    ) {
        this.defaultValue = defaultValue;
        this._data = mapData ?? new Map();
    }

    private _floor(x: number, y: number): [number, number] {
        return [Math.floor(x), Math.floor(y)];
    }

    private _key(x: number, y: number): number {
        const X = (x + OFFSET_2D) & (BASE_2D - 1);
        const Y = (y + OFFSET_2D) & (BASE_2D - 1);
        return (X * BASE_2D) + Y;
    }

    private _pos(key: number): [number, number] {
        const Y = key % BASE_2D;
        const X = Math.floor(key / BASE_2D);
        return [X - OFFSET_2D, Y - OFFSET_2D];
    }

    clear() {
        this._data.clear();
    }

    get(x: number, y: number, defaultValue: number = this.defaultValue): number {
        [x, y] = this._floor(x, y);

        return this._data.get(this._key(x, y)) ?? defaultValue;
    }

    set(x: number, y: number, value: number = this.defaultValue) {
        [x, y] = this._floor(x, y);

        const key = this._key(x, y);

        if (value === this.defaultValue) {
            this._data.delete(key);
        } else {
            this._data.set(key, value);
        }
    }

    forEach(callback: (x: number, y: number, n: number, i: number) => void) {
        let i = 0;

        this._data.forEach((v: number, key: number) => {
            const [x, y] = this._pos(key);
            callback(x, y, v, i++);
        });
    }

    forEachInArea(
        x1: number, y1: number,
        x2: number, y2: number,
        callback: (x: number, y: number, n: number) => void,
    ) {
        this.forEach((x: number, y: number, n: number) => {
            if (x >= x1 && x < x2 && y >= y1 && y < y2) {
                callback(x, y, n);
            }
        });
    }
}
