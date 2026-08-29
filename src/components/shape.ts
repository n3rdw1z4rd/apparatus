import { Color } from "@n3rdw1z4rd/core";

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
