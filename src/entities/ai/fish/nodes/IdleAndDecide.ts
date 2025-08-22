import { Task, SUCCESS, RUNNING } from "behaviortree";
import { BaseEnemy } from "../../../BaseEnemy";

/**
 * Behavior Tree Node: Đứng yên và quyết định hành động tiếp theo
 * Kẻ thù sẽ dừng lại một lúc và quyết định có nên ngủ hay tuần tra
 *
 * Refactored: Sử dụng BaseEnemy để tương thích với tất cả loại kẻ thù
 */
export class IdleAndDecide extends Task {
  private decisionTime: number = 0;

  constructor() {
    super({
      start: (blackboard: any) => {
        const waitDuration = this.randomBetween(1000, 3000); // 1-3 giây
        this.decisionTime = Date.now() + waitDuration;

        const enemy = blackboard.enemy as BaseEnemy; // Sử dụng BaseEnemy

        // Dừng chuyển động và chuyển sang animation bơi chậm
        enemy.setVelocityForAI(0, 0);
        enemy.setAnimationStateForAI("swim");

        // Reset các quyết định trước đó
        blackboard.shouldPatrol = false;
        blackboard.shouldSleep = false;
      },
      run: (blackboard: any) => {
        // Chờ đến thời điểm quyết định
        if (Date.now() < this.decisionTime) {
          return RUNNING; // Vẫn đang chờ
        }

        // Đã đến lúc quyết định
        this.makeDecision(blackboard);
        return SUCCESS;
      },
    });
  }

  private makeDecision(blackboard: any): void {
    // Tạo quyết định ngẫu nhiên với xác suất khác nhau
    const random = Math.random();

    if (random < 0.3) {
      // 30% cơ hội ngủ
      blackboard.shouldSleep = true;
      blackboard.shouldPatrol = false;
    } else {
      // 70% cơ hội tuần tra
      blackboard.shouldSleep = false;
      blackboard.shouldPatrol = true;
    }
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
