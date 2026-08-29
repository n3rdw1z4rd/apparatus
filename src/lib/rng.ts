import { Random } from "./random";
import { TAU } from "./math";

export class Rng {
    readonly random: Random;

    get seed(): number { return this.random.seed; }
    set seed(seed: number) { this.random.seed = seed; }

    constructor(seed?: number | Random) {
        this.random =
            seed instanceof Random
                ? seed
                : new Random(seed);
    }

    nextFloat(): number {
        return this.random.float();
    }

    nextUint(): number {
        return this.random.uint();
    }

    floatRange(min: number, max?: number): number {
        if (typeof max !== 'number') {
            max = min;
            min = 0;
        }

        return min + this.random.float() * (max - min);
    }

    range(min: number, max?: number): number {
        if (typeof max !== 'number') {
            max = min;
            min = 0;
        }

        return Math.floor(this.floatRange(min, max));
    }

    pick<T>(array: readonly T[]): T {
        return array[this.range(0, array.length - 1)];
    }

    sample<T>(
        array: readonly T[],
        count: number,
    ): T[] {
        return this.shuffle(array).slice(0, count);
    }

    shuffle<T>(array: readonly T[]): T[] {
        const result = [...array];

        for (let i = result.length - 1; i > 0; --i) {
            const j = this.range(0, i);

            [result[i], result[j]] =
                [result[j], result[i]];
        }

        return result;
    }

    chance(probability: number): boolean {
        return this.random.float() < probability;
    }

    vector2(): [number, number] {
        const θ = this.random.angle();

        return [
            Math.cos(θ),
            Math.sin(θ),
        ];
    }

    pointOnCircle(radius = 1): [number, number] {
        const θ = this.random.angle();

        return [
            radius * Math.cos(θ),
            radius * Math.sin(θ),
        ];
    }

    pointInCircle(radius = 1): [number, number] {
        const θ = this.random.angle();
        const r = Math.sqrt(this.random.float()) * radius;

        return [
            r * Math.cos(θ),
            r * Math.sin(θ),
        ];
    }

    pointOnSphere(radius = 1): [number, number, number] {
        const u = this.random.float();
        const v = this.random.float();

        const θ = TAU * u;
        const φ = Math.acos(2 * v - 1);

        const s = Math.sin(φ);

        return [
            radius * s * Math.cos(θ),
            radius * s * Math.sin(θ),
            radius * Math.cos(φ),
        ];
    }

    pointInSphere(radius = 1): [number, number, number] {
        const u = this.random.float();
        const v = this.random.float();

        const θ = TAU * u;
        const φ = Math.acos(2 * v - 1);

        const r = radius * Math.cbrt(this.random.float());
        const s = Math.sin(φ);

        return [
            r * s * Math.cos(θ),
            r * s * Math.sin(θ),
            r * Math.cos(φ),
        ];
    }

    gaussian(
        mean = 0,
        standardDeviation = 1,
    ): number {

        let u = 0;
        let v = 0;

        while (u === 0) u = this.random.float();
        while (v === 0) v = this.random.float();

        const z =
            Math.sqrt(-2 * Math.log(u)) *
            Math.cos(TAU * v);

        return mean + z * standardDeviation;
    }

    matrix(
        rows: number,
        columns = rows,
        min = 0,
        max = 1,
    ): number[][] {

        return Array.from(
            { length: rows },
            () =>
                Array.from(
                    { length: columns },
                    () =>
                        this.floatRange(min, max),
                ),
        );
    }

    transformMatrix(
        rows: number,
        columns = rows,
    ): number[][] {

        return this.matrix(rows, columns, -1, 1);
    }

    rgb(): [number, number, number] {
        return [this.range(256), this.range(256), this.range(256)];
    }
}

export const rng = new Rng();
