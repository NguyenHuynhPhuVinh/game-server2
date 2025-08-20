import { Schema } from "@colyseus/schema";
import { GameRoom } from "../rooms/GameRoom";

export interface IInteractiveObject {
  id: string;
  type: string;
  networkState: Schema;

  spawn(x: number, y: number, options?: any): void;
  update(deltaTime: number): void;
  despawn(): void;
}

export type InteractiveObjectFactory = (
  id: string,
  room: GameRoom
) => IInteractiveObject;
