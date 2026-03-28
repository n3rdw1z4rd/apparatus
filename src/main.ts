import { Camera } from "./camera";
import { Input } from "./lib/input";
import { CanvasRenderer } from "./lib/canvas-renderer";
import { ECS } from "./lib/ecs";
import { renderSystem } from "./systems/render-system";
import { Mode } from "./mode";
import { dragSystem } from "./systems/drag-system";
import { drawGrid, GRID_CELL_SIZE, snapToGrid } from "./grid";
import { buildPickablesSystem } from "./systems/pickables-system";
import { createBox } from "./part-factory";
import { WorkerInterface } from "./lib/worker-interface";
import { log } from "./lib/log";
import { C } from "./components";
import type { Shape } from "./components/shape";
import type { Transform } from "./components/transform";

const GRAVITY_SCALE = 100;
const GRAVITY = { x: 0, y: 9.81 * GRAVITY_SCALE };
const BLOCK_SIZE = GRID_CELL_SIZE;

function createInitialObjects(ecs: ECS, renderer: CanvasRenderer) {
    createBox(
        ecs,
        0,
        snapToGrid((renderer.height / 2) - BLOCK_SIZE),
        2000, BLOCK_SIZE,
        'green',
        true,
    );

    createBox(ecs,
        0,
        snapToGrid((renderer.height / 2) - BLOCK_SIZE),
        2000, BLOCK_SIZE,
        'green',
        true,
    );

    createBox(ecs,
        0, 0,
        BLOCK_SIZE, BLOCK_SIZE,
        'red',
        true,
    );

    createBox(ecs,
        64, 64,
        BLOCK_SIZE * 4, BLOCK_SIZE * 3,
        'blue',
    );

    createBox(ecs,
        -256, -256,
        256, BLOCK_SIZE,
        'magenta',
    );

    createBox(ecs,
        256, -256,
        256, BLOCK_SIZE,
        'magenta',
    );
}

function serializeBodies(ecs: ECS) {
    const bodies = [];

    const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

    for (const e of entities) {
        const transform = ecs.getComponent<Transform>(e, C.Transform);
        const shape = ecs.getComponent<Shape>(e, C.Shape);

        if (transform && shape) {
            bodies.push({
                id: e,
                x: transform.x,
                y: transform.y,
                rotation: transform.rotation,
                width: shape.width,
                height: shape.height,
                fixed: transform.fixed,
            });
        }
    }

    return bodies;
}

const physics = new WorkerInterface('/src/physics-worker.ts');

physics.on('info', (msg: string) => log('[physics] INFO:', msg));
physics.on('warning', (msg: string) => log('[physics] WARNING:', msg));

physics.on('loaded', () => {
    log('physics loaded!');

    // physics.postMessage('create_world', GRAVITY);

    const ecs = new ECS();

    const input = new Input();
    const renderer = new CanvasRenderer();
    const camera = new Camera();

    renderer.appendTo(document.body);
    renderer.resize();

    let mode = Mode.Build;
    let lastToggle = false;

    createInitialObjects(ecs, renderer);

    function handleModeToggle(input: Input) {
        const pressed = input.isDown(' '); // spacebar

        if (pressed && !lastToggle) {
            mode = (mode === Mode.Build) ? Mode.Play : Mode.Build;

            if (mode === Mode.Play) {
                physics.postMessage('play', {
                    gravity: GRAVITY,
                    bodies: serializeBodies(ecs),
                });
            } else {
                physics.postMessage('stop');
            }
        }

        lastToggle = pressed;
    }

    physics.on('step', (data: any) => {
        log({ step: data });
        const bodies: Map<number, { x: number, y: number, rotation: number }> = new Map();

        for (let i = 0; i < data.length; i += 4) {
            const id = data[i];
            const x = data[i + 1];
            const y = data[i + 2];
            const rotation = data[i + 3];

            bodies.set(id, { x, y, rotation });
        }

        const entities = ecs.getEntitiesWith(C.Transform);

        for (const e of entities) {
            const body = bodies.get(e);

            if (body) {
                const transform = ecs.getComponent<Transform>(e, C.Transform);

                if (transform) {
                    const { x, y, rotation } = body;

                    transform.x = x;
                    transform.y = y;
                    transform.rotation = rotation;
                }
            }
        }
    });

    renderer.setAnimationLoop((deltaTime: number, fps: number) => {
        handleModeToggle(input);

        renderer.clear();
        // renderer.resize(); // this is kinda expensive

        renderer.context.save();

        renderer.context.translate(renderer.width / 2, renderer.height / 2);
        renderer.context.scale(camera.zoom, camera.zoom);
        renderer.context.translate(-camera.x, -camera.y);

        drawGrid(renderer, camera);

        if (mode === Mode.Build) {
            buildPickablesSystem(ecs, renderer);
            dragSystem(ecs, input, renderer, camera);
        }

        renderSystem(ecs, renderer);

        // if (mode === Mode.Build) {
        //     renderAnchors(ecs, renderer);
        //     renderJoints(ecs, renderer);
        // }

        renderer.context.restore();

        renderer.drawText(10, 20, `Mode: ${mode.toUpperCase()}`, {
            size: 16,
            color: (mode === Mode.Build ? 'green' : 'red'),
        });

        renderer.drawText(10, 36, 'Space: toggle Mode', {
            size: 12,
            color: 'white',
        });

        renderer.drawText(renderer.width - 60, 10, `fps:${fps}`);

        if (mode === Mode.Build) {
            renderer.drawText(10, 50, 'Mouse: move stuff!', {
                size: 12,
                color: 'white',
            });
        }
    });
});
