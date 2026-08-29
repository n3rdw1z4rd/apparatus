import { Vector } from './vector';
import { clamp, PI, TAU } from './math';
import { Observable } from '@n3rdw1z4rd/smoke-ui';

export type CanvasColor = string | CanvasGradient | CanvasPattern;

export const DEFAULT_COLOR: CanvasColor = 'white';
export const DEFAULT_PIXEL_SIZE: number = 1;

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_NAME = 'monospace';
export const DEFAULT_FONT = `${DEFAULT_FONT_SIZE}px ${DEFAULT_FONT_NAME}`;
export const DEFAULT_TEXTALIGN = 'left';
export const DEFAULT_TEXTBASELINE = 'alphabetic';

export interface DrawParams {
    color?: CanvasColor,
    filled?: boolean,
    size?: number,
    lineDash?: number[],
    textAlign?: CanvasTextAlign,
    textBaseline?: CanvasTextBaseline,
    font?: string,
    fontName?: string,
}

export interface SpriteParams extends DrawParams {
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
}

export class CanvasRenderer {
    readonly onResized = new Observable();

    context: CanvasRenderingContext2D;

    get canvas(): HTMLCanvasElement { return this.context.canvas; }
    get width(): number { return this.canvas.width; }
    get height(): number { return this.canvas.height; }

    constructor(canvas?: HTMLCanvasElement) {
        this.context = (canvas ?? document.createElement('canvas'))
            .getContext('2d')!;

        this.context.font = DEFAULT_FONT;
        this.context.textAlign = DEFAULT_TEXTALIGN;
        this.context.textBaseline = DEFAULT_TEXTBASELINE;
    }

    resize(width?: number, height?: number) {
        width = width ?? this.canvas.parentElement?.clientWidth ?? this.width;
        height = height ?? this.canvas.parentElement?.clientHeight ?? this.height;

        if (this.canvas.width != width || this.canvas.height != height) {
            this.canvas.width = width;
            this.canvas.height = height;

            this.onResized.notify(width, height);
        }
    }

    clear() {
        this.context.clearRect(0, 0, this.width, this.height);
    }

    render(callback: () => void, position?: Vector, scale: number = 1) {
        position = position ?? new Vector();

        this.clear();
        this.context.save();

        this.context.translate(this.width / 2, this.height / 2);
        this.context.scale(scale, scale);
        this.context.translate(-position.x, -position.y);

        callback();

        this.context.restore();
    }

    private drawPath(buildPath: () => void, params: DrawParams = {}) {
        this.context.fillStyle = params.color ?? DEFAULT_COLOR;
        this.context.strokeStyle = params.color ?? DEFAULT_COLOR;
        this.context.lineWidth = params.size ?? 1;

        if (params.lineDash) {
            this.context.setLineDash(params.lineDash);
        }

        this.context.beginPath();
        buildPath();
        this.context.stroke();

        if (params.filled) {
            this.context.fill();
        }

        if (params.lineDash) {
            this.context.setLineDash([]);
        }
    }

    drawRect(x: number, y: number, width: number, height: number, params: DrawParams = {}) {
        x -= (width / 2);
        y -= (height / 2);

        this.context.fillStyle = params.color ?? DEFAULT_COLOR;
        this.context.strokeStyle = params.color ?? DEFAULT_COLOR;
        this.context.lineWidth = params.size ?? 1;

        if (params.lineDash) {
            this.context.setLineDash(params.lineDash);
        }

        this.context.beginPath();

        this.context.strokeRect(x, y, width, height);

        if (params.filled) {
            this.context.fillRect(x, y, width, height);
        }

        if (params.lineDash) {
            this.context.setLineDash([]);
        }
    }

    drawPixel(x: number, y: number, params: DrawParams = {}) {
        const size = Math.abs(params.size || DEFAULT_PIXEL_SIZE);

        this.drawRect(x, y, size, size, {
            ...params,
            filled: true,
        });
    }

    drawLine(x1: number, y1: number, x2: number, y2: number, params: DrawParams = {}) {
        this.context.strokeStyle = params.color ?? DEFAULT_COLOR;
        this.context.lineWidth = params.size ?? 1;

        if (params.lineDash) {
            this.context.setLineDash(params.lineDash);
        }

        this.context.beginPath();
        this.context.moveTo(x1, y1);
        this.context.lineTo(x2, y2);
        this.context.stroke();

        if (params.lineDash) {
            this.context.setLineDash([]);
        }
    }

    drawCircle(x: number, y: number, radius: number, params: DrawParams = {}) {
        this.drawPath(() => {
            this.context.arc(x, y, radius, 0, TAU);
        }, params);
    }

    drawPolygon(
        x: number,
        y: number,
        radius: number,
        sides: number,
        params: DrawParams = {}
    ) {
        sides = Math.floor(clamp(sides, 3, 36));

        this.drawPath(() => {
            for (let i = 0; i < sides; i++) {
                const angle = (i / sides) * TAU - PI / 2;

                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;

                if (i === 0) {
                    this.context.moveTo(px, py);
                } else {
                    this.context.lineTo(px, py);
                }
            }

            this.context.closePath();
        }, params);
    }

    drawText(x: number, y: number, text: string, params: DrawParams = {}) {
        this.context.font = params.font ??
            `${params.size ?? DEFAULT_FONT_SIZE}px ${params.fontName ?? DEFAULT_FONT_NAME}`;

        this.context.textAlign = params.textAlign ?? DEFAULT_TEXTALIGN;
        this.context.textBaseline = params.textBaseline ?? DEFAULT_TEXTBASELINE;
        this.context.fillStyle = params.color ?? DEFAULT_COLOR;
        this.context.fillText(text, x, y);
    }

    drawSprite(
        x: number,
        y: number,
        image: CanvasImageSource,
        width: number,
        height: number,
        params: SpriteParams = {}
    ) {
        x -= (width / 2);
        y -= (height / 2);

        if (params.sourceWidth !== undefined && params.sourceHeight !== undefined) {
            this.context.drawImage(
                image,
                params.sourceX ?? 0,
                params.sourceY ?? 0,
                params.sourceWidth,
                params.sourceHeight,
                x, y, width, height,
            );
        } else {
            this.context.drawImage(image, x, y, width, height);
        }
    }
}
