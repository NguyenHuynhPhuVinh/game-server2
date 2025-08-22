import { PhysicsObject } from "../rooms/schema/GameRoomState";
import { GameRoom } from "../rooms/GameRoom";
import { IInteractiveObject } from "./IInteractiveObject";

export class GenericPhysicsObject implements IInteractiveObject {
  public id: string;
  public type = "generic_physics_object"; // Tên loại chung
  public networkState: PhysicsObject;
  private room: GameRoom;

  constructor(id: string, room: GameRoom) {
    this.id = id;
    this.room = room;
    this.networkState = new PhysicsObject();
  }

  spawn(x: number, y: number, options?: any): void {
    // Gán các giá trị cơ bản
    this.networkState.x = x;
    this.networkState.y = y;
    this.networkState.angle = 0;
    this.networkState.velocityX = 0;
    this.networkState.velocityY = 0;

    // === SỬA LẠI HOÀN TOÀN KHỐI LOGIC DƯỚI ĐÂY ===
    // Đọc TẤT CẢ thuộc tính từ options và gán vào networkState
    this.networkState.assetKey = options?.assetKey || "rock";
    this.networkState.shape = options?.shape || "rectangle";
    this.networkState.bounce = options?.bounce; // không cần giá trị mặc định, client sẽ tự xử lý
    this.networkState.friction = options?.friction;
    this.networkState.density = options?.density;
    this.networkState.width = options?.width;
    this.networkState.height = options?.height;
    this.networkState.radius = options?.radius;

    // === THÊM LOGIC ĐỌC OFFSET TỪ TILED ===
    this.networkState.offsetX = options?.offsetX;
    this.networkState.offsetY = options?.offsetY;
    // ==========================================
    // ==============================================

    this.room.state.physicsObjects.set(this.id, this.networkState);
    console.log(
      `[Server] Spawned GenericPhysicsObject ${this.id} (asset: ${this.networkState.assetKey}) with custom physics.`
    );
  }

  // Logic update của GenericPhysicsObject chủ yếu là nhận dữ liệu từ client
  update(_deltaTime: number): void {
    // Không cần logic chủ động, vì vật lý được điều khiển bởi client
  }

  despawn(): void {
    try {
      this.room.state.physicsObjects.delete(this.id);
      console.log(`[Server] Despawned GenericPhysicsObject ${this.id}`);
    } catch (e) {
      // Bỏ qua lỗi nếu object đã bị xóa
    }
  }
}
