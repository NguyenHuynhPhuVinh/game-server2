import { InstantSpikeTrap } from "../rooms/schema/GameRoomState";
import { GameRoom } from "../rooms/GameRoom";
import { IInteractiveObject } from "./IInteractiveObject";

export class InstantSpikeTrapObject implements IInteractiveObject {
  public id: string;
  public type = "instant_spike_trap";
  public networkState: InstantSpikeTrap;

  private room: GameRoom;
  private hitbox: { x: number; y: number; width: number; height: number };
  private cooldown: number = 2000; // 2 giây hồi
  private resetTimeout: any;

  // THÊM MỚI: Một Set để theo dõi những người chơi đã bị gây sát thương trong chu kỳ này
  // Điều này ngăn việc gửi tín hiệu chết nhiều lần cho cùng một người chơi.
  private playersHitThisCycle: Set<string> = new Set();

  constructor(id: string, room: GameRoom) {
    this.id = id;
    this.room = room;
    this.networkState = new InstantSpikeTrap();
    this.hitbox = { x: 0, y: 0, width: 64, height: 64 };
  }

  spawn(x: number, y: number, options?: any): void {
    this.networkState.x = x;
    this.networkState.y = y;
    this.networkState.state = "idle";

    // Tiled đặt gốc ở góc trên-trái, chúng ta cần hitbox từ tâm
    this.hitbox.x = x - this.hitbox.width / 2;
    this.hitbox.y = y - this.hitbox.height / 2;

    this.room.state.instantSpikeTraps.set(this.id, this.networkState);
    console.log(`[Server] InstantSpikeTrap ${this.id} spawned at (${x}, ${y})`);
  }

  // SỬA ĐỔI LỚN 1: Luôn kiểm tra va chạm mỗi frame
  update(_deltaTime: number): void {
    this.checkPlayerCollision();
  }

  // SỬA ĐỔI LỚN 2: Logic kiểm tra va chạm được làm lại hoàn toàn
  private checkPlayerCollision(): void {
    this.room.state.players.forEach((player, sessionId) => {
      // Kiểm tra xem người chơi có nằm trong vùng hitbox của bẫy không
      if (
        player.x > this.hitbox.x &&
        player.x < this.hitbox.x + this.hitbox.width &&
        player.y > this.hitbox.y &&
        player.y < this.hitbox.y + this.hitbox.height
      ) {
        // Nếu người chơi ở trong hitbox, xử lý dựa trên trạng thái của bẫy
        if (this.networkState.state === "idle") {
          // TRƯỜNG HỢP 1: Bẫy đang ẩn và có người đạp trúng.
          // -> Kích hoạt bẫy VÀ gây sát thương cho người chơi này.
          console.log(`[Server] Trap ${this.id} triggered by ${sessionId}`);
          this.activate(); // Kích hoạt bẫy (chuyển state sang 'active')
          this.damagePlayer(sessionId); // Gây sát thương cho người đã kích hoạt
        } else if (this.networkState.state === "active") {
          // TRƯỜNG HỢP 2: Bẫy đang hiện và có người (có thể là người khác) đi vào.
          // -> Chỉ gây sát thương nếu người chơi này chưa bị sát thương trong chu kỳ này.
          if (!this.playersHitThisCycle.has(sessionId)) {
            console.log(`[Server] Active trap ${this.id} damages ${sessionId}`);
            this.damagePlayer(sessionId);
          }
        }
      }
    });
  }

  // THÊM MỚI: Một hàm riêng để gây sát thương và theo dõi
  private damagePlayer(playerSessionId: string): void {
    const client = this.room.clients.find(
      (c) => c.sessionId === playerSessionId
    );
    if (client) {
      // Gửi tín hiệu chết đến client
      client.send("playerHitByEnemy", {
        enemyId: this.id,
        damage: 999, // Sát thương cực lớn để chết ngay
      });
      console.log(`[Server] Sent death signal to player ${playerSessionId}`);

      // Thêm người chơi vào danh sách đã bị sát thương để tránh lặp lại
      this.playersHitThisCycle.add(playerSessionId);
    }
  }

  // SỬA ĐỔI LỚN 3: Hàm activate giờ chỉ có nhiệm vụ đổi trạng thái và hẹn giờ reset
  private activate(): void {
    // Ngăn việc kích hoạt lại khi đang active
    if (this.networkState.state === "active") return;

    this.networkState.state = "active";
    console.log(`[Server] InstantSpikeTrap ${this.id} activated!`);

    // Hẹn giờ để reset bẫy
    this.resetTimeout = this.room.clock.setTimeout(() => {
      this.reset();
    }, this.cooldown);
  }

  // SỬA ĐỔI LỚN 4: Hàm reset cần xóa danh sách người chơi đã bị sát thương
  private reset(): void {
    this.networkState.state = "idle";

    // QUAN TRỌNG: Xóa danh sách để chu kỳ sau có thể gây sát thương lại
    this.playersHitThisCycle.clear();

    console.log(`[Server] InstantSpikeTrap ${this.id} reset to idle`);
  }

  despawn(): void {
    // Dọn dẹp timeout nếu có
    if (this.resetTimeout) {
      try {
        this.resetTimeout.clear();
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    this.room.state.instantSpikeTraps.delete(this.id);
    console.log(`[Server] InstantSpikeTrap ${this.id} despawned`);
  }
}
