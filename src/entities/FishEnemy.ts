import { BaseEnemy } from "./BaseEnemy";
import { Enemy } from "../rooms/schema/GameRoomState";
import { GameRoom } from "../rooms/GameRoom";
import {
  BehaviorTree,
  Selector,
  Sequence,
  Task,
  SUCCESS,
  FAILURE,
} from "behaviortree";

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

// Import Behavior Tree nodes
import { IsPlayerNearby } from "./ai/fish/nodes/IsPlayerNearby";
import { Flee } from "./ai/fish/nodes/Flee";
import { Sleep } from "./ai/fish/nodes/Sleep";
import { Patrol } from "./ai/fish/nodes/Patrol";
import { IdleAndDecide } from "./ai/fish/nodes/IdleAndDecide";

/**
 * Server-side FishEnemy với AI logic
 * Kế thừa từ BaseEnemy và implement behavior tree cho cá
 */
export class FishEnemy extends BaseEnemy {
  constructor(
    room: GameRoom,
    enemyState: Enemy,
    enemyId: string,
    type: string,
    patrolBounds?: Rectangle
  ) {
    super(room, enemyState, enemyId, type, patrolBounds);

    // Set enemy type trong state
    this.enemyState.enemyType = type;
  }

  // Implement abstract method from BaseEnemy
  protected setupBlackboard(): void {
    this.blackboard = {
      enemy: this, // Đổi từ 'fish' thành 'enemy' cho nhất quán
      detectionRadius: 200,
      shouldPatrol: false,
      shouldSleep: false,
      patrolTarget: null,
      isFleeing: false,
      nearestPlayer: null,
    };
  }

  // Implement abstract method from BaseEnemy
  protected buildTree(): void {
    // Create condition tasks for decision making
    const shouldPatrolTask = new Task({
      run: (blackboard: any) => {
        return blackboard.shouldPatrol ? SUCCESS : FAILURE;
      },
    });

    const shouldSleepTask = new Task({
      run: (blackboard: any) => {
        return blackboard.shouldSleep ? SUCCESS : FAILURE;
      },
    });

    // Build the behavior tree structure
    this.tree = new BehaviorTree({
      tree: new Selector({
        nodes: [
          // 1. Highest priority: Flee if player is nearby
          new Sequence({
            nodes: [new IsPlayerNearby(), new Flee()],
          }),

          // 2. Main behavior sequence
          new Sequence({
            nodes: [
              // 2a. Always start with idle and decide
              new IdleAndDecide(),

              // 2b. Then choose an action based on decision
              new Selector({
                nodes: [
                  // If should sleep -> Sleep
                  new Sequence({
                    nodes: [shouldSleepTask, new Sleep()],
                  }),
                  // If should patrol -> Patrol
                  new Sequence({
                    nodes: [shouldPatrolTask, new Patrol()],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      blackboard: this.blackboard,
    });
  }

  /**
   * Override update để thêm logic đặc biệt cho fish
   */
  public update(deltaTime: number): void {
    super.update(deltaTime);

    // Thêm logic đặc biệt cho fish nếu cần
    // Ví dụ: kiểm tra va chạm với player, xử lý damage, etc.
  }
}
