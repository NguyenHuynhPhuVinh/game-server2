import { Task, SUCCESS, RUNNING } from "behaviortree";
import { BaseEnemy } from "../../../BaseEnemy";

/**
 * Behavior Tree Node: Chạy trốn khỏi player
 * Kẻ thù sẽ di chuyển ngược hướng với player gần nhất
 *
 * Refactored: Sử dụng BaseEnemy để tương thích với tất cả loại kẻ thù
 */
export class Flee extends Task {
  private fleeStartTime: number = 0;
  private readonly FLEE_DURATION = 3000; // 3 giây

  constructor() {
    super({
      start: (blackboard: any) => {
        this.fleeStartTime = Date.now();
        blackboard.isFleeing = true;

        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy
        enemy.setAnimationStateForAI("swim");
      },
      run: (blackboard: any) => {
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy
        const nearestPlayer = blackboard.nearestPlayer;

        if (!nearestPlayer) {
          return SUCCESS; // Không còn player gần, dừng chạy trốn
        }

        // Kiểm tra thời gian chạy trốn
        if (Date.now() - this.fleeStartTime > this.FLEE_DURATION) {
          return SUCCESS; // Đã chạy trốn đủ lâu
        }

        // Lấy thông tin player gần nhất
        const player = enemy.room.state.players.get(nearestPlayer.playerId);
        if (!player) {
          return SUCCESS;
        }

        // Tính hướng chạy trốn (ngược với hướng đến player)
        const dx = enemy.enemyState.x - player.x;
        const dy = enemy.enemyState.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // Normalize và áp dụng tốc độ chạy trốn (nhanh hơn bình thường)
          const fleeSpeed = enemy.speed * 1.8; // Tăng tốc độ chạy trốn
          const normalizedX = dx / distance;
          const normalizedY = dy / distance;

          enemy.setVelocityForAI(
            normalizedX * fleeSpeed,
            normalizedY * fleeSpeed
          );

          // Cập nhật vị trí với deltaTime thực tế
          enemy.moveByVelocityForAI(50); // 20 FPS server tick rate
        }

        return RUNNING; // Tiếp tục chạy trốn
      },
      end: (blackboard: any) => {
        blackboard.isFleeing = false;
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy
        enemy.setVelocityForAI(0, 0); // Dừng lại sau khi chạy trốn
      },
    });
  }
}
