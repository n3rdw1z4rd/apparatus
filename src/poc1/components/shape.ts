import type { Color } from "../../lib/canvas-renderer";

interface BaseShape {
    color: Color;
}

export interface BoxShape extends BaseShape {
    type: 'rectangle';
    width: number;
    height: number;
}

export interface BallShape extends BaseShape {
    type: 'circle',
    radius: number,
}

export type Shape = BoxShape | BallShape;
