import { addNode, connect, createGraph, type GraphDoc, type NodeRegistry } from '@n3rdw1z4rd/core/graph';

/** The graph a new editor starts with: a plinko board, a row of balls and an animated spinner. */
export function exampleGraph(registry: NodeRegistry): GraphDoc {
    const g = createGraph();
    const add = (type: string, x: number, y: number, values: Record<string, unknown> = {}) => addNode(g, registry.get(type)!, [x, y], values);
    const link = (a: { id: string }, out: string, b: { id: string }, inp: string) => connect(g, registry, { node: a.id, port: out }, { node: b.id, port: inp });

    // pegs: a staggered grid of fixed balls
    const pegGrid = add('list/grid2d', 0, 0, { cols: 13, rows: 7, spacing: { x: 40, y: 40 }, center: { x: 0, y: 20 }, stagger: true });
    const peg = add('shape/ball', 260, 0, { radius: 4, color: '#5b6b73' });
    const pegBody = add('physics/body', 500, 0, { fixed: true });
    link(pegGrid, 'points', peg, 'at');
    link(peg, 'entity', pegBody, 'entity');

    // floor
    const floor = add('shape/box', 260, 230, { at: { x: 0, y: -200 }, size: { x: 620, y: 20 }, color: '#5b6b73' });
    const floorBody = add('physics/body', 500, 230, { fixed: true });
    link(floor, 'entity', floorBody, 'entity');

    // balls to drop
    const dropGrid = add('list/grid2d', 0, 420, { cols: 7, rows: 2, spacing: { x: 22, y: 22 }, center: { x: 6, y: 210 } });
    const drop = add('shape/ball', 260, 420, { radius: 8, color: '#f2a541' });
    const dropBody = add('physics/body', 500, 420, { bounce: 0.4 });
    link(dropGrid, 'points', drop, 'at');
    link(drop, 'entity', dropBody, 'entity');

    // an animated spinner (no body: it only draws, so the graph keeps driving it while playing)
    const time = add('value/time', 0, 650, { speed: 1 });
    const turn = add('math/math', 260, 650, { b: 90, op: '×' });
    const spinner = add('shape/box', 500, 650, { at: { x: 0, y: 280 }, size: { x: 120, y: 8 }, color: '#3fd1a4' });
    link(time, 'time', turn, 'a');
    link(turn, 'result', spinner, 'angle');

    const scene = add('scene/scene2d', 760, 300);
    link(pegBody, 'entity', scene, 'entities');
    link(floorBody, 'entity', scene, 'entities');
    link(dropBody, 'entity', scene, 'entities');
    link(spinner, 'entity', scene, 'entities');

    const viewport = add('output/viewport', 1000, 120);
    viewport.size = [480, 420];
    link(scene, 'scene', viewport, 'scene');
    return g;
}
