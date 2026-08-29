export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const QUARTER_PI = Math.PI / 4;

export const E = Math.E;

export const DEG2RAD = PI / 180;
export const RAD2DEG = 180 / PI;

export const LN2 = Math.LN2;
export const LN10 = Math.LN10;
export const LOG2E = Math.LOG2E;
export const LOG10E = Math.LOG10E;

export const SQRT2 = Math.SQRT2;
export const SQRT1_2 = Math.SQRT1_2;

export const EPSILON = Number.EPSILON;

export const clamp = (value: number, minValue: number, maxValue: number): number =>
    Math.min(Math.max(value, minValue), maxValue);

export const saturate = (value: number): number =>
    clamp(value, 0, 1);

export const lerp = (start: number, end: number, t: number): number =>
    start + (end - start) * t;

export const inverseLerp = (start: number, end: number, value: number): number =>
    (value - start) / (end - start);

// export const map = (
//     value: number,
//     inMin: number,
//     inMax: number,
//     outMin: number,
//     outMax: number
// ): number =>
//     outMin +
//     ((value - inMin) * (outMax - outMin)) /
//     (inMax - inMin);

export const smoothstep = (edge0: number, edge1: number, value: number): number => {
    const t = saturate((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
};

export const fract = (value: number): number =>
    value - Math.floor(value);

export const mod = (value: number, divisor: number): number =>
    ((value % divisor) + divisor) % divisor;

export const wrap = (value: number, minValue: number, maxValue: number): number => {
    const range = maxValue - minValue;
    return minValue + mod(value - minValue, range);
};

export const radians = (degrees: number): number => degrees * DEG2RAD;
export const degrees = (radians: number): number => radians * RAD2DEG;
export const normalizeRadians = (radians: number): number => wrap(radians, -PI, PI);

export const distance2d = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): number => Math.hypot(x2 - x1, y2 - y1);

export const distance3d = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number
): number => Math.hypot(x2 - x1, y2 - y1, z2 - z1);

export const squaredDistance = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number => {
    const dx = x2 - x1;
    const dy = y2 - y1;

    return dx * dx + dy * dy;
};

export const manhattanDistance = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
): number =>
    Math.abs(x2 - x1) + Math.abs(y2 - y1);

export const nearlyEqual = (
    a: number,
    b: number,
    epsilon = EPSILON
): boolean =>
    Math.abs(a - b) <= epsilon;

export const roundTo = (
    value: number,
    digits = 0
): number => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

export const hash32 = (n: number): number => {
    n |= 0;

    n ^= n >>> 16;
    n = Math.imul(n, 0x85ebca6b);

    n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35);

    n ^= n >>> 16;

    return n >>> 0;
};

export const hash32mix = (...values: number[]): number => {
    let n = 0;

    for (const value of values) {
        n ^= value | 0;
        n = hash32(n);
    }

    return n;
};
