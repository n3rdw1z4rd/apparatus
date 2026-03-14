export class Rng {
    private __seed: number;
    private _seed: number;

    private _uid_characters: string =
        '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

    constructor() {
        this._seed = Date.now();
        this.__seed = this._seed;
        this._uid_characters = this.shuffle(this._uid_characters) as string;

        this.seed = this.nexti;
    }

    public get seed(): number {
        return this._seed;
    }

    public set seed(value: number) {
        this._seed = value;
        this.__seed = this._seed;
    }

    public get startingSeed(): number {
        return this.__seed;
    }

    public get nextf(): number {
        // adapted from: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#splitmix32
        this._seed |= 0;
        this._seed = (this._seed + 0x9e3779b9) | 0;

        let t: number = this._seed ^ (this._seed >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t = t ^ (t >>> 15);
        t = Math.imul(t, 0x735a2d97);

        return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
    }

    public get nexti(): number {
        return (this.nextf * Number.MAX_SAFE_INTEGER) | 0;
    }

    public range(min: number, max?: number): number {
        if (max === undefined) {
            max = min;
            min = 0;
        }

        return (min + this.nextf * (max - min)) | 0;
    }

    public choose(...args: any): any {
        args = args.flat(Infinity);
        return args[this.range(args.length - 1)];
    }

    public shuffle(value: Array<any> | string): Array<any> | string {
        return Array.isArray(value)
            ? value.sort((_a, _b) => 0.5 - this.nextf)
            : value
                .split('')
                .sort((_a, _b) => 0.5 - this.nextf)
                .join('');
    }

    public uid(length: number = 16): string {
        const uid: string[] = [];
        for (let i = 0; i < length; i++)
            uid.push(this.choose(this._uid_characters));
        return uid.join('');
    }

    public randomMatrix(size: number): number[][] {
        const rows: number[][] = [];

        for (let i = 0; i < size; i++) {
            const row: number[] = [];

            for (let j = 0; j < size; j++) {
                row.push(this.nextf * 2 - 1);
            }

            rows.push(row);
        }

        return rows;
    }

    public randomUnitVector(): [number, number] {
        const theta = rng.nextf * 2 * Math.PI;
        return [Math.cos(theta), Math.sin(theta)];
    }

    public pointInUnitCircle(radius: number = 1, floored: boolean = false): [x: number, y: number] {
        const theta = this.nextf * 2 * Math.PI;
        const r = Math.sqrt(this.nextf) * radius;
        const x = r * Math.cos(theta);
        const y = r * Math.sin(theta);
        return !floored ? [x, y] : [Math.floor(x), Math.floor(y)];
    }

    public pointInUnitSphere(radius: number = 1, floored: boolean = false): [x: number, y: number, z: number] {
        var u = this.nextf;
        var v = this.nextf;

        var theta = u * 2.0 * Math.PI;
        var phi = Math.acos(2.0 * v - 1.0);

        var r = radius * Math.cbrt(rng.nextf);

        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);

        var sinPhi = Math.sin(phi);
        var cosPhi = Math.cos(phi);

        var x = r * sinPhi * cosTheta;
        var y = r * sinPhi * sinTheta;
        var z = r * cosPhi;

        return !floored ? [x, y, z] : [Math.floor(x), Math.floor(y), Math.floor(z)];
    }

    public parkMillerNormal(): number {
        const mean = 1 / 2;
        const stddev = 1 / 6;

        let u = 0;
        let v = 0;

        while (u === 0) u = this.nextf;
        while (v === 0) v = this.nextf;

        const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

        return n * stddev + mean;
    }
}

export const rng: Rng = new Rng();
