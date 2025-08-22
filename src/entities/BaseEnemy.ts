import { BehaviorTree } from "behaviortree";
import { Enemy } from "../rooms/schema/GameRoomState";
import { GameRoom } from "../rooms/GameRoom";

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

/**
 * Base class cho tất cả Enemy trên server
 * Chứa logic AI và cập nhật trạng thái trong GameRoomState
 */
export abstract class BaseEnemy {
  public room: GameRoom;
  public enemyState: Enemy; // Reference đến state trong GameRoomState
  public enemyId: string;
  public enemyType: string;
  public speed: number = 50;

  // Behavior Tree components
  protected tree!: BehaviorTree;
  protected blackboard: any;

  // Physics và bounds
  public patrolBounds?: Rectangle;

  constructor(
    room: GameRoom,
    enemyState: Enemy,
    enemyId: string,
    type: string,
    patrolBounds?: Rectangle
  ) {
    this.room = room;
    this.enemyState = enemyState;
    this.enemyId = enemyId;
    this.enemyType = type;
    this.patrolBounds = patrolBounds;

    // Initialize blackboard
    this.blackboard = {};

    // Call abstract methods that subclasses must implement
    this.setupBlackboard();
    this.buildTree();
  }

  /**
   * Abstract method that subclasses must implement to setup their blackboard
   */
  protected abstract setupBlackboard(): void;

  /**
   * Abstract method that subclasses must implement to build their behavior tree
   */
  protected abstract buildTree(): void;

  /**
   * Reset enemy to new position and state
   */
  public reset(x: number, y: number): void {
    this.enemyState.x = x;
    this.enemyState.y = y;
    this.enemyState.isActive = true;
    this.enemyState.animState = "swim";
    this.enemyState.velocityX = 0;
    this.enemyState.velocityY = 0;

    // Reset blackboard when reusing
    this.setupBlackboard();
  }

  /**
   * Main update loop - được gọi bởi ServerEnemyManager
   */
  public update(deltaTime: number): void {
    if (this.enemyState.isActive) {
      // Update by ticking the behavior tree
      this.tree.step();

      // Apply physics constraints (bounds checking, etc.)
      this.applyConstraints();
    }
  }

  /**
   * Apply movement constraints like patrol bounds
   */
  protected applyConstraints(): void {
    if (this.patrolBounds) {
      // Keep enemy within patrol bounds với buffer zone
      const buffer = 16; // 16 pixels buffer để tránh stuck

      if (this.enemyState.x < this.patrolBounds.left + buffer) {
        this.enemyState.x = this.patrolBounds.left + buffer;
        this.enemyState.velocityX = Math.abs(this.enemyState.velocityX);
        this.enemyState.flipX = false;
      } else if (this.enemyState.x > this.patrolBounds.right - buffer) {
        this.enemyState.x = this.patrolBounds.right - buffer;
        this.enemyState.velocityX = -Math.abs(this.enemyState.velocityX);
        this.enemyState.flipX = true;
      }

      if (this.enemyState.y < this.patrolBounds.top + buffer) {
        this.enemyState.y = this.patrolBounds.top + buffer;
        this.enemyState.velocityY = Math.abs(this.enemyState.velocityY);
      } else if (this.enemyState.y > this.patrolBounds.bottom - buffer) {
        this.enemyState.y = this.patrolBounds.bottom - buffer;
        this.enemyState.velocityY = -Math.abs(this.enemyState.velocityY);
      }
    }

    // Giới hạn tốc độ tối đa
    const maxSpeed = this.speed * 2; // Tối đa gấp đôi tốc độ bình thường
    if (Math.abs(this.enemyState.velocityX) > maxSpeed) {
      this.enemyState.velocityX =
        Math.sign(this.enemyState.velocityX) * maxSpeed;
    }
    if (Math.abs(this.enemyState.velocityY) > maxSpeed) {
      this.enemyState.velocityY =
        Math.sign(this.enemyState.velocityY) * maxSpeed;
    }
  }

  /**
   * Move enemy by velocity * deltaTime
   */
  protected moveByVelocity(deltaTime: number): void {
    const oldX = this.enemyState.x;
    const oldY = this.enemyState.y;

    this.enemyState.x += (this.enemyState.velocityX * deltaTime) / 1000;
    this.enemyState.y += (this.enemyState.velocityY * deltaTime) / 1000;

    // Force Colyseus sync bằng cách update velocityX/Y (client cần biết để interpolation)
    if (
      Math.abs(this.enemyState.x - oldX) > 0.01 ||
      Math.abs(this.enemyState.y - oldY) > 0.01
    ) {
      // Làm tròn để tránh floating point precision issues
      this.enemyState.x = Math.round(this.enemyState.x * 10) / 10;
      this.enemyState.y = Math.round(this.enemyState.y * 10) / 10;

      // Force sync bằng cách reassign velocity (Colyseus sẽ detect thay đổi)
      this.enemyState.velocityX = this.enemyState.velocityX;
      this.enemyState.velocityY = this.enemyState.velocityY;

      // Debug logs removed for performance
    }
  }

  /**
   * Set enemy velocity and flip state
   */
  protected setVelocity(vx: number, vy: number): void {
    this.enemyState.velocityX = vx;
    this.enemyState.velocityY = vy;

    // Update flip based on horizontal movement
    // Texture gốc của con cá quay mặt về TRÁI (flipX = false)
    // Khi bơi sang PHẢI (vx > 0), cần LẬT HÌNH (flipX = true)
    // Khi bơi sang TRÁI (vx < 0), KHÔNG LẬT (flipX = false)
    if (vx > 0) {
      this.enemyState.flipX = true; // Lật hình để quay sang phải
    } else if (vx < 0) {
      this.enemyState.flipX = false; // Giữ nguyên để quay sang trái
    }
  }

  /**
   * Set animation state
   */
  protected setAnimationState(animState: string): void {
    if (this.enemyState.animState !== animState) {
      this.enemyState.animState = animState;
    }
  }

  /**
   * Get distance to a player
   */
  protected getDistanceToPlayer(playerId: string): number {
    const player = this.room.state.players.get(playerId);
    if (!player) return Infinity;

    const dx = player.x - this.enemyState.x;
    const dy = player.y - this.enemyState.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get nearest player
   */
  protected getNearestPlayer(): { playerId: string; distance: number } | null {
    let nearestPlayer: { playerId: string; distance: number } | null = null;

    this.room.state.players.forEach((player, playerId) => {
      const distance = this.getDistanceToPlayer(playerId);
      if (!nearestPlayer || distance < nearestPlayer.distance) {
        nearestPlayer = { playerId, distance };
      }
    });

    return nearestPlayer;
  }

  /**
   * Destroy enemy (remove from active state)
   */
  public destroy(): void {
    this.enemyState.isActive = false;
  }

  // ===== PUBLIC AI INTERFACE METHODS =====
  // These methods are exposed for AI behavior nodes to use

  /**
   * Public method for AI nodes to set animation state
   */
  public setAnimationStateForAI(animState: string): void {
    this.setAnimationState(animState);
  }

  /**
   * Public method for AI nodes to set velocity
   */
  public setVelocityForAI(vx: number, vy: number): void {
    this.setVelocity(vx, vy);
  }

  /**
   * Public method for AI nodes to move by velocity
   */
  public moveByVelocityForAI(deltaTime: number): void {
    this.moveByVelocity(deltaTime);
  }

  /**
   * Public method for AI nodes to get nearest player
   */
  public getNearestPlayerForAI(): {
    playerId: string;
    distance: number;
  } | null {
    return this.getNearestPlayer();
  }
}
