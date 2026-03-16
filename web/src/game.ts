import { Bodies, Body, Engine, Mouse, MouseConstraint, Render, Runner, World } from "matter-js";
import { Emitter } from "./lib/emitter";
import GUI from "lil-gui";
import { log } from "./lib/log";

export class Game extends Emitter {
    private static _instance: Game;

    public static get instance(): Game {
        if (!Game._instance) {
            Game._instance = new Game();
        }

        return Game._instance;
    }

    engine: Engine;
    world: World;
    renderer: Render;
    runner: Runner;
    ground: Body;
    mouse: Mouse;

    gui: GUI;

    get width(): number { return this.renderer.canvas.width; }
    get height(): number { return this.renderer.canvas.height; }

    private constructor() {
        super();

        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelRatio = window.devicePixelRatio

        this.engine = Engine.create();
        this.world = this.engine.world;

        this.renderer = Render.create({
            engine: this.engine,
            options: {
                width, height, pixelRatio,
                hasBounds: true,
                showAngleIndicator: true,
                showCollisions: true,
                showVelocity: true,
            },
        });

        this.runner = Runner.create();

        Render.run(this.renderer);
        Runner.run(this.runner, this.engine);

        // add mouse control
        this.mouse = Mouse.create(this.renderer.canvas);
        const mouseConstraint = MouseConstraint.create(this.engine, {
            mouse: this.mouse,
            constraint: {
                stiffness: 0.2,
                render: {
                    visible: false
                }
            }
        });

        World.add(this.world, mouseConstraint);

        // keep the mouse in sync with rendering
        this.renderer.mouse = this.mouse;

        this.ground = Bodies.rectangle(width / 2, height, width, 32, { isStatic: true });
        World.add(this.world, this.ground);

        // window.addEventListener('pointerup', (ev: PointerEvent) => {
        //     const body = Bodies.rectangle(ev.clientX, ev.clientY, 256, 32);
        //     World.add(this.world, body);
        // });

        this.gui = new GUI({ title: 'apparatus', width: 200 });

        this.gui.add({
            button: () => {
                const body = Bodies.rectangle(width / 2, height / 2, 256, 32);
                World.add(this.world, body);
            }
        }, 'button').name('New Plank');

        this.gui.add({
            button: () => {
                const body = Bodies.circle(width / 2, height / 2, 32);
                World.add(this.world, body);
            }
        }, 'button').name('New Wheel');

        this.gui.add(this.runner, 'enabled').name('Running');
    }
}
