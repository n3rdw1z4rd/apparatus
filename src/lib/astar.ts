import type { Map2D } from './map2d';
import { Map3D } from './map3d';
import type { XY } from './types';

export interface AStarFindPathParams {
    walkableValues?: number[];
}

interface Node {
    pos: XY;
    g: number;
    h: number;
    f: number;
    parent?: Node;
}

const DIRECTIONS_4_WAY: XY[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
];

export class AStar {
    map: Map2D | Map3D;

    constructor(map: Map2D | Map3D) {
        this.map = map;
    }

    private _manhattan(a: XY, b: XY): number {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    private _isWalkable(point: XY, walkable: number[] = [0]): boolean {
        const value = this.map.get(point.x, point.y);
        return walkable.includes(value);
    }

    private _key(x: number, y: number): string {
        return `${x},${y}`;
    }

    findPath(a: XY, b: XY, params: AStarFindPathParams = {}): XY[] {
        const walkable = params.walkableValues ?? [0];

        const openSet: Node[] = [];
        const closedSet = new Set<string>();
        const nodeMap = new Map<string, Node>();

        const startNode: Node = {
            pos: a,
            g: 0,
            h: this._manhattan(a, b),
            f: this._manhattan(a, b),
        };

        openSet.push(startNode);
        nodeMap.set(this._key(a.x, a.y), startNode);

        const targetKeys = new Set<string>();
        targetKeys.add(this._key(b.x, b.y));

        for (const dir of DIRECTIONS_4_WAY) {
            const nx = b.x + dir.x;
            const ny = b.y + dir.y;

            targetKeys.add(this._key(nx, ny));
        }

        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);

            const current = openSet.shift()!;
            const currentKey = this._key(current.pos.x, current.pos.y);

            if (targetKeys.has(currentKey)) {
                const path: XY[] = [];

                let curr: Node | undefined = current;

                while (curr) {
                    path.push(curr.pos);
                    curr = curr.parent;
                }

                path.pop();

                return path.reverse();
            }

            closedSet.add(currentKey);

            for (const dir of DIRECTIONS_4_WAY) {
                const neighborPos: XY = {
                    x: current.pos.x + dir.x,
                    y: current.pos.y + dir.y,
                };

                const key = this._key(neighborPos.x, neighborPos.y);

                if (!this._isWalkable(neighborPos, walkable) || closedSet.has(key)) {
                    continue;
                }

                const g = current.g + 1;
                let neighbor = nodeMap.get(key);

                if (!neighbor) {
                    neighbor = {
                        pos: neighborPos,
                        g,
                        h: this._manhattan(neighborPos, b),
                        f: g + this._manhattan(neighborPos, b),
                        parent: current,
                    };

                    nodeMap.set(key, neighbor);
                    openSet.push(neighbor);
                } else if (g < neighbor.g) {
                    neighbor.g = g;
                    neighbor.f = g + neighbor.h;
                    neighbor.parent = current;
                }
            }
        }

        return [];
    }
}
