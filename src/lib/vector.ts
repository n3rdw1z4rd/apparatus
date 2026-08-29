import { distance2d } from "./math";
import type { XY } from "./types";

export class Vector {
    x: number;
    y: number;

    constructor(x: number = 0, y: number = 0) {
        this.x = x;
        this.y = y;
    }

    clone(): Vector {
        return new Vector(this.x, this.y);
    }

    copy(that: Vector): this {
        this.x = that.x;
        this.y = that.y;

        return this;
    }

    copyTo(target: { x: number; y: number }): this {
        target.x = this.x;
        target.y = this.y;

        return this;
    }

    set(x: number, y: number): this {
        this.x = x;
        this.y = y;

        return this;
    }

    equals(that: Vector): boolean {
        return this.x === that.x && this.y === that.y;
    }

    distanceTo(that: Vector): number {
        return distance2d(
            this.x, this.y,
            that.x, that.y,
        );
    }

    length(): number {
        return Math.hypot(this.x, this.y);
    }

    normalize(): this {
        const length = this.length();

        if (length > 0) {
            this.dividedBy(length);
        }

        return this;
    }

    setLength(length: number): this {
        return this.normalize().times(length);
    }

    dot(that: Vector): number {
        return (this.x * that.x) + (this.y * that.y);
    }

    angle(): number {
        return Math.atan2(this.y, this.x);
    }

    angleTo(that: Vector): number {
        const denominator = this.length() * that.length();

        if (denominator === 0) {
            return 0;
        }

        const theta = this.dot(that) / denominator;

        return Math.acos(Math.min(1, Math.max(-1, theta)));
    }

    rotate(radians: number): this {
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);

        const { x, y } = this;

        this.x = x * cos - y * sin;
        this.y = x * sin + y * cos;

        return this;
    }

    rotateAround(origin: Vector, radians: number): this {
        return this
            .minus(origin)
            .rotate(radians)
            .plus(origin);
    }

    floored(): Vector {
        return new Vector(
            Math.floor(this.x),
            Math.floor(this.y),
        );
    }

    plus(x: number | Vector, y?: number): this {
        if (x instanceof Vector) {
            y = x.y;
            x = x.x;
        } else if (y === undefined) {
            y = x;
        }

        this.x += x;
        this.y += y;

        return this;
    }

    minus(x: number | Vector, y?: number): this {
        if (x instanceof Vector) {
            y = x.y;
            x = x.x;
        } else if (y === undefined) {
            y = x;
        }

        this.x -= x;
        this.y -= y;

        return this;
    }

    times(x: number | Vector, y?: number): this {
        if (x instanceof Vector) {
            y = x.y;
            x = x.x;
        } else if (y === undefined) {
            y = x;
        }

        this.x *= x;
        this.y *= y;

        return this;
    }

    dividedBy(x: number | Vector, y?: number): this {
        if (x instanceof Vector) {
            y = x.y;
            x = x.x;
        } else if (y === undefined) {
            y = x;
        }

        this.x /= (x || 1);
        this.y /= (y || 1);

        return this;
    }

    static from(value: XY): Vector {
        return new Vector(value.x, value.y);
    }

    static get ZERO(): Vector { return new Vector(0, 0); }
    static get NORTH(): Vector { return new Vector(0, -1); }
    static get SOUTH(): Vector { return new Vector(0, 1); }
    static get EAST(): Vector { return new Vector(1, 0); }
    static get WEST(): Vector { return new Vector(-1, 0); }
}