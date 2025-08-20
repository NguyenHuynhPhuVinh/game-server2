import { Room, Client } from "colyseus";
import { GameRoomState } from "./schema/GameRoomState";
import { InteractiveObjectManager } from "../managers/InteractiveObjectManager";
import { IGameLogic } from "../logic/IGameLogic";
import { PlatformerLogic } from "../logic/PlatformerLogic";

export class GameRoom extends Room<GameRoomState> {
  maxClients = 16;
  private quizId: string = "";
  private roundNumber: string = "";

  public interactiveObjectManager!: InteractiveObjectManager;
  private gameLogic!: IGameLogic;

  onCreate(options: {
    quizId?: string;
    roundNumber?: string;
    customRoomId?: string;
  }) {
    this.setState(new GameRoomState());

    if (options.customRoomId) {
      const parts = options.customRoomId.split("_");
      if (parts.length >= 4) {
        this.quizId = parts[1];
        this.roundNumber = parts[3];
      }
    } else {
      this.quizId = options.quizId || "unknown";
      this.roundNumber = options.roundNumber || "unknown";
    }

    if (this.quizId && this.roundNumber) {
      this.roomId = `quiz_${this.quizId}_round_${this.roundNumber}`;
    }

    // Khởi tạo logic game (mặc định Platformer)
    this.gameLogic = new PlatformerLogic();
    this.gameLogic.initialize(this);
    // Expose InteractiveObjectManager từ logic (được khởi tạo trong logic)
    // @ts-ignore
    this.interactiveObjectManager = (this as any).interactiveObjectManager;

    // Chuyển tiếp toàn bộ tin nhắn tới lớp logic
    this.onMessage("*", (client, type, message) => {
      this.gameLogic.handleMessage(client, type, message);
    });
  }

  onJoin(client: Client, options: any) {
    this.gameLogic.onPlayerJoin(client, options);
  }

  onLeave(client: Client, consented: boolean) {
    this.gameLogic.onPlayerLeave(client, consented);
  }

  onDispose() {
    this.gameLogic.cleanup();
  }

  public sendKnockbackToClient(
    sessionId: string,
    forceX: number,
    forceY: number
  ) {
    const targetClient = this.clients.find((c) => c.sessionId === sessionId);
    if (targetClient) {
      targetClient.send("applyKnockback", { forceX, forceY });
    }
  }
}
