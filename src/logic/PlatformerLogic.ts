import { Client, Room } from "colyseus";
import {
  GameRoomState,
  Player,
  DisappearingBlock,
  Spring,
} from "../rooms/schema/GameRoomState";
import { InteractiveObjectManager } from "../managers/InteractiveObjectManager";
import { IGameLogic } from "./IGameLogic";
import { BombObject } from "../objects/BombObject";

/**
 * Lớp chứa toàn bộ logic cho chế độ chơi Platformer.
 */
export class PlatformerLogic implements IGameLogic {
  private room!: Room<GameRoomState>;
  public interactiveObjectManager!: InteractiveObjectManager;

  private DISAPPEAR_DELAY = 1500;
  private REAPPEAR_DELAY = 1500;
  private GRAB_DISTANCE_THRESHOLD = 80;
  private ESCAPE_STRUGGLE_INCREMENT = 25;
  private SPRING_ANIMATION_DURATION = 250;
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
  private playerHistory: Map<string, { x: number; y: number; timestamp: number }[]> = new Map();
  private readonly HISTORY_DURATION = 200; // ms

  initialize(room: Room<GameRoomState>): void {
    this.room = room;
    // InteractiveObjectManager hiện nhận GameRoom cụ thể, ép kiểu an toàn ở runtime
    this.interactiveObjectManager = new InteractiveObjectManager(
      this.room as any
    );
    // Gắn vào room để các InteractiveObject có thể truy cập như trước (compat layer)
    (this.room as any).interactiveObjectManager = this.interactiveObjectManager;

    this.changeWindDirection();
    this.scheduleNextWindChange();

    this.room.setSimulationInterval(
      (deltaTime) => this.update(deltaTime),
      1000 / 24
    );
  }

  update(deltaTime: number): void {
    this.interactiveObjectManager.update(deltaTime);
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
      }
    }

    if (leavingPlayer.isGrabbed && leavingPlayer.grabbedBy) {
      const grabber = this.room.state.players.get(leavingPlayer.grabbedBy);
      if (grabber) grabber.isGrabbing = "";
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
    while (history.length > 0 && now - history[0].timestamp > this.HISTORY_DURATION) {
      history.shift();
    }
    if (player.isGrabbing) {
      const grabbedPlayer = this.room.state.players.get(player.isGrabbing);
      if (grabbedPlayer) {
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
        grabbedPlayer.animState = player.animState;
        grabbedPlayer.flipX = targetFlipX;
      }
    }
  }

  private handleRegisterBlocks(
    client: Client,
    blocksData: { id: string; x: number; y: number }[]
  ) {
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
    if (grabber && grabber.isGrabbing) {
      const grabbedPlayer = this.room.state.players.get(grabber.isGrabbing);
      if (grabbedPlayer) {
        grabber.isGrabbing = "";
        grabbedPlayer.isGrabbed = false;
        grabbedPlayer.grabbedBy = "";
        grabbedPlayer.escapeProgress = 0;
      }
      return;
    }
    const target = this.room.state.players.get(message.targetSessionId);
    if (grabber && target && !grabber.isGrabbing && !target.isGrabbed) {
      // Estimate action time using half RTT if available
      const latency: number = (client as any).latency || 50;
      const actionTime = ((this.room as any).clock.currentTime as number) - latency / 2;

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
      }
    }
  }

  private handleStruggle(client: Client) {
    const player = this.room.state.players.get(client.sessionId);
    if (player && player.isGrabbed) {
      player.escapeProgress += this.ESCAPE_STRUGGLE_INCREMENT;
      if (player.escapeProgress >= 100) {
        const grabber = this.room.state.players.get(player.grabbedBy);
        if (grabber) grabber.isGrabbing = "";
        player.isGrabbed = false;
        player.grabbedBy = "";
        player.escapeProgress = 0;
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
      }
      deadPlayer.isGrabbing = "";
    }
    if (deadPlayer.isGrabbed && deadPlayer.grabbedBy) {
      const grabber = this.room.state.players.get(deadPlayer.grabbedBy);
      if (grabber) grabber.isGrabbing = "";
      deadPlayer.isGrabbed = false;
      deadPlayer.grabbedBy = "";
      deadPlayer.escapeProgress = 0;
    }
  }

  private handlePlayerImpact(
    client: Client,
    message: { targetSessionId: string; impactX: number; impactY: number }
  ) {
    const targetClient = (this.room as any).clients?.find?.(
      (c: any) => c.sessionId === message.targetSessionId
    );
    if (targetClient) {
      targetClient.send("applyKnockback", {
        forceX: message.impactX,
        forceY: message.impactY,
      });
    }
  }

  private handleRegisterBombSpawners(client: Client, spawnersData: any[]) {
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
}
