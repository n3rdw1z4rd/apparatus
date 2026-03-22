export type Entity = number;

export class ECS {
    private nextEntityId: number = 1;

    private components = new Map<string, Map<Entity, any>>();

    createEntity(): Entity {
        return this.nextEntityId++;
    }

    addComponent<T>(entity: Entity, name: string, data: T) {
        if (!this.components.has(name)) {
            this.components.set(name, new Map());
        }

        this.components.get(name)!.set(entity, data);
    }

    getComponent<T>(entity: Entity, name: string): T | undefined {
        return this.components.get(name)?.get(entity);
    }

    removeComponent(entity: Entity, name: string) {
        this.components.get(name)?.delete(entity);
    }

    getEntitiesWith(...componentNames: string[]): Entity[] {
        if (componentNames.length === 0) return [];

        const first = this.components.get(componentNames[0]);
        if (!first) return [];

        const result: Entity[] = [];

        for (const entity of first.keys()) {
            if (componentNames.every(name => this.components.get(name)?.has(entity))) {
                result.push(entity);
            }
        }

        return result;
    }
}
