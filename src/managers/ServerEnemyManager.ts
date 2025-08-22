import { GameRoom } from "../rooms/GameRoom";
import { Enemy } from "../rooms/schema/GameRoomState";
import { BaseEnemy } from "../entities/BaseEnemy";
import { FishEnemy } from "../entities/FishEnemy";
import { FlyingSawEnemy } from "../entities/FlyingSawEnemy";

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

// THÊM MỚI: Interface để lưu dữ liệu spawn ban đầu
interface EnemySpawnData {
  type: string;
  x: number;
  y: number;
  patrolBounds?: Rectangle;
}

/**
 * Server-side Enemy Manager
 * Quản lý việc tạo, cập nhật và xóa enemies trên server
 * Chạy AI logic và cập nhật trạng thái trong GameRoomState
 */
export class ServerEnemyManager {
  private room: GameRoom;
  private activeEnemies: Map<string, BaseEnemy> = new Map();
  private nextEnemyId = 0;

  // THÊM MỚI: Map để lưu trữ thông tin spawn gốc của mỗi enemy
  private enemySpawnData: Map<string, EnemySpawnData> = new Map();

  // THÊM MỚI: Hằng số cho thời gian hồi sinh (5 giây)
  private readonly RESPAWN_DELAY = 5000; // 5000 ms

  constructor(room: GameRoom) {
    this.room = room;
  }

  /**
   * Spawn một enemy mới
   */
  public spawnEnemy(
    type: string,
    x: number,
    y: number,
    patrolBounds?: Rectangle
  ): string {
    const enemyId = `enemy_${this.nextEnemyId++}`;

    // 1. Tạo state trong GameRoomState
    const enemyState = new Enemy();
    enemyState.enemyType = type;
    enemyState.x = x;
    enemyState.y = y;
    enemyState.isActive = true;
    enemyState.animState = "swim";
    enemyState.velocityX = 0;
    enemyState.velocityY = 0;
    enemyState.flipX = false;

    this.room.state.enemies.set(enemyId, enemyState);

    // 2. Tạo thực thể logic AI trên server
    let enemyAI: BaseEnemy;

    switch (type) {
      case "BLUE_FISH":
      case "GOLD_FISH":
      case "PIRANHA":
        enemyAI = new FishEnemy(
          this.room,
          enemyState,
          enemyId,
          type,
          patrolBounds
        );
        break;
      // ================== THÊM CASE MỚI TẠI ĐÂY ==================
      case "FLYING_SAW":
        enemyAI = new FlyingSawEnemy(
          this.room,
          enemyState,
          enemyId,
          type,
          patrolBounds
        );
        break;
      // ==========================================================
      default:
        console.error(`[ServerEnemyManager] Unknown enemy type: ${type}`);
        // Xóa state đã tạo nếu type không hợp lệ
        this.room.state.enemies.delete(enemyId);
        return "";
    }

    this.activeEnemies.set(enemyId, enemyAI);

    // THÊM MỚI: Lưu lại thông tin spawn gốc, chỉ làm điều này MỘT LẦN
    if (!this.enemySpawnData.has(enemyId)) {
      this.enemySpawnData.set(enemyId, { type, x, y, patrolBounds });
    }

    console.log(
      `[ServerEnemyManager] Spawned enemy ${enemyId} of type ${type} at (${x}, ${y})`
    );
    return enemyId;
  }

  /**
   * Update tất cả enemies
   */
  public update(deltaTime: number): void {
    // Debug logs removed for performance

    this.activeEnemies.forEach((enemyAI, enemyId) => {
      if (enemyAI.enemyState.isActive) {
        enemyAI.update(deltaTime);
      } else {
        // Enemy đã bị destroy, xóa khỏi danh sách
        this.removeEnemy(enemyId);
      }
    });
  }

  /**
   * THÊM MỚI: Hàm xử lý khi enemy bị giết và cần hồi sinh
   */
  public killAndRespawnEnemy(enemyId: string): void {
    const originalData = this.enemySpawnData.get(enemyId);
    if (!originalData) {
      console.warn(
        `[Server] Cannot respawn enemy ${enemyId}, no spawn data found. Removing permanently.`
      );
      this.removeEnemy(enemyId);
      return;
    }

    console.log(
      `[Server] Enemy ${enemyId} killed. Scheduling respawn in ${
        this.RESPAWN_DELAY / 1000
      }s.`
    );

    // Bước 1: Xóa enemy khỏi game ngay lập tức
    this.removeEnemy(enemyId);

    // Bước 2: Hẹn giờ để spawn lại
    this.room.clock.setTimeout(() => {
      console.log(`[Server] Respawning enemy ${enemyId}...`);
      this.spawnEnemy(
        originalData.type,
        originalData.x,
        originalData.y,
        originalData.patrolBounds
      );
    }, this.RESPAWN_DELAY);
  }

  /**
   * Xóa một enemy (khỏi activeEnemies và state)
   */
  public removeEnemy(enemyId: string): void {
    const enemyAI = this.activeEnemies.get(enemyId);
    if (enemyAI) {
      // Xóa khỏi state (client sẽ thấy nó biến mất)
      this.room.state.enemies.delete(enemyId);

      // Xóa khỏi active enemies (dừng cập nhật AI)
      this.activeEnemies.delete(enemyId);

      console.log(
        `[ServerEnemyManager] Removed enemy ${enemyId} from active game.`
      );
    }
  }

  /**
   * Lấy enemy AI instance theo ID
   */
  public getEnemy(enemyId: string): BaseEnemy | undefined {
    return this.activeEnemies.get(enemyId);
  }

  /**
   * Lấy tất cả active enemies
   */
  public getAllEnemies(): Map<string, BaseEnemy> {
    return this.activeEnemies;
  }

  /**
   * Đếm số lượng enemies đang hoạt động
   */
  public getActiveEnemyCount(): number {
    return this.activeEnemies.size;
  }

  /**
   * Spawn enemies từ dữ liệu spawn points (sẽ được gọi từ PlatformerLogic)
   */
  public spawnEnemiesFromData(
    enemySpawns: Array<{
      type: string;
      x: number;
      y: number;
      patrolBounds?: Rectangle;
    }>
  ): void {
    enemySpawns.forEach((spawn) => {
      if (spawn.type) {
        this.spawnEnemy(spawn.type, spawn.x, spawn.y, spawn.patrolBounds);
      }
    });

    console.log(
      `[ServerEnemyManager] Spawned ${enemySpawns.length} enemies from spawn data`
    );
  }

  /**
   * Cleanup tất cả enemies (được gọi khi room bị destroy)
   */
  public cleanup(): void {
    console.log(
      `[ServerEnemyManager] Cleaning up ${this.activeEnemies.size} enemies`
    );

    // Xóa tất cả enemies khỏi state
    this.room.state.enemies.clear();

    // Xóa tất cả active enemies
    this.activeEnemies.clear();

    // THÊM MỚI: Xóa cả dữ liệu spawn
    this.enemySpawnData.clear();

    // Reset counter
    this.nextEnemyId = 0;
  }

  /**
   * Tạm dừng/tiếp tục AI của tất cả enemies
   */
  public setAllEnemiesActive(active: boolean): void {
    this.activeEnemies.forEach((enemyAI) => {
      enemyAI.enemyState.isActive = active;
    });

    console.log(`[ServerEnemyManager] Set all enemies active: ${active}`);
  }
}
