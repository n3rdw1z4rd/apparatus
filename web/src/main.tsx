import { Bodies, World } from "matter-js";
import { engine, updatePhysics } from "./physics/engine";
import { Box } from "./objects/box";
import { Application } from "pixi.js";

(async () => {
    const app = new Application();

    await app.init({
        background: '#1e1e1e',
        resizeTo: window,
    });

    document.body.appendChild(app.canvas);

    const ground = Bodies.rectangle(400, 580, 800, 40, { isStatic: true });
    World.add(engine.world, ground);

    const box = new Box(400, 200);
    app.stage.addChild(box.sprite);

    app.ticker.add((ticker) => {
        const delta = ticker.deltaMS;

        updatePhysics(delta);

        box.update();
    });
})();
