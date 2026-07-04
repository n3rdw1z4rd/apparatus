const DEG2RAD = 0.01745329;

export const PI = 3.14159265358979323846;

const TWO_PI = PI * 2;
const HALF_PI = PI / 2;

export type VEC2 = [number, number];
export type VEC3 = VEC2 & [number];
export type VEC4 = VEC3 & [number];

export type COLOR = VEC3;

export function abs(n: number): number {
    return n < 0 ? -n : n;
}

export function min(a: number, b: number): number {
    return a < b ? a : b;
}

export function max(a: number, b: number): number {
    return a > b ? a : b;
}

export function floor(n: number): number {
    const t = n | 0;                       // truncates toward zero
    return (n < 0 && t !== n) ? t - 1 : t; // correct for negatives too
}

export function ceil(n: number): number {
    const t = n | 0;
    return (n > 0 && t !== n) ? t + 1 : t;
}

export function round(n: number): number {
    return floor(n + 0.5);
}

export function sqrt(n: number): number {
    return n ** 0.5;
}

export function pow(base: number, exp: number): number {
    return base ** exp;
}

export function hypot2(x: number, y: number): number {
    return (x * x + y * y) ** 0.5;
}

export function hypot3(x: number, y: number, z: number): number {
    return (x * x + y * y + z * z) ** 0.5;
}

export function imul(a: number, b: number): number {
    b |= 0;
    let result = (a & 0x003fffff) * b;
    if (a & 0xffc00000) result += ((a & 0xffc00000) * b) | 0;
    return result | 0;
}

function wrapAngle(n: number): number {
    n = n % TWO_PI;

    if (n > PI) n -= TWO_PI;
    else if (n < -PI) n += TWO_PI;

    return n;
}

// Taylor series about 0, accurate to <1e-9 over [0, PI/2] (the series converges
// much slower near +-PI, so callers must reduce to that range first).
function sinSeries(n: number): number {
    const n2 = n * n;

    return n * (1 + n2 * (
        -1 / 6 + n2 * (
            1 / 120 + n2 * (
                -1 / 5040 + n2 * (
                    1 / 362880 + n2 * (-1 / 39916800)
                )
            )
        )
    ));
}

function cosSeries(n: number): number {
    const n2 = n * n;

    return 1 + n2 * (
        -1 / 2 + n2 * (
            1 / 24 + n2 * (
                -1 / 720 + n2 * (
                    1 / 40320 + n2 * (-1 / 3628800)
                )
            )
        )
    );
}

// Reduces n to [0, PI/2] via wrapping + odd/even + quadrant-fold symmetry, and
// returns the sign flips needed to reconstruct sin/cos of the original angle.
function reduceAngle(n: number): [x: number, sinSign: number, cosSign: number] {
    let x = wrapAngle(n);

    let sinSign = 1;
    if (x < 0) {
        x = -x;
        sinSign = -1;
    }

    let cosSign = 1;
    if (x > HALF_PI) {
        x = PI - x;
        cosSign = -1;
    }

    return [x, sinSign, cosSign];
}

export function sin(n: number): number {
    const [x, sinSign] = reduceAngle(n);
    return sinSign * sinSeries(x);
}

export function cos(n: number): number {
    const [x, , cosSign] = reduceAngle(n);
    return cosSign * cosSeries(x);
}

export function clamp(value: number, lo: number, hi: number): number {
    return max(lo, min(hi, value));
}

export function deg2rad(value: number): number {
    return value * DEG2RAD;
}

export function lerp(start: number, end: number, scale: number): number {
    return start * (1 - scale) + end * scale;
}
