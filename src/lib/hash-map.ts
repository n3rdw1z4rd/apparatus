// const DEFAULT_VALUE = 0;

// // 2^22 per axis: safe range is roughly ±2,097,151, three axes still fit within Number.MAX_SAFE_INTEGER (2^53)
// const BASE_3D = 0x20000;
// const OFFSET_3D = 0x10000;

// export class HashMap {
//     readonly defaultValue: number;

//     private _map = new Map<number, number>();

//     get size(): number { return this._map.size; }

//     constructor(defaultValue: number = DEFAULT_VALUE) {
//         this.defaultValue = defaultValue;
//     }

//     private _floor(x: number, y: number, z: number): [number, number, number] {
//         return [Math.floor(x), Math.floor(y), Math.floor(z)];
//     }

//     private _key(x: number, y: number, z: number): number {
//         const X = (x + OFFSET_3D) & (BASE_3D - 1);
//         const Y = (y + OFFSET_3D) & (BASE_3D - 1);
//         const Z = (z + OFFSET_3D) & (BASE_3D - 1);

//         return (X * BASE_3D * BASE_3D) + (Y * BASE_3D) + Z;
//     }

//     private _pos(key: number): [number, number, number] {
//         const Z = key % BASE_3D;
//         const Y = Math.floor(key / BASE_3D) % BASE_3D;
//         const X = Math.floor(key / (BASE_3D * BASE_3D));

//         return [X - OFFSET_3D, Y - OFFSET_3D, Z - OFFSET_3D];
//     }

//     clear() {
//         this._map.clear();
//     }

//     get(
//         x: number,
//         y: number,
//         z: number,
//     ): number {
//         [x, y, z] = this._floor(x, y, z);

//         return this._map.get(this._key(x, y, z)) ?? this.defaultValue;
//     }

//     set(x: number, y: number, z: number, n: number = this.defaultValue) {
//         [x, y, z] = this._floor(x, y, z);

//         const key = this._key(x, y, z);

//         if (n === this.defaultValue) {
//             this._map.delete(key);
//         } else {
//             this._map.set(key, n);
//         }
//     }

//     forEach(callback: (x: number, y: number, z: number, n: number) => void) {
//         this._map.forEach((n: number, key: number) => {
//             const [x, y, z] = this._pos(key);
//             callback(x, y, z, n);
//         });
//     }
// }
