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

    // === LOGIC NÂNG CẤP: DÙNG SET ĐỂ TRÁNH GỬI KNOCKBACK 2 LẦN CHO CÙNG 1 NGƯỜI ===
    const processedPlayers = new Set<string>();

    this.room.state.players.forEach((player, sessionId) => {
      // Nếu người chơi này đã được xử lý (vì là partner của người khác), thì bỏ qua.
      if (processedPlayers.has(sessionId)) {
        return;
      }

      // Kiểm tra xem người chơi có trong bán kính nổ không
      const dx = player.x - this.networkState.x;
      const dy = player.y - this.networkState.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.EXPLOSION_RADIUS) {
        // Tính toán lực nổ
        const angle = Math.atan2(dy, dx);
        const forceMagnitude =
          this.EXPLOSION_FORCE * (1 - distance / this.EXPLOSION_RADIUS);
        const forceX = Math.cos(angle) * forceMagnitude;
        const forceY = Math.sin(angle) * forceMagnitude;

        // Xác định tất cả những người sẽ bị ảnh hưởng bởi cú nổ này
        let playersToKnockback = [sessionId];
        if (player.isGrabbed && player.grabbedBy) {
          playersToKnockback.push(player.grabbedBy);
        } else if (player.isGrabbing) {
          playersToKnockback.push(player.isGrabbing);
        }

        // Gửi lệnh và đánh dấu tất cả là "đã xử lý"
        playersToKnockback.forEach((id) => {
          this.room.sendKnockbackToClient(id, forceX, forceY);
          processedPlayers.add(id); // Thêm vào set để không xử lý lại
        });
      }
    });

    this.room.clock.setTimeout(() => {
      this.room.interactiveObjectManager?.despawnObject(this);
    }, 500);
  }
}
