import { Camera } from "./camera";
import { Input } from "./lib/input";
import { CanvasRenderer } from "./lib/canvas-renderer";
import { ECS } from "./lib/ecs";
import { renderSystem } from "./systems/render-system";
import { Mode } from "./mode";
import { dragSystem } from "./systems/drag-system";
import { drawGrid, GRID_CELL_SIZE, snapToGrid } from "./grid";
import { buildPickablesSystem } from "./systems/pickables-system";
import { createBall, createBox } from "./part-factory";
import { loginf, logwrn, logerr } from "@n3rdw1z4rd/core";
import { PhysicsWorld } from "./physics-world";

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

    createBall(ecs,
        200, -100,
        BLOCK_SIZE / 2,
        'orange',
        // true,
    )

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

const physics = new PhysicsWorld();

physics.on('log', (level: 'info' | 'warn' | 'error', msg: string) => {
    const fn = level === 'error' ? logerr : level === 'warn' ? logwrn : loginf;
    fn('[physics]', msg);
});

physics.on('error', (err: ErrorEvent) => logerr('[physics] ERROR:', err));

// NOTE: physics-worker.ts was rewritten for rapier3d with a new command
// protocol (see physics-protocol.ts) - it no longer speaks the old 2D
// play/stop message shape this file used to send. Wiring build-mode bodies
// into the new addBody()/start() API is 3D game-mechanics work that hasn't
// happened yet, so play mode is disabled here for now: it still toggles the
// UI label, but doesn't touch the worker. Build mode (drag/pick on canvas)
// is unaffected and still works standalone.
physics.on('ready', () => {
    loginf('physics ready')
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

            // TODO: drive physics.createWorld()/addBody()/start()/pause()
            // here once there's a 3D body representation to send. For now
            // this just flips the UI mode label.
        }

        lastToggle = pressed;
    }

    // Step buffer format is now [id, x, y, z, qx, qy, qz, qw] per body
    // (physics-protocol.ts STEP_STRIDE) - nothing consumes it yet since no
    // bodies are ever added to the worker in this file currently.
    physics.on('step', (_data: Float32Array) => { });

    renderer.setAnimationLoop((_deltaTime: number, fps: number) => {
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
