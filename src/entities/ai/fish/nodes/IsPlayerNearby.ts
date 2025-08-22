import { Task, SUCCESS, FAILURE } from "behaviortree";
import { BaseEnemy } from "../../../BaseEnemy";

/**
 * Behavior Tree Node: Kiểm tra xem có player nào gần không
 * Trả về SUCCESS nếu có player trong phạm vi phát hiện
 *
 * Refactored: Sử dụng BaseEnemy thay vì FishEnemy để tương thích với tất cả loại kẻ thù
 */
export class IsPlayerNearby extends Task {
  constructor() {
    super({
      run: (blackboard: any) => {
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng 'enemy' và BaseEnemy
        const detectionRadius = blackboard.detectionRadius || 200;

        // Tìm player gần nhất
        const nearestPlayer = enemy.getNearestPlayerForAI();

        if (nearestPlayer && nearestPlayer.distance <= detectionRadius) {
          // Lưu thông tin player gần nhất vào blackboard
          blackboard.nearestPlayer = nearestPlayer;
          return SUCCESS;
        }

        // Xóa thông tin player cũ nếu không còn ai gần
        blackboard.nearestPlayer = null;
        return FAILURE;
      },
    });
  }
}
