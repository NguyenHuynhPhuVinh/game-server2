import { GameRoom } from "../rooms/GameRoom";
import {
  IInteractiveObject,
  InteractiveObjectFactory,
} from "../objects/IInteractiveObject";
import { BombObject } from "../objects/BombObject";
import { InstantSpikeTrapObject } from "../objects/InstantSpikeTrapObject";
import { GenericPhysicsObject } from "../objects/GenericPhysicsObject";

export class InteractiveObjectManager {
  private room: GameRoom;
  private pools: Map<string, IInteractiveObject[]> = new Map();
  private activeObjects: Map<string, IInteractiveObject> = new Map();
  private nextId: number = 0;

  private objectFactory: Map<string, InteractiveObjectFactory> = new Map();

  constructor(room: GameRoom) {
    this.room = room;
    this.registerObjectTypes();
  }

  private registerObjectTypes(): void {
    this.objectFactory.set("bomb", (id, room) => new BombObject(id, room));
    this.objectFactory.set(
      "instant_spike_trap",
      (id, room) => new InstantSpikeTrapObject(id, room)
    );
    // THÊM DÒNG NÀY: Generic physics object thay thế cho rock
    this.objectFactory.set(
      "generic_physics_object",
      (id, room) => new GenericPhysicsObject(id, room)
    );
  }

  private getFromPool(type: string): IInteractiveObject | null {
    const pool = this.pools.get(type);
    if (!pool || pool.length === 0) return null;
    return pool.pop()!;
  }

  private releaseToPool(object: IInteractiveObject): void {
    if (!this.pools.has(object.type)) this.pools.set(object.type, []);
    this.pools.get(object.type)!.push(object);
  }

  public spawnObject(
    type: string,
    x: number,
    y: number,
    options?: any
  ): IInteractiveObject | null {
    let obj = this.getFromPool(type);
    if (!obj) {
      const creator = this.objectFactory.get(type);
      if (!creator) {
        console.error(
          `[InteractiveObjectManager] Unknown object type: ${type}`
        );
        return null;
      }
      const newId = `${type}_${this.nextId++}`;
      obj = creator(newId, this.room);
    }

    this.activeObjects.set(obj.id, obj);
    obj.spawn(x, y, options);
    return obj;
  }

  public despawnObject(object: IInteractiveObject): void {
    if (!this.activeObjects.has(object.id)) return;
    object.despawn();
    this.activeObjects.delete(object.id);
    this.releaseToPool(object);
  }

  public update(deltaTime: number): void {
    this.activeObjects.forEach((obj) => obj.update(deltaTime));
  }

  public getObject(id: string): IInteractiveObject | undefined {
    return this.activeObjects.get(id);
  }
}
