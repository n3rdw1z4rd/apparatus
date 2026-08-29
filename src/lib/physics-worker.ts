// import { GetRapier, type Rapier } from "./lib/rapier";
// import { RigidBody, World, type Vector } from "@dimforge/rapier2d";

// const INTERVAL_TIME = 1000 / 60;

// const post = (type: string, payload?: any, options?: WindowPostMessageOptions | undefined) => self.postMessage({ type, payload }, options);

// let isLoaded: boolean = false;
// let isRunning: boolean = false;

// let rapier: Rapier;
// let world: World | null = null;
// let gravity: Vector = { x: 0, y: 9.81 };

// let intervalHandle: number;

// const bodies: Map<number, number> = new Map();

// GetRapier().then((RAPIER: Rapier) => {
//     rapier = RAPIER;
//     isLoaded = true;
//     post('loaded');
// });

// const stop = () => {
//     if (isRunning) {
//         clearInterval(intervalHandle);
//         isRunning = false;
//         post('info', 'world stopped');
//     }
// };

// const resetWorld = () => {
//     stop();

//     if (world) {
//         world.free();
//         world = null;
//     }

//     bodies.clear();

//     world = new World(gravity);

//     post('info', 'world reset');
// };

// const run = () => {
//     if (isLoaded) {
//         if (world) {
//             if (!isRunning) {

//                 intervalHandle = setInterval(() => {
//                     world!.step();

//                     const bodyCount = world!.bodies.len();
//                     const buffer = new Float32Array(bodyCount * 4);

//                     let i = 0;

//                     world!.bodies.forEach((body: RigidBody) => {
//                         const { x, y } = body.translation();
//                         const rotation = body.rotation();
//                         const id = bodies.get(body.handle) ?? -1;

//                         buffer[i++] = id;
//                         buffer[i++] = x;
//                         buffer[i++] = y;
//                         buffer[i++] = rotation;
//                     });

//                     post('step', buffer, { transfer: [buffer.buffer] });
//                 }, INTERVAL_TIME);

//                 isRunning = true;
//                 post('info', 'world started');
//             }
//         }
//     }
// };

// const createBody = (payload: any) => {
//     if (isLoaded) {
//         if (world) {
//             const { id, transform, shape } = payload;
//             const { x, y, rotation, fixed } = transform;

//             const body = world.createRigidBody(
//                 (fixed
//                     ? rapier.RigidBodyDesc.fixed()
//                     : rapier.RigidBodyDesc.dynamic()
//                 ).setTranslation(x, y).setRotation(rotation),
//             );

//             switch (shape.type) {
//                 case 'rectangle':
//                     world.createCollider(
//                         rapier.ColliderDesc.cuboid(shape.width / 2, shape.height / 2),
//                         body,
//                     );

//                     break;

//                 case 'circle':
//                     world.createCollider(
//                         rapier.ColliderDesc.ball(shape.radius),
//                         body,
//                     );

//                     break;

//                 default: break;
//             }


//             bodies.set(body.handle, id);

//             post('info', `body created: (${body.handle}):  ${id}`);
//         } else post('warning', 'createBody: world not created');
//     } else post('warning', 'createBody: rapier not loaded');
// };

// const play = (payload: { gravity: Vector, bodies: any[] }) => {
//     if (!isLoaded) {
//         post('warning', 'play: rapier not loaded');
//         return;
//     }

//     gravity = payload.gravity ?? gravity;

//     resetWorld();

//     for (const body of payload.bodies) {
//         createBody(body);
//     }

//     run();

//     post('info', 'play');
// };

// self.onmessage = (msg: MessageEvent) => {
//     if (isLoaded) {
//         const { type, payload } = msg.data;

//         switch (type) {
//             // case 'create_world': createWorld(payload); break
//             case 'play': play(payload); break;
//             case 'stop': stop(); break;

//             default:
//                 post('warning', `unknown message event: ${type}`);
//                 break;
//         }
//     } else post('warning', 'rapier not loaded');
// };
