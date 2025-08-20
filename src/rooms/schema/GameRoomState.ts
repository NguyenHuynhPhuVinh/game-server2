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
}
