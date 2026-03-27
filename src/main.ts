import { Camera } from "./camera";
import { GetRapier, type Rapier } from "./lib/rapier";
import { Input } from "./lib/input";
import { CanvasRenderer } from "./lib/canvas-renderer";
import { ECS } from "./lib/ecs";
import { physicsSystem } from "./systems/physics-system";
import { renderSystem } from "./systems/render-system";
import { Mode } from "./mode";
import { dragSystem } from "./systems/drag-system";
import { drawGrid, GRID_CELL_SIZE, snapToGrid } from "./grid";
// import { createJoints, jointSystem, renderJoints } from "./systems/joint-system";
// import { renderAnchors } from "./systems/anchor-system";
import { buildPickablesSystem } from "./systems/pickables-system";
import { createBox } from "./part-factory";
import type { World } from "@dimforge/rapier2d";

const FIXED_DT = 1 / 60;
const GRAVITY_SCALE = 100;
const GRAVITY = { x: 0, y: 9.81 * GRAVITY_SCALE };
const BLOCK_SIZE = GRID_CELL_SIZE;

function createInitialObjects(rapier: Rapier, world: World, ecs: ECS, renderer: CanvasRenderer) {
    createBox(
        rapier, world, ecs,
        0,
        snapToGrid((renderer.height / 2) - BLOCK_SIZE),
        2000, BLOCK_SIZE,
        'green',
        true,
    );

    createBox(
        rapier, world, ecs,
        0, 0,
        BLOCK_SIZE, BLOCK_SIZE,
        'red',
        true,
    );

    createBox(
        rapier, world, ecs,
        64, 64,
        BLOCK_SIZE * 4, BLOCK_SIZE * 3,
        'blue',
    );

    createBox(
        rapier, world, ecs,
        -256, -256,
        256, BLOCK_SIZE,
        'magenta',
    );

    createBox(
        rapier, world, ecs,
        256, -256,
        256, BLOCK_SIZE,
        'magenta',
    );
}

GetRapier().then((rapier: Rapier) => {
    const ecs = new ECS();
    const world = new rapier.World(GRAVITY);
    const input = new Input();
    const renderer = new CanvasRenderer();
    const camera = new Camera();

    renderer.appendTo(document.body);
    renderer.resize();

    createInitialObjects(rapier, world, ecs, renderer);

    let mode = Mode.Build;
    let lastToggle = false;

    function handleModeToggle(input: Input) {
        const pressed = input.isDown(' '); // spacebar

        if (pressed && !lastToggle) {
            mode = (mode === Mode.Build) ? Mode.Play : Mode.Build;

            // if (mode === Mode.Play) createJoints(ecs, rapier, world);
        }

        lastToggle = pressed;
    }

    let lastTime = 0;
    let accumulator = 0;

    const update = (time: DOMHighResTimeStamp = 0) => {
        const deltaTime = Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        handleModeToggle(input);

        accumulator += deltaTime;

        while (accumulator >= FIXED_DT) {
            if (mode === Mode.Play) {
                world.step();
                physicsSystem(ecs);
            }

            accumulator -= FIXED_DT;
        }

        // camera follow example
        // const { x, y } = plank.body.translation();
        // camera.x = x;
        // camera.y = y;

        renderer.clear();
        renderer.resize();

        renderer.context.save();

        renderer.context.translate(renderer.width / 2, renderer.height / 2);
        renderer.context.scale(camera.zoom, camera.zoom);
        renderer.context.translate(-camera.x, -camera.y);

        drawGrid(renderer);

        if (mode === Mode.Build) {
            buildPickablesSystem(ecs, renderer);
            dragSystem(ecs, input, renderer, camera);
            // jointSystem(ecs, input, renderer, camera);
        }

        renderSystem(ecs, renderer);

        if (mode === Mode.Build) {
            // renderAnchors(ecs, renderer);
            // renderJoints(ecs, renderer);
        }

        renderer.context.restore();

        renderer.drawText(10, 20, `Mode: ${mode.toUpperCase()}`, {
            size: 16,
            color: (mode === Mode.Build ? 'green' : 'red'),
        });

        renderer.drawText(10, 36, 'Space: toggle Mode', {
            size: 12,
            color: 'white',
        });

        if (mode === Mode.Build) {
            renderer.drawText(10, 50, 'Mouse: move stuff!', {
                size: 12,
                color: 'white',
            });
        }

        requestAnimationFrame(update);
    };

    update();
});
