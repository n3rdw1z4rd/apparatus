import type { Color } from "../lib/canvas-renderer";

export const C = {
    Transform: "Transform",
    Shape: "Shape",
};

interface BaseShape {
    color: Color;
}

export interface BoxShape extends BaseShape {
    type: 'box';
    width: number;
    height: number;
}

export interface BallShape extends BaseShape {
    type: 'ball',
    radius: number,
}

export type Shape = BoxShape | BallShape;

export interface Transform {
    position: XY;
    rotation: number;
}
