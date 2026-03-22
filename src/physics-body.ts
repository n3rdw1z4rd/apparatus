import type { RigidBody, World } from "@dimforge/rapier2d";
import { Entity } from "./entity";
import type { Rapier } from "./rapier";
import type { CanvasRenderer, Color } from "./lib/canvas-renderer";
import type { Input } from "./input";

export class PhysicsBody extends Entity {
    readonly fixed: boolean;
    readonly type: string;

    body: RigidBody;
    width: number;
    height: number;
    color: Color;

    get handle(): number { return this.body.handle }

    constructor(
        rapier: Rapier,
        world: World,
        x: number = 0,
        y: number = 0,
        width: number = 32,
        height: number = 32,
        color: Color = 'magenta',
        fixed: boolean = false,
    ) {
        super();

        this.fixed = fixed;
        this.type = this.fixed ? 'fixed' : 'dynamic';

        this.x=x;
        this.y=y;
        this.width = width;
        this.height = height;
        this.color = color;

        this.body = world.createRigidBody(
            (this.fixed === true
                ? rapier.RigidBodyDesc.fixed()
                : rapier.RigidBodyDesc.dynamic()
            ).setTranslation(x, y)
        );

        world.createCollider(
            rapier.ColliderDesc.cuboid(width / 2, height / 2),
            this.body,
        );
    }

    update(_dt: number, input: Input) {
        if (!this.fixed) {
            const speed = 500;

            let vx = 0;

            if (input.isDown('ArrowLeft')) vx -= speed;
            if (input.isDown('ArrowRight')) vx += speed;

            this.body.setLinvel({ x: vx, y: this.body.linvel().y }, true);
        }
    }

    render(renderer: CanvasRenderer) {
        const { x, y } = this.body.translation();
        const rotation = this.body.rotation();

        renderer.context.save();
        renderer.context.translate(x, y);
        renderer.context.rotate(rotation);

        renderer.drawRect(
            0, 0,
            this.width,
            this.height,
            {
                filled: true,
                fillColor: this.color,
            },
        );

        renderer.context.restore();
    };
}
