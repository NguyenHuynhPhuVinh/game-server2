import { Task, SUCCESS, FAILURE, RUNNING } from "behaviortree";

/**
 * Behavior Tree Node: Đuổi theo người chơi gần nhất.
 * Kẻ thù sẽ di chuyển về phía người chơi đã được phát hiện.
 *
 * Lưu ý: Node này sử dụng 'enemy' key trong blackboard thay vì 'fish'
 * vì được thiết kế cho FlyingSawEnemy, không phải FishEnemy
 */
export class ChasePlayer extends Task {
  constructor() {
    super({
      start: (blackboard: any) => {
        const enemy = blackboard.enemy;
        // Khi bắt đầu đuổi, chuyển sang animation "bay" (tên là swim)
        enemy.setAnimationState("swim");
      },
      run: (blackboard: any) => {
        const enemy = blackboard.enemy;
        const nearestPlayerInfo = blackboard.nearestPlayer;

        // Nếu không có người chơi nào gần đó (đã chạy thoát), thì thất bại
        if (!nearestPlayerInfo) {
          return FAILURE;
        }

        const player = enemy.room.state.players.get(nearestPlayerInfo.playerId);
        if (!player) {
          return FAILURE;
        }

        // Tính toán vector hướng tới người chơi
        const dx = player.x - enemy.enemyState.x;
        const dy = player.y - enemy.enemyState.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Nếu đã ở rất gần, coi như thành công (có thể chuyển sang node tấn công sau này)
        if (distance < 30) {
          enemy.setVelocity(0, 0); // Dừng lại
          return SUCCESS;
        }

        // Di chuyển về phía người chơi
        const normalizedX = dx / distance;
        const normalizedY = dy / distance;

        const chaseSpeed = enemy.speed * 1.5; // Đuổi nhanh hơn tốc độ tuần tra
        const velocityX = normalizedX * chaseSpeed;
        const velocityY = normalizedY * chaseSpeed;

        enemy.setVelocity(velocityX, velocityY);

        // Cập nhật vị trí (giả định tick rate của server)
        enemy.moveByVelocity(50);

        return RUNNING; // Đang trong quá trình đuổi theo
      },
    });
  }
}
