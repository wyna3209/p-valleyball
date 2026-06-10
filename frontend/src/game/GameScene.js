import Phaser from 'phaser';
import { socket } from '../socket.js';
import { C } from '../constants.js';
import { touch, showTouchControls, hideTouchControls } from '../touchControls.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // Receives { playerId } from LobbyScene.start('GameScene', data)
  init(data) {
    this.playerId = data.playerId ?? null;
    this.gameStatus = 'waiting';
    this.lastInput = { left: false, right: false, jump: false };
    this.restartCountdown = null;
  }

  create() {
    this.createField();
    this.createGameObjects();
    this.createUI();
    this.setupInput();
    this.setupSocket();
    showTouchControls();

    // Show player label immediately using data from LobbyScene
    if (this.playerId) {
      this.playerLabel.setText(
        this.playerId === 'p1'
          ? 'P1 (파랑)  |  ← → ↑ / A D W'
          : 'P2 (빨강)  |  ← → ↑ / A D W'
      );
    }
  }

  // ── Field ──────────────────────────────────────────────────────────────────

  createField() {
    // Sky background is set via config.backgroundColor
    // Ground under floor
    this.add.rectangle(
      C.GAME_WIDTH / 2,
      C.FLOOR_Y + (C.GAME_HEIGHT - C.FLOOR_Y) / 2,
      C.GAME_WIDTH,
      C.GAME_HEIGHT - C.FLOOR_Y,
      0xc8a060
    );
    this.add.rectangle(C.GAME_WIDTH / 2, C.FLOOR_Y + 3, C.GAME_WIDTH, 6, 0x7a5230);
    // Net
    this.add.rectangle(C.NET_X, C.FLOOR_Y - C.NET_HEIGHT / 2, C.NET_WIDTH, C.NET_HEIGHT, 0xeeeeee);
    this.add.rectangle(C.NET_X, C.FLOOR_Y - C.NET_HEIGHT, 24, 8, 0xdddddd);
  }

  // ── Game objects ───────────────────────────────────────────────────────────

  createGameObjects() {
    const py = C.FLOOR_Y - C.PLAYER_HEIGHT / 2;
    this.p1Obj = this.add.rectangle(200, py, C.PLAYER_WIDTH, C.PLAYER_HEIGHT, 0x4488ff);
    this.p2Obj = this.add.rectangle(600, py, C.PLAYER_WIDTH, C.PLAYER_HEIGHT, 0xff4444);
    this.ballObj = this.add.circle(C.GAME_WIDTH / 2, 150, C.BALL_RADIUS, 0xffffff);
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  createUI() {
    // Score
    this.scoreText = this.add
      .text(C.GAME_WIDTH / 2, 24, '0 : 0', {
        fontSize: '28px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Player label (bottom-left)
    this.playerLabel = this.add.text(8, C.GAME_HEIGHT - 20, '', {
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    });

    // Semi-transparent overlay for waiting / countdown / ended
    this.statusOverlay = this.add
      .rectangle(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2, C.GAME_WIDTH, C.GAME_HEIGHT, 0x000000, 0.55)
      .setDepth(10);

    // Main status message
    this.statusText = this.add
      .text(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2 - 30, '상대를 기다리는 중...', {
        fontSize: '26px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(11);

    // Step 17: big countdown number (3 / 2 / 1)
    this.countdownNumText = this.add
      .text(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2, '', {
        fontSize: '110px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false);

    // Auto-restart countdown (e.g. "5초 후 자동 재시작")
    this.restartCountdownText = this.add
      .text(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2 + 32, '', {
        fontSize: '18px',
        color: '#cccccc',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false);

    // Step 19: 다시하기 button
    this.restartBtn = this.add
      .rectangle(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2 + 72, 170, 46, 0x2a6632)
      .setInteractive({ useHandCursor: true })
      .setDepth(11)
      .setVisible(false);

    this.restartBtnText = this.add
      .text(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2 + 72, '지금 다시하기', {
        fontSize: '19px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false);

    this.restartBtn.on('pointerover', () => this.restartBtn.setFillStyle(0x3d8c47));
    this.restartBtn.on('pointerout', () => this.restartBtn.setFillStyle(0x2a6632));
    this.restartBtn.on('pointerdown', () => {
      socket.emit('requestRestart');
      this.restartBtnText.setText('재시작 요청 중...');
      this.restartBtn.disableInteractive();
    });
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      jump: Phaser.Input.Keyboard.KeyCodes.W,
    });
  }

  // ── Socket ─────────────────────────────────────────────────────────────────

  setupSocket() {
    // Step 16: receive and apply game state
    this._onGameState = (state) => {
      this.gameStatus = state.status;

      this.p1Obj.setPosition(state.players.p1.x, state.players.p1.y);
      this.p2Obj.setPosition(state.players.p2.x, state.players.p2.y);
      this.ballObj.setPosition(state.ball.x, state.ball.y);
      this.scoreText.setText(`${state.score.p1} : ${state.score.p2}`);

      if (state.status === 'playing') {
        this.showOverlay(false);
        this.countdownNumText.setVisible(false);
        this.restartCountdownText.setVisible(false);
        this.restartBtn.setVisible(false);
        this.restartBtnText.setVisible(false);
        this.clearRestartCountdown();
      } else if (state.status === 'countdown') {
        this.showCountdown(state.countdown);
      } else if (state.status === 'ended') {
        this.showEndedScreen(state.winner);
      } else {
        // waiting
        this.showWaiting();
      }
    };
    socket.on('gameState', this._onGameState);

    // Step 18
    this._onOpponentLeft = () => {
      this.gameStatus = 'waiting';
      this.clearRestartCountdown();
      this.statusText.setText('상대방이 나갔습니다.\n새로운 상대를 기다리는 중...');
      this.showOverlay(true);
      this.countdownNumText.setVisible(false);
      this.restartCountdownText.setVisible(false);
      this.restartBtn.setVisible(false);
      this.restartBtnText.setVisible(false);
    };
    socket.on('opponentLeft', this._onOpponentLeft);

    this._onDisconnect = () => {
      this.statusText.setText('서버 연결이 끊겼습니다.\n페이지를 새로고침하세요.');
      this.showOverlay(true);
      this.countdownNumText.setVisible(false);
    };
    socket.on('disconnect', this._onDisconnect);
  }

  // ── Overlay helpers ────────────────────────────────────────────────────────

  showOverlay(visible) {
    this.statusOverlay.setVisible(visible);
    this.statusText.setVisible(visible);
  }

  showWaiting() {
    this.clearRestartCountdown();
    this.statusText.setText('상대를 기다리는 중...');
    this.showOverlay(true);
    this.countdownNumText.setVisible(false);
    this.restartCountdownText.setVisible(false);
    this.restartBtn.setVisible(false);
    this.restartBtnText.setVisible(false);
  }

  // Step 17: 3-2-1 countdown display
  showCountdown(n) {
    this.clearRestartCountdown();
    this.statusText.setVisible(false);
    this.statusOverlay.setVisible(true);
    this.restartCountdownText.setVisible(false);
    this.restartBtn.setVisible(false);
    this.restartBtnText.setVisible(false);

    this.countdownNumText.setText(String(n)).setVisible(true);
    // Pulse tween each number change
    this.tweens.add({
      targets: this.countdownNumText,
      scaleX: { from: 1.5, to: 1 },
      scaleY: { from: 1.5, to: 1 },
      duration: 400,
      ease: 'Power2',
    });
  }

  // Step 15/16: ended screen with auto-restart countdown
  showEndedScreen(winner) {
    this.clearRestartCountdown();

    const winnerName = winner === 'p1' ? 'P1 (파랑)' : 'P2 (빨강)';
    const isMyWin = winner === this.playerId;
    this.statusText.setText(
      `${winnerName} 승리!\n${isMyWin ? '내가 이겼다!' : '내가 졌다...'}`
    );

    this.showOverlay(true);
    this.countdownNumText.setVisible(false);
    this.restartCountdownText.setVisible(true);
    this.restartBtn.setFillStyle(0x2a6632).setVisible(true);
    this.restartBtnText.setText('지금 다시하기').setVisible(true);

    this.restartBtn.setInteractive({ useHandCursor: true });

    let secs = 5;
    this.restartCountdownText.setText(`${secs}초 후 자동 재시작`);

    this.restartCountdown = this.time.addEvent({
      delay: 1000,
      repeat: 4,
      callback: () => {
        secs--;
        this.restartCountdownText.setText(
          secs > 0 ? `${secs}초 후 자동 재시작` : '재시작 중...'
        );
      },
    });
  }

  clearRestartCountdown() {
    if (this.restartCountdown) {
      this.restartCountdown.remove(false);
      this.restartCountdown = null;
    }
  }

  // ── Update loop ────────────────────────────────────────────────────────────

  update() {
    if (this.gameStatus !== 'playing') return;

    // Combine keyboard + HTML touch input
    const left  = this.cursors.left.isDown  || this.wasd.left.isDown  || touch.left;
    const right = this.cursors.right.isDown || this.wasd.right.isDown || touch.right;
    const jump  = this.cursors.up.isDown    || this.wasd.jump.isDown  || this.cursors.space.isDown || touch.jump;

    if (
      left  !== this.lastInput.left  ||
      right !== this.lastInput.right ||
      jump  !== this.lastInput.jump
    ) {
      this.lastInput = { left, right, jump };
      socket.emit('playerInput', this.lastInput);
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  shutdown() {
    socket.off('gameState',    this._onGameState);
    socket.off('opponentLeft', this._onOpponentLeft);
    socket.off('disconnect',   this._onDisconnect);
    this.clearRestartCountdown();
    hideTouchControls();
  }
}
