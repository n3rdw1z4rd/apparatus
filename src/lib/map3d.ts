import type { Map2D, Map2DData } from "./map2d";

export const DEFAULT_MAP_3D_VALUE = -1;

// 2^22 per axis: safe range is roughly ±2,097,151, three axes still fit within Number.MAX_SAFE_INTEGER (2^53)
const BASE_3D = 0x20000;
const OFFSET_3D = 0x10000;

export class Map3D {
    readonly defaultValue: number;

    private _data: Map2DData;

    get data(): Map2DData { return this._data; }
    get size(): number { return this._data.size; }

    constructor(
        defaultValue: number = DEFAULT_MAP_3D_VALUE,
        mapData?: Map2DData,
    ) {
        this.defaultValue = defaultValue;
        this._data = mapData ?? new Map();
    }

    private _floor(x: number, y: number, z: number): [number, number, number] {
        return [Math.floor(x), Math.floor(y), Math.floor(z)];
    }

    private _key(x: number, y: number, z: number): number {
        const X = (x + OFFSET_3D) & (BASE_3D - 1);
        const Y = (y + OFFSET_3D) & (BASE_3D - 1);
        const Z = (z + OFFSET_3D) & (BASE_3D - 1);

        return (X * BASE_3D * BASE_3D) + (Y * BASE_3D) + Z;
    }

    private _pos(key: number): [number, number, number] {
        const Z = key % BASE_3D;
        const Y = Math.floor(key / BASE_3D) % BASE_3D;
        const X = Math.floor(key / (BASE_3D * BASE_3D));

        return [X - OFFSET_3D, Y - OFFSET_3D, Z - OFFSET_3D];
    }

    clear() {
        this._data.clear();
    }

    get(
        x: number,
        y: number,
        z: number = 0,
    ): number {
        [x, y, z] = this._floor(x, y, z);

        return this._data.get(this._key(x, y, z)) ?? this.defaultValue;
    }

    set(x: number, y: number, z: number, n: number = this.defaultValue) {
        [x, y, z] = this._floor(x, y, z);

        const key = this._key(x, y, z);

        if (n === this.defaultValue) {
            this._data.delete(key);
        } else {
            this._data.set(key, n);
        }
    }

    setArea(
        x1: number, y1: number, z1: number,
        x2: number, y2: number, z2: number,
        n: number,
    ): void {
        for (let z = z1; z <= z2; z++) {
            for (let y = y1; y <= y2; y++) {
                for (let x = x1; x <= x2; x++) {
                    this.set(x, y, z, n);
                }
            }
        }
    }

    forEach(callback: (x: number, y: number, z: number, n: number) => void) {
        this._data.forEach((n: number, key: number) => {
            const [x, y, z] = this._pos(key);
            callback(x, y, z, n);
        });
    }

    export(): { x: number, y: number, z: number, n: number }[] {
        const data: { x: number, y: number, z: number, n: number }[] = [];

        this.forEach((x: number, y: number, z: number, n: number) => {
            data.push({ x, y, z, n });
        });

        return data;
    }

    import(data: { x: number, y: number, z: number, n: number }[]) {
        this.clear();

        data.forEach(({ x, y, z, n }: { x: number, y: number, z: number, n: number }) => {
            this.set(x, y, z, n);
        });
    }

    static fromMap2D(map2d: Map2D, defaultValue: number = DEFAULT_MAP_3D_VALUE): Map3D {
        const map3d = new Map3D(defaultValue);

        map2d.forEach((x: number, y: number, n: number) => map3d.set(x, y, 0, n));

        return map3d;
    }
}
