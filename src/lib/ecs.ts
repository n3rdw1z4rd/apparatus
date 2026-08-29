export type Entity = number;
export type Component = object;

export type ComponentType<T extends Component = Component> = new (...args: any[]) => T;

type ComponentMap<T extends Component = Component> = Map<Entity, T>;

type Instances<T extends readonly ComponentType[]> = {
    [K in keyof T]:
    T[K] extends ComponentType<infer U> ? U : never;
};

export type System = (deltaTime: number) => void;

export class ECS {
    static #nextEntity = 0;

    private readonly components = new Map<ComponentType, ComponentMap>();

    createEntity(): Entity {
        return ECS.#nextEntity++;
    }

    addComponent<T extends Component>(
        entity: Entity,
        component: T,
    ): void {
        const type = component.constructor as ComponentType<T>;

        let map = this.components.get(type) as ComponentMap<T> | undefined;

        if (!map) {
            map = new Map<Entity, T>();
            this.components.set(type, map);
        }

        map.set(entity, component);
    }

    getComponent<T extends Component>(
        entity: Entity,
        type: ComponentType<T>,
    ): T | undefined {
        const map = this.components.get(type) as ComponentMap<T> | undefined;
        return map?.get(entity);
    }

    hasComponent<T extends Component>(
        entity: Entity,
        type: ComponentType<T>,
    ): boolean {
        return this.components.get(type)?.has(entity) ?? false;
    }

    removeComponent<T extends Component>(
        entity: Entity,
        type: ComponentType<T>,
    ): void {
        (this.components.get(type) as ComponentMap<T> | undefined)?.delete(entity);
    }

    *query<T extends readonly ComponentType[]>(
        ...types: T
    ): IterableIterator<[Entity, ...Instances<T>]> {
        if (types.length === 0) {
            return;
        }

        let smallest: ComponentMap | undefined;
        const maps: ComponentMap[] = [];

        for (const type of types) {
            const map = this.components.get(type);

            if (!map) {
                return;
            }

            maps.push(map);

            if (!smallest || map.size < smallest.size) {
                smallest = map;
            }
        }

        if (!smallest) {
            return;
        }

        for (const entity of smallest.keys()) {
            const components: Component[] = [];
            let matches = true;

            for (const map of maps) {
                const component = map.get(entity);

                if (!component) {
                    matches = false;
                    break;
                }

                components.push(component);
            }

            if (matches) {
                yield [entity, ...(components as Instances<T>)];
            }
        }
    }

    destroyEntity(entity: Entity): void {
        for (const map of this.components.values()) {
            map.delete(entity);
        }
    }

    clear(): void {
        this.components.clear();
        ECS.#nextEntity = 0;
    }
}
