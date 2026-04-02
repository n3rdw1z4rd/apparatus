import { CanvasRenderer } from "../lib/canvas-renderer";
import { ECS, type Entity } from "../lib/ecs";
import { Input } from "../lib/input";
import { log } from "../lib/log";
import { Camera } from "./camera";
import { CreateBody } from "./factory";
import { drawGrid } from "./grid";
import { DragSystem } from "./systems/drag-system";
import { PickingSystem } from "./systems/picking-system";
import { RenderSystem } from "./systems/render-system";

const GRAVITY_SCALE = 100;
const GRAVITY = { x: 0, y: 9.81 * GRAVITY_SCALE };
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

const clamp = (v: number, l: number, h: number) => Math.min(Math.max(l, v), h);

// function createInitialObjects(ecs: ECS, renderer: CanvasRenderer) {
//     createBox(
//         ecs,
//         0,
//         snapToGrid((renderer.height / 2) - BLOCK_SIZE),
//         2000, BLOCK_SIZE,
//         'green',
//         true,
//     );

//     createBox(ecs,
//         0,
//         snapToGrid((renderer.height / 2) - BLOCK_SIZE),
//         2000, BLOCK_SIZE,
//         'green',
//         true,
//     );

//     createBox(ecs,
//         0, 0,
//         BLOCK_SIZE, BLOCK_SIZE,
//         'red',
//         true,
//     );

//     createBall(ecs,
//         200, -100,
//         BLOCK_SIZE / 2,
//         'orange',
//         // true,
//     )

//     createBox(ecs,
//         64, 64,
//         BLOCK_SIZE * 4, BLOCK_SIZE * 3,
//         'blue',
//     );

//     createBox(ecs,
//         -256, -256,
//         256, BLOCK_SIZE,
//         'magenta',
//     );

//     createBox(ecs,
//         256, -256,
//         256, BLOCK_SIZE,
//         'magenta',
//     );
// }

// function serializeBodies(ecs: ECS) {
//     const bodies = [];

//     const entities = ecs.getEntitiesWith(C.Transform, C.Shape);

//     for (const id of entities) {
//         const transform = ecs.getComponent<Transform>(id, C.Transform);
//         const shape = ecs.getComponent<Shape>(id, C.Shape);

//         if (transform && shape) {
//             bodies.push({ id, transform, shape });
//         }
//     }

//     return bodies;
// }

const ecs = new ECS();
const input = new Input();
const renderer = new CanvasRenderer();
const camera = new Camera();

renderer.appendTo(document.body);
renderer.resize();

const rendererHalfWidth = renderer.width / 2;
const rendererHalfHeight = renderer.height / 2;

// let mode = Mode.Build;
// let lastToggle = false;

// createInitialObjects(ecs, renderer);

// function handleModeToggle(input: Input) {
//     const pressed = input.isDown(' '); // spacebar

//     if (pressed && !lastToggle) {
//         mode = (mode === Mode.Build) ? Mode.Play : Mode.Build;

//         if (mode === Mode.Play) {
//             physics.postMessage('play', {
//                 gravity: GRAVITY,
//                 bodies: serializeBodies(ecs),
//             });
//         } else {
//             physics.postMessage('stop');
//         }
//     }

//     lastToggle = pressed;
// }

// physics.on('step', (data: any) => {
//     const bodies: Map<number, { x: number, y: number, rotation: number }> = new Map();

//     for (let i = 0; i < data.length; i += 4) {
//         const id = data[i];
//         const x = data[i + 1];
//         const y = data[i + 2];
//         const rotation = data[i + 3];

//         bodies.set(id, { x, y, rotation });
//     }

//     const entities = ecs.getEntitiesWith(C.Transform);

//     for (const e of entities) {
//         const body = bodies.get(e);

//         if (body) {
//             const transform = ecs.getComponent<Transform>(e, C.Transform);

//             if (transform) {
//                 const { x, y, rotation } = body;

//                 transform.x = x;
//                 transform.y = y;
//                 transform.rotation = rotation;
//             }
//         }
//     }
// });

CreateBody(ecs, {
    shape: 'box',
    position: { x: -64, y: 0 },
    width: 64,
    height: 64,
    color: 'red',
});

CreateBody(ecs, {
    shape: 'ball',
    position: { x: 64, y: 0 },
    radius: 32,
    color: 'cyan',
});

renderer.setAnimationLoop((_deltaTime: number, fps: number) => {
    renderer.clear();
    renderer.context.save();
    renderer.context.translate(rendererHalfWidth - camera.x, rendererHalfHeight - camera.y);
    renderer.context.scale(camera.zoom, camera.zoom);

    drawGrid(renderer, camera);

    const pickedEntity = PickingSystem(ecs, input, renderer, camera);
    if (pickedEntity) log({ pickedEntity });

    DragSystem(ecs, input, renderer, camera, pickedEntity);

    RenderSystem(ecs, renderer);

    renderer.context.restore();

    renderer.drawText(renderer.width - 10, 10, `fps:${fps}`, { textAlign: 'right' });

    renderer.drawText(renderer.width - 10, 24,
        `camera: x: ${camera.x.toFixed(0)}, y: ${camera.y.toFixed(0)}, zoom: ${camera.zoom.toFixed(1)}`,
        { textAlign: 'right' },
    );
});

// input.on('pointermove', (ev: PointerEvent) => {
//     if (input.pointerDown/** && !dragging && !picked*/) {
//         const { movementX, movementY } = ev;

//         camera.x -= movementX;
//         camera.y -= movementY;
//     }
// });

input.on('wheel', (ev: WheelEvent) => {
    camera.zoom = clamp(camera.zoom - (ev.deltaY * 0.01), ZOOM_MIN, ZOOM_MAX);
});
