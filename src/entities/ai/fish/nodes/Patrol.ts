import { Task, SUCCESS, RUNNING } from "behaviortree";
import { BaseEnemy } from "../../../BaseEnemy";

/**
 * Behavior Tree Node: Tuần tra
 * Kẻ thù sẽ tuần tra qua lại trong vùng patrol bounds
 *
 * Refactored: Sử dụng BaseEnemy để tương thích với tất cả loại kẻ thù
 */
export class Patrol extends Task {
  constructor() {
    super({
      start: (blackboard: any) => {
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy
        enemy.setAnimationStateForAI("swim");

        // Nếu chưa có target hoặc đã đến target, chọn target mới
        if (
          !blackboard.patrolTarget ||
          this.isNearTarget(enemy, blackboard.patrolTarget)
        ) {
          blackboard.patrolTarget = this.generatePatrolTarget(enemy);
        }
      },
      run: (blackboard: any) => {
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy
        const target = blackboard.patrolTarget;

        if (!target) {
          return SUCCESS; // Không có target, kết thúc patrol
        }

        // Tính khoảng cách đến target
        const dx = target.x - enemy.enemyState.x;
        const dy = target.y - enemy.enemyState.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Nếu đã gần target, chọn target mới
        if (distance < 20) {
          blackboard.patrolTarget = this.generatePatrolTarget(enemy);
          return RUNNING;
        }

        // Di chuyển về phía target
        const normalizedX = dx / distance;
        const normalizedY = dy / distance;

        const velocityX = normalizedX * enemy.speed;
        const velocityY = normalizedY * enemy.speed;

        enemy.setVelocityForAI(velocityX, velocityY);

        // Cập nhật vị trí với deltaTime thực tế
        enemy.moveByVelocityForAI(50); // 20 FPS server tick rate

        return RUNNING; // Tiếp tục patrol
      },
      end: (blackboard: any) => {
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy
        enemy.setVelocityForAI(0, 0); // Dừng lại khi kết thúc patrol
      },
    });
  }

  private generatePatrolTarget(
    enemy: BaseEnemy
  ): { x: number; y: number } | null {
    if (!enemy.patrolBounds) {
      return null;
    }

    // Tạo target ngẫu nhiên trong patrol bounds
    const margin = 32; // Tránh sát biên
    const x = this.randomBetween(
      enemy.patrolBounds.left + margin,
      enemy.patrolBounds.right - margin
    );
    const y = this.randomBetween(
      enemy.patrolBounds.top + margin,
      enemy.patrolBounds.bottom - margin
    );

    return { x, y };
  }

  private isNearTarget(
    enemy: BaseEnemy,
    target: { x: number; y: number }
  ): boolean {
    const dx = target.x - enemy.enemyState.x;
    const dy = target.y - enemy.enemyState.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 20;
  }

  private randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
}
