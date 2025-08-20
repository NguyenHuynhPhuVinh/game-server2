import { Client, Room } from "colyseus";
import { GameRoomState } from "../rooms/schema/GameRoomState";

/**
 * Interface (Hợp đồng) cho tất cả các lớp logic của một chế độ chơi.
 */
export interface IGameLogic {
  /**
   * Khởi tạo logic game với các tham chiếu cần thiết từ Room.
   * @param room - Instance của Room để truy cập state, clock, etc.
   */
  initialize(room: Room<GameRoomState>): void;

  /**
   * Được gọi mỗi tick của game loop.
   * @param deltaTime - Thời gian (ms) trôi qua từ tick trước.
   */
  update(deltaTime: number): void;

  /**
   * Xử lý khi một người chơi mới tham gia.
   * @param client - Client của người chơi.
   * @param options - Các tùy chọn khi tham gia.
   */
  onPlayerJoin(client: Client, options: any): void;

  /**
   * Xử lý khi một người chơi rời đi.
   * @param client - Client của người chơi.
   * @param consented - Người chơi tự nguyện rời hay bị ngắt kết nối.
   */
  onPlayerLeave(client: Client, consented: boolean): void;

  /**
   * Xử lý tất cả các tin nhắn từ client.
   * @param client - Client gửi tin nhắn.
   * @param type - Loại tin nhắn.
   * @param message - Dữ liệu tin nhắn.
   */
  handleMessage(client: Client, type: string | number, message: any): void;

  /**
   * Dọn dẹp tài nguyên khi phòng bị hủy.
   */
  cleanup(): void;
}
