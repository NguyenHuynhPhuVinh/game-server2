import { BaseEnemy } from "./BaseEnemy";
import { Enemy } from "../rooms/schema/GameRoomState";
import { GameRoom } from "../rooms/GameRoom";
import { BehaviorTree, Selector, Sequence } from "behaviortree";

// Interface để thay thế Phaser.Geom.Rectangle trên server
interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Import các node AI cần thiết
import { IsPlayerNearby } from "./ai/fish/nodes/IsPlayerNearby"; // Tái sử dụng node của cá
import { ChasePlayer } from "./ai/saw/nodes/ChasePlayer"; // Node mới
import { Patrol } from "./ai/fish/nodes/Patrol";
import { Sleep } from "./ai/fish/nodes/Sleep";
import { IdleAndDecide } from "./ai/fish/nodes/IdleAndDecide";

/**
 * Server-side FlyingSawEnemy với AI logic
 * Kế thừa từ BaseEnemy và implement behavior tree cho lưỡi cưa bay
 * Khác với FishEnemy, loại này tấn công thay vì chạy trốn
 */
export class FlyingSawEnemy extends BaseEnemy {
  constructor(
    room: GameRoom,
    enemyState: Enemy,
    enemyId: string,
    type: string,
    patrolBounds?: Rectangle
  ) {
    super(room, enemyState, enemyId, type, patrolBounds);
    this.speed = 80; // Cho nó bay nhanh hơn cá một chút
    this.enemyState.enemyType = "FLYING_SAW"; // Đặt đúng type cho client
  }

  protected setupBlackboard(): void {
    this.blackboard = {
      enemy: this, // Sử dụng 'enemy' thay vì 'fish' để phân biệt
      detectionRadius: 350, // Tầm nhìn xa hơn cá
      shouldPatrol: false,
      shouldSleep: false,
      nearestPlayer: null,
    };
  }

  protected buildTree(): void {
    // Cây hành vi cho kẻ thù tấn công
    this.tree = new BehaviorTree({
      tree: new Selector({
        nodes: [
          // 1. Ưu tiên cao nhất: Tấn công nếu thấy người chơi
          new Sequence({
            nodes: [
              new IsPlayerNearby(), // Điều kiện: Có người chơi gần không?
              new ChasePlayer(), // Hành động: Đuổi theo người chơi
            ],
          }),

          // 2. Nếu không, thực hiện hành vi bình thường (tuần tra/ngủ)
          new Sequence({
            nodes: [
              new IdleAndDecide(), // Đứng yên và ra quyết định
              new Selector({
                nodes: [new Sleep(), new Patrol()],
              }),
            ],
          }),
        ],
      }),
      blackboard: this.blackboard,
    });
  }

  // Kẻ thù bay không bị ảnh hưởng bởi trọng lực hay tường
  // Nên chúng ta ghi đè phương thức này để nó không làm gì cả
  protected applyConstraints(): void {
    // Ghi đè để kẻ thù bay có thể đi xuyên tường
    // Nếu bạn muốn nó bị chặn bởi tường, hãy xóa hàm này đi.

    // Vẫn giữ giới hạn tốc độ để tránh bug
    const maxSpeed = this.speed * 2;
    if (Math.abs(this.enemyState.velocityX) > maxSpeed) {
      this.enemyState.velocityX =
        Math.sign(this.enemyState.velocityX) * maxSpeed;
    }
    if (Math.abs(this.enemyState.velocityY) > maxSpeed) {
      this.enemyState.velocityY =
        Math.sign(this.enemyState.velocityY) * maxSpeed;
    }
  }
}
