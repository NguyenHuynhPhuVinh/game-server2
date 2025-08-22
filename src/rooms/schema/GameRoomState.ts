import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") animState: string = "idle";
  @type("boolean") flipX: boolean = false;
  @type("string") username: string = "Player"; // <-- THÊM MỚI

  // <-- THÊM CÁC TRƯỜNG MỚI CHO TÍNH NĂM VÀ THOÁT -->
  @type("boolean") isGrabbed: boolean = false; // Bị người khác nắm?
  @type("string") grabbedBy: string = ""; // ID của người đang nắm mình
  @type("string") isGrabbing: string = ""; // ID của người mình đang nắm
  @type("number") escapeProgress: number = 0; // Tiến trình thoát (0-100)

  // --- THÊM TRƯỜNG MỚI CHO TÍNH NĂNG BẾ VÀ NÉM ---
  // Trạng thái tương tác: "none", "grab", "carry"
  @type("string") interactionState: string = "none";
}

// THÊM MỚI: Schema để định nghĩa trạng thái của một block có thể biến mất
export class DisappearingBlock extends Schema {
  @type("number") x: number = 0; // Tọa độ tile X
  @type("number") y: number = 0; // Tọa độ tile Y

  // Trạng thái của block:
  // 'idle': Bình thường, có thể va chạm.
  // 'triggered': Bị người chơi chạm, đang chuẩn bị biến mất (dùng để client chạy hiệu ứng rung).
  // 'gone': Đã biến mất, không thể va chạm.
  @type("string") state: string = "idle";
}

// THÊM MỚI: Schema để định nghĩa trạng thái của một lò xo
export class Spring extends Schema {
  @type("number") x: number = 0; // Tọa độ tile X
  @type("number") y: number = 0; // Tọa độ tile Y
  // Trạng thái: 'idle' (bị nén) hoặc 'extended' (bung ra)
  @type("string") state: string = "idle";
}

// THÊM MỚI: Schema định nghĩa trạng thái của một quả bom
export class Bomb extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  // Vận tốc để client khác có thể nội suy
  @type("number") velocityX: number = 0;
  @type("number") velocityY: number = 0;
  // Trạng thái: 'ticking' (đang rơi/lăn), 'exploding' (vừa nổ)
  @type("string") state: string = "ticking";
}

// THÊM MỚI: Schema định nghĩa trạng thái của Enemy cho Server-Authoritative AI
export class Enemy extends Schema {
  @type("string") enemyType: string = "BLUE_FISH"; // Loại enemy để client biết dùng sprite nào
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") velocityX: number = 0; // Vận tốc X để client nội suy
  @type("number") velocityY: number = 0; // Vận tốc Y để client nội suy
  @type("string") animState: string = "swim"; // Trạng thái animation (ví dụ: 'swim', 'sleep')
  @type("boolean") flipX: boolean = false;
  @type("boolean") isActive: boolean = true; // Enemy có đang hoạt động không
}

// THÊM MỚI: Schema cho bẫy gai tức thì (instant spike trap)
export class InstantSpikeTrap extends Schema {
  @type("string") state: string = "idle"; // "idle" (vô hình), "active" (hiện gai)
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

// THÊM MỚI: Schema định nghĩa trạng thái của một vật thể vật lý chung
export class PhysicsObject extends Schema {
  @type("string") assetKey: string = ""; // Quan trọng: Để client biết dùng ảnh nào
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") angle: number = 0; // Góc xoay
  @type("number") velocityX: number = 0;
  @type("number") velocityY: number = 0;

  // === THÊM TRƯỜNG ĐIỀU KHIỂN QUYỀN HẠN ===
  @type("string") lastUpdatedBy: string = ""; // SessionId của client đang điều khiển

  // === THÊM CÁC TRƯỜNG CẤU HÌNH VẬT LÝ ===
  // Các thuộc tính này sẽ được gửi tới client một lần khi object được tạo.
  @type("string") shape?: string;
  @type("number") bounce?: number;
  @type("number") friction?: number;
  @type("number") density?: number;
  @type("number") width?: number;
  @type("number") height?: number;
  @type("number") radius?: number;

  // === THÊM CẤU HÌNH OFFSET CHO HITBOX ===
  @type("number") offsetX?: number;
  @type("number") offsetY?: number;
  // ===================================
}

export class GameRoomState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  // THÊM MỚI: Một Map để lưu trạng thái của tất cả các block biến mất trong phòng.
  // Key của map sẽ là ID duy nhất của block (ví dụ: "10_15").
  @type({ map: DisappearingBlock }) disappearingBlocks =
    new MapSchema<DisappearingBlock>();

  // THÊM MỚI: Map để lưu trạng thái của tất cả các lò xo
  @type({ map: Spring }) springs = new MapSchema<Spring>();

  // ======================== THÊM CÁC DÒNG MỚI DƯỚI ĐÂY ========================
  // Hệ số hướng gió: 1.0 = trái, -1.0 = phải, 0.0 = không gió
  @type("number") windDirectionMultiplier: number = 1.0;

  // Thời điểm (timestamp của server) mà gió sẽ đổi hướng tiếp theo
  @type("number") nextWindChangeTime: number = 0;
  // =========================================================================

  // THÊM MỚI: Map để lưu trạng thái của tất cả các quả bom đang hoạt động
  @type({ map: Bomb }) bombs = new MapSchema<Bomb>();

  // THÊM MỚI: Map để lưu trạng thái của tất cả các Enemy trong phòng (Server-Authoritative AI)
  // Key của map sẽ là ID duy nhất của enemy (ví dụ: "enemy_1").
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();

  // THÊM MỚI: Map để đồng bộ trảng thái của tất cả các bẫy gai tức thì
  @type({ map: InstantSpikeTrap }) instantSpikeTraps =
    new MapSchema<InstantSpikeTrap>();

  // THÊM MỚI: Map để đồng bộ trạng thái của tất cả các vật thể vật lý
  @type({ map: PhysicsObject }) physicsObjects = new MapSchema<PhysicsObject>();
}
