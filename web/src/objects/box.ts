import { Bodies, World, Body } from "matter-js";
import { Graphics } from "pixi.js";
import { engine } from "../physics/engine";

export class Box {
    body: Body;
    sprite: Graphics;

    constructor(x: number, y: number) {
        this.body = Bodies.rectangle(x, y, 80, 80);
        World.add(engine.world, this.body);

        this.sprite = new Graphics();
        this.sprite.rect(-40, -40, 80, 80);
        this.sprite.fill(0xff0000);
    }

    update() {
        this.sprite.x = this.body.position.x;
        this.sprite.y = this.body.position.y;
        this.sprite.rotation = this.body.angle;
    }
}
