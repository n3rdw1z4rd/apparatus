import { Shape } from "./shape";
import { Transform } from "./transform";

export type Pickable = {
    entity: number,
    transform: Transform,
    shape: Shape,
};
