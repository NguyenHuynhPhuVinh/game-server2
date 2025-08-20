import { Bomb } from "../rooms/schema/GameRoomState";
import { GameRoom } from "../rooms/GameRoom";
import { IInteractiveObject } from "./IInteractiveObject";

export class BombObject implements IInteractiveObject {
  public id: string;
  public type = "bomb";
  public networkState: Bomb;

  private room: GameRoom;
  private lifetimeTimer: any;

  private readonly LIFETIME_MS = 10000;
  private readonly EXPLOSION_RADIUS = 150;
  private readonly EXPLOSION_FORCE = 1800;

  constructor(id: string, room: GameRoom) {
    this.id = id;
    this.room = room;
    this.networkState = new Bomb();
  }

  spawn(x: number, y: number, options?: any): void {
    this.networkState.x = x;
    this.networkState.y = y;
    this.networkState.state = "ticking" as any;

    this.room.state.bombs.set(this.id, this.networkState);

    const lifetime =
      typeof options?.lifetimeMs === "number"
        ? options.lifetimeMs
        : this.LIFETIME_MS;
    this.lifetimeTimer = this.room.clock.setTimeout(() => {
      this.explode();
    }, lifetime);
  }

  update(_deltaTime: number): void {}

  despawn(): void {
    try {
      if (this.lifetimeTimer?.clear) this.lifetimeTimer.clear();
    } catch {}
    try {
      this.room.state.bombs.delete(this.id);
    } catch {}
  }

  explode(): void {
    if (this.networkState.state === ("exploding" as any)) return;
    this.networkState.state = "exploding" as any;

    this.room.state.players.forEach((player, sessionId) => {
      const dx = player.x - this.networkState.x;
      const dy = player.y - this.networkState.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= this.EXPLOSION_RADIUS) {
        const angle = Math.atan2(dy, dx);
        const forceMagnitude =
          this.EXPLOSION_FORCE * (1 - distance / this.EXPLOSION_RADIUS);
        const forceX = Math.cos(angle) * forceMagnitude;
        const forceY = Math.sin(angle) * forceMagnitude;
        this.room.sendKnockbackToClient(sessionId, forceX, forceY);
      }
    });

    this.room.clock.setTimeout(() => {
      this.room.interactiveObjectManager?.despawnObject(this);
    }, 500);
  }
}
