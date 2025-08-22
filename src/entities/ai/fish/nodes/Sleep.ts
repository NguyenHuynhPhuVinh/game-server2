import { Task, SUCCESS, RUNNING } from "behaviortree";
import { BaseEnemy } from "../../../BaseEnemy";

/**
 * Behavior Tree Node: Cá ngủ
 * Kẻ thù sẽ chìm xuống đáy và ngủ trong một khoảng thời gian
 *
 * Refactored: Sử dụng BaseEnemy để tương thích với tất cả loại kẻ thù
 */
export class Sleep extends Task {
  private wakeUpTime: number = 0;

  constructor() {
    super({
      start: (blackboard: any) => {
        const sleepDuration = this.randomBetween(4000, 8000); // 4-8 giây
        this.wakeUpTime = Date.now() + sleepDuration;

        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy

        // Dừng chuyển động
        enemy.setVelocityForAI(0, 0);

        // Chuyển sang animation ngủ
        enemy.setAnimationStateForAI("sleep");

        // Nếu có patrol bounds, chìm xuống đáy
        if (enemy.patrolBounds) {
          const targetY = enemy.patrolBounds.bottom - 16;
          const currentY = enemy.enemyState.y;

          // Tính toán tốc độ chìm để đạt đáy trong 2 giây
          const sinkDistance = targetY - currentY;
          if (sinkDistance > 0) {
            const sinkSpeed = sinkDistance / 2; // pixels per second
            enemy.setVelocityForAI(0, sinkSpeed);
          }
        }
      },
      run: (blackboard: any) => {
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy

        // Kiểm tra xem đã đến lúc thức dậy chưa
        if (Date.now() >= this.wakeUpTime) {
          return SUCCESS; // Wake up
        }

        // Tiếp tục chìm nếu chưa đến đáy
        if (enemy.patrolBounds) {
          const targetY = enemy.patrolBounds.bottom - 16;
          if (enemy.enemyState.y < targetY && enemy.enemyState.velocityY > 0) {
            enemy.moveByVelocityForAI(50); // 20 FPS server tick rate

            // Dừng chìm khi đến đáy
            if (enemy.enemyState.y >= targetY) {
              enemy.enemyState.y = targetY;
              enemy.setVelocityForAI(0, 0);
            }
          }
        }

        return RUNNING; // Still sleeping
      },
      end: (blackboard: any) => {
        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy
        // Thức dậy và chuyển về animation bơi
        enemy.setAnimationStateForAI("swim");
        enemy.setVelocityForAI(0, 0);
      },
    });
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
