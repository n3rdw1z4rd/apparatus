import type { Color } from "../lib/canvas-renderer";

export interface Shape {
    type: 'rectangle' | 'circle';
    width: number;
    height: number;
    color: Color;
}
