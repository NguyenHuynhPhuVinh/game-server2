import { Client, Room } from "colyseus";
import {
  GameRoomState,
  Player,
  DisappearingBlock,
  Spring,
} from "../rooms/schema/GameRoomState";
import { InteractiveObjectManager } from "../managers/InteractiveObjectManager";
import { ServerEnemyManager } from "../managers/ServerEnemyManager";
import { IGameLogic } from "./IGameLogic";
import { BombObject } from "../objects/BombObject";

/**
 * Lớp chứa toàn bộ logic cho chế độ chơi Platformer.
 */
export class PlatformerLogic implements IGameLogic {
  private room!: Room<GameRoomState>;
  public interactiveObjectManager!: InteractiveObjectManager;
  public serverEnemyManager!: ServerEnemyManager;

  private DISAPPEAR_DELAY = 1500;
  private REAPPEAR_DELAY = 1500;
  private GRAB_DISTANCE_THRESHOLD = 80;
  private ESCAPE_STRUGGLE_INCREMENT = 25;
  private SPRING_ANIMATION_DURATION = 250;

  // === CÁC CỜ GATEKEEPER ĐỂ KIỂM SOÁT ĐĂNG KÝ SPAWNER ===
  private hasRegisteredEnemies: boolean = false;
  private hasRegisteredBombs: boolean = false;
  private hasRegisteredSpikeTraps: boolean = false;
  private hasRegisteredPhysicsObjects: boolean = false;
  private hasRegisteredDisappearingBlocks: boolean = false;
  private hasRegisteredSprings: boolean = false;
  // ==================================================

  // --- THÊM CÁC HẰNG SỐ MỚI CHO TÍNH NĂNG BẾ VÀ NÉM ---
  private readonly CARRY_HEIGHT_OFFSET = -40; // Người bị bế sẽ cao hơn người bế 50px
  private readonly CARRY_FRONT_OFFSET = 40; // Và ở phía trước một chút
  private readonly THROW_FORCE_HORIZONTAL = 600;
  private readonly THROW_FORCE_VERTICAL = -450; // Hơi ném lên trên

  // === THÊM CÁC HẰNG SỐ CHO VA CHẠM PHYSICS OBJECT ===
  private readonly ROCK_IMPACT_VELOCITY_THRESHOLD = 1.5; // Vận tốc tối thiểu của đá để gây va chạm
  private readonly ROCK_KNOCKBACK_MULTIPLIER = 1.0; // Hệ số nhân lực đẩy
  private readonly PHYSICS_COLLISION_CHECK_INTERVAL = 16; // Kiểm tra va chạm mỗi 16ms (~60fps)
  // ================================================
  private windChangeTimeout!: any;
  private readonly MIN_WIND_CHANGE_TIME = 3000;
  private readonly MAX_WIND_CHANGE_TIME = 8000;
  private bombSpawners: Map<
    string,
    {
      id: string;
      x: number;
      y: number;
      spawnRate: number;
      bombLifetime: number;
      timer: any;
    }
  > = new Map();

  // Lag compensation history (per-player position buffer)
  private playerHistory: Map<
    string,
    { x: number; y: number; timestamp: number }[]
  > = new Map();
  private readonly HISTORY_DURATION = 200; // ms

  initialize(room: Room<GameRoomState>): void {
    this.room = room;
    // InteractiveObjectManager hiện nhận GameRoom cụ thể, ép kiểu an toàn ở runtime
    this.interactiveObjectManager = new InteractiveObjectManager(
      this.room as any
    );
    // Gắn vào room để các InteractiveObject có thể truy cập như trước (compat layer)
    (this.room as any).interactiveObjectManager = this.interactiveObjectManager;

    // Khởi tạo ServerEnemyManager cho Server-Authoritative AI
    this.serverEnemyManager = new ServerEnemyManager(this.room as any);
    console.log(
      "🤖 ServerEnemyManager initialized for Server-Authoritative AI"
    );

    this.changeWindDirection();
    this.scheduleNextWindChange();

    // Tăng lên 20 FPS để mượt mà hơn sau khi xóa debug logs
    this.room.setSimulationInterval(
      (deltaTime) => this.update(deltaTime),
      1000 / 20
    );
  }

  update(deltaTime: number): void {
    this.interactiveObjectManager.update(deltaTime);
    // Cập nhật Server-Authoritative AI cho tất cả enemies
    this.serverEnemyManager.update(deltaTime);

    // === THÊM: KIỂM TRA VA CHẠM PHYSICS OBJECTS ===
    this.checkPhysicsObjectCollisions();
  }

  onPlayerJoin(client: Client, options: { username?: string }): void {
    const player = new Player();
    player.x = 100;
    player.y = 100;
    player.username =
      options?.username || `Player#${Math.floor(Math.random() * 100)}`;
    this.room.state.players.set(client.sessionId, player);
  }

  onPlayerLeave(client: Client, consented: boolean): void {
    const leavingPlayer = this.room.state.players.get(client.sessionId);
    if (!leavingPlayer) return;

    if (leavingPlayer.isGrabbing) {
      const grabbedPlayer = this.room.state.players.get(
        leavingPlayer.isGrabbing
      );
      if (grabbedPlayer) {
        grabbedPlayer.isGrabbed = false;
        grabbedPlayer.grabbedBy = "";
        grabbedPlayer.escapeProgress = 0;
        grabbedPlayer.interactionState = "none"; // Reset interaction state
      }
    }

    if (leavingPlayer.isGrabbed && leavingPlayer.grabbedBy) {
      const grabber = this.room.state.players.get(leavingPlayer.grabbedBy);
      if (grabber) {
        grabber.isGrabbing = "";
        grabber.interactionState = "none"; // Reset interaction state
      }
    }

    this.room.state.players.delete(client.sessionId);
    // Cleanup history buffer
    this.playerHistory.delete(client.sessionId);
  }

  handleMessage(client: Client, type: string | number, message: any): void {
    switch (type) {
      case "playerUpdate":
        this.handlePlayerUpdate(client, message);
        break;
      case "registerDisappearingBlocks":
        this.handleRegisterBlocks(client, message);
        break;
      case "playerHitBlock":
        this.handlePlayerHitBlock(client, message);
        break;
      case "registerSprings":
        this.handleRegisterSprings(client, message);
        break;
      case "playerHitSpring":
        this.handlePlayerHitSpring(client, message);
        break;
      case "requestGrab":
        this.handleRequestGrab(client, message);
        break;
      case "requestInteractionChange":
        this.handleRequestInteractionChange(client, message);
        break;
      // ======================== THÊM CASE MỚI ========================
      case "requestDirectCarry":
        this.handleRequestDirectCarry(client, message);
        break;
      // ===============================================================
      case "struggle":
        this.handleStruggle(client);
        break;
      case "playerDied":
        this.handlePlayerDied(client);
        break;
      case "playerImpact":
        this.handlePlayerImpact(client, message);
        break;
      case "registerBombSpawners":
        this.handleRegisterBombSpawners(client, message);
        break;
      case "playerHitBomb":
        this.handlePlayerHitBomb(client, message);
        break;
      case "updateBombState":
        this.handleUpdateBombState(client, message);
        break;
      case "registerEnemySpawns":
        this.handleRegisterEnemySpawns(client, message);
        break;
      case "registerInstantSpikeTraps":
        this.handleRegisterInstantSpikeTraps(client, message);
        break;
      // THÊM CÁC CASE MỚI NÀY VÀO
      case "registerPhysicsSpawners":
        this.handleRegisterPhysicsSpawners(client, message);
        break;
      case "updatePhysicsObjectState":
        this.handleUpdatePhysicsObjectState(client, message);
        break;
      // >>> THÊM CASE MỚI NÀY VÀO
      case "requestPhysicsAuthority":
        this.handleRequestPhysicsAuthority(client, message);
        break;
      // <<< KẾT THÚC
      case "playerEnemyCollision":
        this.handlePlayerEnemyCollision(client, message);
        break;
      default:
        break;
    }
  }

  cleanup(): void {
    try {
      if (this.windChangeTimeout) (this.windChangeTimeout as any).clear?.();
    } catch {}
    this.bombSpawners.forEach((s) => {
      try {
        s.timer?.clear?.();
      } catch {}
    });
    this.bombSpawners.clear();

    // Cleanup ServerEnemyManager
    this.serverEnemyManager.cleanup();

    // === QUAN TRỌNG: RESET TẤT CẢ CÁC CỜ GATEKEEPER ===
    // Điều này cho phép phòng chơi được tái sử dụng hoặc khởi tạo lại đúng cách
    this.hasRegisteredEnemies = false;
    this.hasRegisteredBombs = false;
    this.hasRegisteredSpikeTraps = false;
    this.hasRegisteredPhysicsObjects = false;
    this.hasRegisteredDisappearingBlocks = false;
    this.hasRegisteredSprings = false;

    console.log(
      "[Server] All gatekeeper flags have been reset for room cleanup"
    );
    // =====================================================
  }

  private handlePlayerUpdate(client: Client, data: any) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;
    if (player.isGrabbed) {
      player.animState = data.animState;
      player.flipX = data.flipX;
      return;
    }
    const oldX = player.x;
    player.x = data.x;
    player.y = data.y;
    player.animState = data.animState;
    player.flipX = data.flipX;

    // Record history for lag compensation
    const now = (this.room as any).clock.currentTime as number;
    if (!this.playerHistory.has(client.sessionId)) {
      this.playerHistory.set(client.sessionId, []);
    }
    const history = this.playerHistory.get(client.sessionId)!;
    history.push({ x: player.x, y: player.y, timestamp: now });
    while (
      history.length > 0 &&
      now - history[0].timestamp > this.HISTORY_DURATION
    ) {
      history.shift();
    }
    if (player.isGrabbing) {
      const grabbedPlayer = this.room.state.players.get(player.isGrabbing);
      if (grabbedPlayer) {
        // --- LOGIC MỚI: Vị trí phụ thuộc vào trạng thái ---
        if (player.interactionState === "carry") {
          // Trạng thái BẾ: Ở trên đầu và phía trước
          const frontDirection = player.flipX ? -1 : 1;
          grabbedPlayer.x = player.x + frontDirection * this.CARRY_FRONT_OFFSET;
          grabbedPlayer.y = player.y + this.CARRY_HEIGHT_OFFSET;
          grabbedPlayer.flipX = player.flipX; // Quay cùng hướng
          // ======================== THAY ĐỔI Ở ĐÂY ========================
          grabbedPlayer.animState = "fall"; // <-- LUÔN SET LÀ 'FALL' KHI BỊ BẾ
          // ===============================================================
        } else {
          // Trạng thái NẮM (mặc định): Ở bên cạnh
          const movedLeft = player.x < oldX;
          const movedRight = player.x > oldX;
          let targetX: number;
          let targetFlipX: boolean;
          const GRAB_DISTANCE = 30;
          if (movedLeft) {
            targetX = player.x + GRAB_DISTANCE;
            targetFlipX = true;
          } else if (movedRight) {
            targetX = player.x - GRAB_DISTANCE;
            targetFlipX = false;
          } else {
            if (player.flipX) {
              targetX = player.x + GRAB_DISTANCE;
              targetFlipX = true;
            } else {
              targetX = player.x - GRAB_DISTANCE;
              targetFlipX = false;
            }
          }
          grabbedPlayer.x = targetX;
          grabbedPlayer.y = player.y;
          grabbedPlayer.flipX = targetFlipX;
          // ======================== THAY ĐỔI Ở ĐÂY ========================
          grabbedPlayer.animState = player.animState; // <-- Giữ nguyên khi chỉ bị nắm
          // ===============================================================
        }
      }
    }
  }

  private handleRegisterBlocks(
    client: Client,
    blocksData: { id: string; x: number; y: number }[]
  ) {
    // === KIỂM TRA CỜ GATEKEEPER ===
    if (this.hasRegisteredDisappearingBlocks) {
      console.warn(
        `[Server] Disappearing blocks already registered. Ignoring request from ${client.sessionId}.`
      );
      return;
    }
    // === ĐẶT CỜ NGAY LẬP TỨC ĐỂ ĐÓNG CỔNG ===
    this.hasRegisteredDisappearingBlocks = true;
    console.log(
      `[Server] LOCKING disappearing blocks registration, requested by ${client.sessionId}.`
    );
    // ===============================

    console.log(
      `[Server] Registering ${
        blocksData?.length || 0
      } disappearing blocks from client ${client.sessionId}`
    );

    blocksData?.forEach((data) => {
      if (!this.room.state.disappearingBlocks.has(data.id)) {
        const block = new DisappearingBlock();
        block.x = data.x;
        block.y = data.y;
        block.state = "idle";
        this.room.state.disappearingBlocks.set(data.id, block);
      }
    });
  }

  private handlePlayerHitBlock(client: Client, message: { blockId: string }) {
    const block = this.room.state.disappearingBlocks.get(message.blockId);
    if (block && block.state === "idle") {
      block.state = "triggered";
      this.room.clock.setTimeout(() => {
        if (this.room.state.disappearingBlocks.has(message.blockId)) {
          this.room.state.disappearingBlocks.get(message.blockId)!.state =
            "gone";
        }
      }, this.DISAPPEAR_DELAY);
      this.room.clock.setTimeout(() => {
        if (this.room.state.disappearingBlocks.has(message.blockId)) {
          this.room.state.disappearingBlocks.get(message.blockId)!.state =
            "idle";
        }
      }, this.DISAPPEAR_DELAY + this.REAPPEAR_DELAY);
    }
  }

  private handleRegisterSprings(
    client: Client,
    springsData: { id: string; x: number; y: number }[]
  ) {
    // === KIỂM TRA CỜ GATEKEEPER ===
    if (this.hasRegisteredSprings) {
      console.warn(
        `[Server] Springs already registered. Ignoring request from ${client.sessionId}.`
      );
      return;
    }
    // === ĐẶT CỜ NGAY LẬP TỨC ĐỂ ĐÓNG CỔNG ===
    this.hasRegisteredSprings = true;
    console.log(
      `[Server] LOCKING springs registration, requested by ${client.sessionId}.`
    );
    // ===============================

    console.log(
      `[Server] Registering ${springsData?.length || 0} springs from client ${
        client.sessionId
      }`
    );

    springsData?.forEach((data) => {
      if (!this.room.state.springs.has(data.id)) {
        const spring = new Spring();
        spring.x = data.x;
        spring.y = data.y;
        spring.state = "idle";
        this.room.state.springs.set(data.id, spring);
      }
    });
  }

  private handlePlayerHitSpring(client: Client, message: { springId: string }) {
    const spring = this.room.state.springs.get(message.springId);
    if (spring && spring.state === "idle") {
      spring.state = "extended";
      this.room.clock.setTimeout(() => {
        if (this.room.state.springs.has(message.springId)) {
          this.room.state.springs.get(message.springId)!.state = "idle";
        }
      }, this.SPRING_ANIMATION_DURATION);
    }
  }

  private handleRequestGrab(
    client: Client,
    message: { targetSessionId: string }
  ) {
    const grabber = this.room.state.players.get(client.sessionId);
    if (!grabber) return;

    // --- LOGIC MỚI: CHUYỂN TỪ BẾ SANG NẮM (Nhấn E khi đang bế) ---
    if (grabber.isGrabbing && grabber.interactionState === "carry") {
      const target = this.room.state.players.get(grabber.isGrabbing);
      if (target) {
        grabber.interactionState = "grab";
        target.interactionState = "grab";
      }
      return; // Dừng lại ở đây
    }

    // --- LOGIC CŨ: BỎ NẮM ---
    if (grabber.isGrabbing) {
      const grabbedPlayer = this.room.state.players.get(grabber.isGrabbing);
      if (grabbedPlayer) {
        grabber.isGrabbing = "";
        grabber.interactionState = "none"; // Reset
        grabbedPlayer.isGrabbed = false;
        grabbedPlayer.grabbedBy = "";
        grabbedPlayer.escapeProgress = 0;
        grabbedPlayer.interactionState = "none"; // Reset
      }
      return;
    }
    const target = this.room.state.players.get(message.targetSessionId);
    if (grabber && target && !grabber.isGrabbing && !target.isGrabbed) {
      // Estimate action time using half RTT if available
      const latency: number = (client as any).latency || 50;
      const actionTime =
        ((this.room as any).clock.currentTime as number) - latency / 2;

      const targetHistory = this.playerHistory.get(message.targetSessionId);
      let checkX = target.x;
      let checkY = target.y;

      if (targetHistory && targetHistory.length > 0) {
        let p1 = targetHistory[0];
        let p2 = targetHistory[0];
        for (let i = targetHistory.length - 1; i >= 0; i--) {
          if (targetHistory[i].timestamp <= actionTime) {
            p1 = targetHistory[i];
            p2 = targetHistory[i + 1] || targetHistory[i];
            break;
          }
        }
        const denom = p2.timestamp - p1.timestamp || 1;
        const t = (actionTime - p1.timestamp) / denom;
        checkX = p1.x + (p2.x - p1.x) * t;
        checkY = p1.y + (p2.y - p1.y) * t;
      }

      const distance = Math.hypot(grabber.x - checkX, grabber.y - checkY);
      if (distance <= this.GRAB_DISTANCE_THRESHOLD) {
        grabber.isGrabbing = message.targetSessionId;
        target.isGrabbed = true;
        target.grabbedBy = client.sessionId;
        target.escapeProgress = 0;

        // --- THÊM VÀO ---
        grabber.interactionState = "grab";
        target.interactionState = "grab";
      }
    }
  }

  // --- HÀM MỚI HOÀN TOÀN: Xử lý khi người chơi nhấn phím F ---
  private handleRequestInteractionChange(client: Client, message: any) {
    const player = this.room.state.players.get(client.sessionId);
    if (!player || !player.isGrabbing) return;

    const target = this.room.state.players.get(player.isGrabbing);
    if (!target) return;

    if (player.interactionState === "grab") {
      // ---- Chuyển từ Nắm -> Bế ----
      player.interactionState = "carry";
      target.interactionState = "carry";
      console.log(
        `[Server] ${player.username} is now carrying ${target.username}`
      );
    } else if (player.interactionState === "carry") {
      // ---- Thực hiện Ném ----
      console.log(`[Server] ${player.username} throws ${target.username}`);

      // Tính toán lực ném dựa trên hướng của người ném
      const throwDirectionX = player.flipX ? -1 : 1;
      const forceX = throwDirectionX * this.THROW_FORCE_HORIZONTAL;
      const forceY = this.THROW_FORCE_VERTICAL;

      // Gửi lệnh knockback đến client của người bị ném
      const targetClient = (this.room as any).clients?.find?.(
        (c: any) => c.sessionId === player.isGrabbing
      );
      if (targetClient) {
        targetClient.send("applyKnockback", {
          forceX: forceX,
          forceY: forceY,
          throwerSessionId: client.sessionId, // Thêm ID của người ném
        });
      }

      // Reset trạng thái của cả hai
      player.isGrabbing = "";
      player.interactionState = "none";
      target.isGrabbed = false;
      target.grabbedBy = "";
      target.escapeProgress = 0;
      target.interactionState = "none";
    }
  }

  private handleStruggle(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (player && player.isGrabbed) {
      player.escapeProgress += this.ESCAPE_STRUGGLE_INCREMENT;
      if (player.escapeProgress >= 100) {
        const grabber = this.room.state.players.get(player.grabbedBy);
        if (grabber) {
          grabber.isGrabbing = "";
          grabber.interactionState = "none";
        }
        player.isGrabbed = false;
        player.grabbedBy = "";
        player.escapeProgress = 0;
        player.interactionState = "none";
      }
    }
  }

  private handlePlayerDied(client: Client) {
    const deadPlayer = this.room.state.players.get(client.sessionId);
    if (!deadPlayer) return;
    if (deadPlayer.isGrabbing) {
      const grabbedPlayer = this.room.state.players.get(deadPlayer.isGrabbing);
      if (grabbedPlayer) {
        grabbedPlayer.isGrabbed = false;
        grabbedPlayer.grabbedBy = "";
        grabbedPlayer.escapeProgress = 0;
        grabbedPlayer.interactionState = "none";
      }
      deadPlayer.isGrabbing = "";
      deadPlayer.interactionState = "none";
    }
    if (deadPlayer.isGrabbed && deadPlayer.grabbedBy) {
      const grabber = this.room.state.players.get(deadPlayer.grabbedBy);
      if (grabber) {
        grabber.isGrabbing = "";
        grabber.interactionState = "none";
      }
      deadPlayer.isGrabbed = false;
      deadPlayer.grabbedBy = "";
      deadPlayer.escapeProgress = 0;
      deadPlayer.interactionState = "none";
    }
  }

  private handlePlayerImpact(
    client: Client,
    message: { targetSessionId: string; impactX: number; impactY: number }
  ) {
    // Lấy trạng thái của người chơi bị va chạm trực tiếp
    const targetPlayer = this.room.state.players.get(message.targetSessionId);

    // Nếu không tìm thấy mục tiêu, dừng lại
    if (!targetPlayer) return;

    // === LOGIC NÂNG CẤP: ÁP DỤNG KNOCKBACK CHO CẢ CẶP ===
    let playersToKnockback = [message.targetSessionId];

    // Nếu người bị va chạm đang bị người khác bế...
    if (targetPlayer.isGrabbed && targetPlayer.grabbedBy) {
      // ...thì người đang bế cũng sẽ bị văng theo.
      playersToKnockback.push(targetPlayer.grabbedBy);
      console.log(
        `[Server] Impact on ${targetPlayer.username} propagates to grabber.`
      );
    }
    // Ngược lại, nếu người bị va chạm đang bế một người khác...
    else if (targetPlayer.isGrabbing) {
      // ...thì người bị bế cũng sẽ bị văng theo.
      playersToKnockback.push(targetPlayer.isGrabbing);
      console.log(
        `[Server] Impact on ${targetPlayer.username} propagates to grabbed player.`
      );
    }

    // Gửi cùng một lệnh knockback tới tất cả người chơi trong danh sách
    playersToKnockback.forEach((sessionId) => {
      const targetClient = (this.room as any).clients?.find?.(
        (c: any) => c.sessionId === sessionId
      );
      if (targetClient) {
        targetClient.send("applyKnockback", {
          forceX: message.impactX,
          forceY: message.impactY,
        });
        console.log(` -> Sent knockback to ${sessionId}`);
      }
    });
  }

  private handleRegisterBombSpawners(client: Client, spawnersData: any[]) {
    // === KIỂM TRA CỜ GATEKEEPER ===
    if (this.hasRegisteredBombs) {
      console.warn(
        `[Server] Bomb spawners already registered. Ignoring request from ${client.sessionId}.`
      );
      return;
    }
    // === ĐẶT CỜ NGAY LẬP TỨC ĐỂ ĐÓNG CỔNG ===
    this.hasRegisteredBombs = true;
    console.log(
      `[Server] LOCKING bomb spawner registration, requested by ${client.sessionId}.`
    );
    // ===============================

    spawnersData?.forEach((data, index) => {
      const spawnerId = `spawner_${index}`;
      if (this.bombSpawners.has(spawnerId)) return;
      const spawnRate = (data.spawnRate || 5) * 1000;
      const bombLifetime = (data.bombLifetime || 10) * 1000;
      const timer = (this.room as any).clock.setInterval(
        () => this.spawnBomb(spawnerId),
        spawnRate
      );
      this.bombSpawners.set(spawnerId, {
        id: spawnerId,
        x: data.x,
        y: data.y,
        spawnRate,
        bombLifetime,
        timer,
      });
    });
  }

  private handlePlayerHitBomb(client: Client, message: { bombId: string }) {
    const obj = this.interactiveObjectManager.getObject(message.bombId) as
      | BombObject
      | undefined;
    if (obj) obj.explode();
  }

  private handleUpdateBombState(client: Client, message: any) {
    const obj = this.interactiveObjectManager.getObject(message.bombId) as
      | BombObject
      | undefined;
    if (obj && (obj.networkState.state as any) === "ticking") {
      obj.networkState.x = message.x;
      obj.networkState.y = message.y;
      (obj.networkState as any).velocityX = message.velocityX;
      (obj.networkState as any).velocityY = message.velocityY;
    }
  }

  private changeWindDirection(): void {
    const random = Math.random();
    if (random < 0.3) this.room.state.windDirectionMultiplier = -1.0;
    else if (random < 0.4) this.room.state.windDirectionMultiplier = 0.0;
    else this.room.state.windDirectionMultiplier = 1.0;
  }

  private scheduleNextWindChange(): void {
    const randomDelay =
      Math.floor(
        Math.random() *
          (this.MAX_WIND_CHANGE_TIME - this.MIN_WIND_CHANGE_TIME + 1)
      ) + this.MIN_WIND_CHANGE_TIME;
    this.room.state.nextWindChangeTime =
      (this.room as any).clock.currentTime + randomDelay;
    this.windChangeTimeout = (this.room as any).clock.setTimeout(() => {
      this.changeWindDirection();
      this.scheduleNextWindChange();
    }, randomDelay);
  }

  private spawnBomb(spawnerId: string): void {
    const spawner = this.bombSpawners.get(spawnerId);
    if (!spawner) return;
    this.interactiveObjectManager.spawnObject("bomb", spawner.x, spawner.y, {
      lifetimeMs: spawner.bombLifetime,
    });
  }

  // ======================== THÊM HÀM MỚI HOÀN TOÀN ========================
  private handleRequestDirectCarry(
    client: Client,
    message: { targetSessionId: string }
  ) {
    const carrier = this.room.state.players.get(client.sessionId);
    const target = this.room.state.players.get(message.targetSessionId);

    // 1. Kiểm tra các điều kiện an toàn
    if (
      !carrier ||
      !target ||
      carrier.isGrabbing || // Người đi bế không được đang nắm/bế ai khác
      target.isGrabbed || // Mục tiêu không được đang bị ai khác nắm/bế
      client.sessionId === message.targetSessionId // Không thể tự bế mình
    ) {
      return;
    }

    // 2. Sử dụng lag compensation để kiểm tra khoảng cách (tái sử dụng từ handleRequestGrab)
    const latency: number = (client as any).latency || 50;
    const actionTime =
      ((this.room as any).clock.currentTime as number) - latency / 2;

    const targetHistory = this.playerHistory.get(message.targetSessionId);
    let checkX = target.x;
    let checkY = target.y;

    if (targetHistory && targetHistory.length > 0) {
      let p1 = targetHistory[0];
      let p2 = targetHistory[0];
      for (let i = targetHistory.length - 1; i >= 0; i--) {
        if (targetHistory[i].timestamp <= actionTime) {
          p1 = targetHistory[i];
          p2 = targetHistory[i + 1] || targetHistory[i];
          break;
        }
      }
      const denom = p2.timestamp - p1.timestamp || 1;
      const t = (actionTime - p1.timestamp) / denom;
      checkX = p1.x + (p2.x - p1.x) * t;
      checkY = p1.y + (p2.y - p1.y) * t;
    }

    const distance = Math.hypot(carrier.x - checkX, carrier.y - checkY);

    // 3. Nếu khoảng cách hợp lệ, thiết lập trạng thái "carry" cho cả hai
    if (distance <= this.GRAB_DISTANCE_THRESHOLD) {
      console.log(
        `[Server] ${carrier.username} directly carries ${target.username}`
      );

      // Thiết lập trạng thái cho người đi bế
      carrier.isGrabbing = message.targetSessionId;
      carrier.interactionState = "carry";

      // Thiết lập trạng thái cho người bị bế
      target.isGrabbed = true;
      target.grabbedBy = client.sessionId;
      target.escapeProgress = 0;
      target.interactionState = "carry";
    }
  }
  // =======================================================================

  // === HÀM MỚI: KIỂM TRA VA CHẠM GIỮA PHYSICS OBJECTS VÀ PLAYERS ===
  /**
   * Kiểm tra va chạm giữa tất cả các physics objects và players.
   * Chỉ áp dụng knockback cho người chơi khác, không phải người đang điều khiển vật thể.
   */
  private checkPhysicsObjectCollisions(): void {
    this.room.state.physicsObjects.forEach((physObj, objectId) => {
      // Chỉ kiểm tra các vật thể đang di chuyển đủ nhanh
      const speed = Math.hypot(physObj.velocityX, physObj.velocityY);
      if (speed < this.ROCK_IMPACT_VELOCITY_THRESHOLD) {
        return;
      }

      this.room.state.players.forEach((player, sessionId) => {
        // Không áp dụng va chạm cho người đang điều khiển hòn đá
        if (sessionId === physObj.lastUpdatedBy) {
          return;
        }

        // Kiểm tra va chạm đơn giản bằng AABB (Axis-Aligned Bounding Box)
        const rockWidth = physObj.width || 60;
        const rockHeight = physObj.height || 60;
        const playerWidth = 48; // Lấy từ hitbox của player
        const playerHeight = 80;

        const rockLeft = physObj.x - rockWidth / 2;
        const rockRight = physObj.x + rockWidth / 2;
        const rockTop = physObj.y - rockHeight / 2;
        const rockBottom = physObj.y + rockHeight / 2;

        const playerLeft = player.x - playerWidth / 2;
        const playerRight = player.x + playerWidth / 2;
        const playerTop = player.y - playerHeight / 2;
        const playerBottom = player.y + playerHeight / 2;

        const isColliding =
          rockLeft < playerRight &&
          rockRight > playerLeft &&
          rockTop < playerBottom &&
          rockBottom > playerTop;

        if (isColliding) {
          console.log(
            `[Server] Rock ${objectId} collided with player ${sessionId}`
          );

          // Tính toán và gửi lệnh knockback
          const forceX =
            physObj.velocityX * 60 * this.ROCK_KNOCKBACK_MULTIPLIER; // *60 để cân bằng với client
          const forceY =
            physObj.velocityY * 60 * this.ROCK_KNOCKBACK_MULTIPLIER;

          (this.room as any).sendKnockbackToClient(sessionId, forceX, forceY);

          // Optional: Làm cho hòn đá nảy lại một chút
          physObj.velocityX *= -0.4;
          physObj.velocityY *= -0.4;
        }
      });
    });
  }

  /**
   * THÊM MỚI: Xử lý đăng ký enemy spawn points từ client
   */
  private handleRegisterEnemySpawns(client: Client, enemySpawnsData: any[]) {
    // === KIỂM TRA CỜ GATEKEEPER ===
    if (this.hasRegisteredEnemies) {
      console.warn(
        `[Server] Enemies already registered for this room. Ignoring subsequent request from ${client.sessionId}.`
      );
      return; // Thoát ngay lập tức
    }
    // === ĐẶT CỜ NGAY LẬP TỨC ĐỂ ĐÓNG CỔNG ===
    this.hasRegisteredEnemies = true;
    console.log(
      `[Server] LOCKING enemy registration, requested by ${client.sessionId}.`
    );
    // ===============================

    if (!enemySpawnsData || !Array.isArray(enemySpawnsData)) {
      console.warn("[Server] Invalid enemy spawns data received from client");
      return;
    }

    console.log(
      `[Server] Registering ${enemySpawnsData.length} enemy spawns from client ${client.sessionId}`
    );

    // Chuyển đổi dữ liệu từ client thành format mà ServerEnemyManager hiểu
    const spawnsForServer = enemySpawnsData.map((spawn) => ({
      type: spawn.type,
      x: spawn.x,
      y: spawn.y,
      patrolBounds: spawn.patrolBounds
        ? {
            x: spawn.patrolBounds.x,
            y: spawn.patrolBounds.y,
            width: spawn.patrolBounds.width,
            height: spawn.patrolBounds.height,
            left: spawn.patrolBounds.x,
            right: spawn.patrolBounds.x + spawn.patrolBounds.width,
            top: spawn.patrolBounds.y,
            bottom: spawn.patrolBounds.y + spawn.patrolBounds.height,
          }
        : undefined,
    }));

    // Spawn enemies thông qua ServerEnemyManager
    this.serverEnemyManager.spawnEnemiesFromData(spawnsForServer);
  }

  /**
   * THÊM MỚI: Xử lý đăng ký instant spike traps từ client
   */
  private handleRegisterInstantSpikeTraps(client: Client, trapsData: any[]) {
    // === KIỂM TRA CỜ GATEKEEPER ===
    if (this.hasRegisteredSpikeTraps) {
      console.warn(
        `[Server] Spike traps already registered. Ignoring request from ${client.sessionId}.`
      );
      return;
    }
    // === ĐẶT CỜ NGAY LẬP TỨC ĐỂ ĐÓNG CỔNG ===
    this.hasRegisteredSpikeTraps = true;
    console.log(
      `[Server] LOCKING spike trap registration, requested by ${client.sessionId}.`
    );
    // ===============================

    if (!trapsData || !Array.isArray(trapsData)) {
      console.warn(
        "[Server] Invalid instant spike traps data received from client"
      );
      return;
    }

    console.log(
      `[Server] Registering ${trapsData.length} instant spike traps from client ${client.sessionId}`
    );

    trapsData.forEach((trapData) => {
      this.interactiveObjectManager.spawnObject(
        "instant_spike_trap",
        trapData.x,
        trapData.y
      );
    });
  }

  /**
   * THÊM MỚI: Xử lý collision giữa player và enemy
   */
  private handlePlayerEnemyCollision(client: Client, message: any) {
    const { enemyId, collisionType, playerX, playerY, playerVelocityY } =
      message;

    if (!enemyId || !collisionType) {
      console.warn("[Server] Invalid player-enemy collision data");
      return;
    }

    console.log(
      `[Server] Player ${client.sessionId} collision with enemy ${enemyId}: ${collisionType}`
    );

    // Lấy enemy từ ServerEnemyManager
    const enemy = this.serverEnemyManager.getEnemy(enemyId);
    if (!enemy) {
      console.warn(`[Server] Enemy ${enemyId} not found for collision`);
      return;
    }

    // Lấy player state
    const player = this.room.state.players.get(client.sessionId);
    if (!player) {
      console.warn(
        `[Server] Player ${client.sessionId} not found for collision`
      );
      return;
    }

    if (collisionType === "stomp") {
      // Player nhảy lên đầu enemy -> Enemy bị tiêu diệt
      console.log(
        `[Server] Player ${client.sessionId} stomped enemy ${enemyId}`
      );

      // THAY ĐỔI: Thay vì xóa vĩnh viễn, hãy gọi hàm để giết và hẹn giờ hồi sinh
      this.serverEnemyManager.killAndRespawnEnemy(enemyId);

      // Có thể thêm điểm cho player hoặc effects khác ở đây
    } else if (collisionType === "touch") {
      // Player chạm vào enemy -> Player bị thương
      console.log(
        `[Server] Player ${client.sessionId} touched enemy ${enemyId}`
      );

      // Gửi thông báo player bị thương về client
      // Client sẽ xử lý respawn logic
      this.room.send(client, "playerHitByEnemy", {
        enemyId: enemyId,
        damage: 1,
      });
    }
  }

  // THÊM CÁC PHƯƠNG THỨC MỚI NÀY VÀO CUỐI CLASS
  private handleRegisterPhysicsSpawners(client: Client, spawnersData: any[]) {
    // === KIỂM TRA CỜ GATEKEEPER ===
    if (this.hasRegisteredPhysicsObjects) {
      console.warn(
        `[Server] Physics objects already registered. Ignoring request from ${client.sessionId}.`
      );
      return;
    }
    // === ĐẶT CỜ NGAY LẬP TỨC ĐỂ ĐÓNG CỔNG ===
    this.hasRegisteredPhysicsObjects = true;
    console.log(
      `[Server] LOCKING physics object registration, requested by ${client.sessionId}.`
    );
    // ===============================

    spawnersData?.forEach((data) => {
      // Truyền toàn bộ data làm options để GenericPhysicsObject có thể đọc assetKey và các thuộc tính khác
      this.interactiveObjectManager.spawnObject(
        "generic_physics_object",
        data.x,
        data.y,
        data
      );
    });
  }

  private handleUpdatePhysicsObjectState(client: Client, message: any) {
    const physObj = this.room.state.physicsObjects.get(message.id);
    if (physObj) {
      physObj.x = message.x;
      physObj.y = message.y;
      physObj.angle = message.angle;
      physObj.velocityX = message.velocityX;
      physObj.velocityY = message.velocityY;
      physObj.lastUpdatedBy = client.sessionId; // THÊM: Lưu thông tin client điều khiển
    }
  }

  // >>> THÊM HÀM MỚI NÀY VÀO CUỐI CLASS
  private handleRequestPhysicsAuthority(
    client: Client,
    message: { objectId: string }
  ) {
    const physObj = this.room.state.physicsObjects.get(message.objectId);
    const player = this.room.state.players.get(client.sessionId);

    if (physObj && player) {
      // Logic đơn giản: Ai xin thì người đó được (có thể nâng cấp sau)
      // Chỉ thay đổi nếu người chủ hiện tại khác với người yêu cầu
      if (physObj.lastUpdatedBy !== client.sessionId) {
        physObj.lastUpdatedBy = client.sessionId;
        console.log(
          `[Server] Physics authority for ${message.objectId} granted to ${player.username} (${client.sessionId})`
        );
      }
    }
  }
  // <<< KẾT THÚC
}
