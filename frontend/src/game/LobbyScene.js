import Phaser from 'phaser';
import { socket } from '../socket.js';
import { C } from '../constants.js';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LobbyScene' });
  }

  create() {
    // Background gradient-like layers
    this.add.rectangle(C.GAME_WIDTH / 2, C.GAME_HEIGHT / 2, C.GAME_WIDTH, C.GAME_HEIGHT, 0x0d1b3e);

    // Mini court preview at bottom
    this.add.rectangle(C.GAME_WIDTH / 2, C.GAME_HEIGHT - 30, C.GAME_WIDTH, 60, 0xc8a060);
    this.add.rectangle(C.GAME_WIDTH / 2, C.GAME_HEIGHT - 3, C.GAME_WIDTH, 6, 0x7a5230);
    this.add.rectangle(C.NET_X, C.GAME_HEIGHT - 60, C.NET_WIDTH, 54, 0xeeeeee);
    this.add.rectangle(C.NET_X, C.GAME_HEIGHT - 84, 24, 8, 0xdddddd);

    // Title
    this.add.text(C.GAME_WIDTH / 2, 105, 'VALLEYBALL', {
      fontSize: '64px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#0033aa',
      strokeThickness: 10,
    }).setOrigin(0.5);

    this.add.text(C.GAME_WIDTH / 2, 170, '2인 실시간 온라인 배구', {
      fontSize: '20px',
      color: '#88aaff',
    }).setOrigin(0.5);

    // Join button
    const btnBg = this.add.rectangle(C.GAME_WIDTH / 2, 250, 230, 62, 0x2255cc)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add.text(C.GAME_WIDTH / 2, 250, '방에 입장하기', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btnBg.on('pointerover', () => btnBg.setFillStyle(0x4477ff));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x2255cc));
    btnBg.on('pointerdown', () => {
      btnBg.setFillStyle(0x113399);
      btnText.setText('연결 중...');
      btnBg.disableInteractive();
      socket.emit('joinRoom', 'room1');
    });

    // Controls guide
    this.add.text(C.GAME_WIDTH / 2, 318, '키보드:  ← → ↑  또는  A D W   |   모바일: 화면 하단 버튼', {
      fontSize: '14px',
      color: '#6688bb',
    }).setOrigin(0.5);

    // Status message (roomFull, etc.)
    this.statusText = this.add.text(C.GAME_WIDTH / 2, 358, '', {
      fontSize: '16px',
      color: '#ffee88',
      align: 'center',
    }).setOrigin(0.5);

    // P1 / P2 color legend
    this.add.rectangle(C.GAME_WIDTH / 2 - 60, 395, 20, 20, 0x4488ff);
    this.add.text(C.GAME_WIDTH / 2 - 45, 395, 'Player 1', { fontSize: '13px', color: '#aaccff' }).setOrigin(0, 0.5);
    this.add.rectangle(C.GAME_WIDTH / 2 + 60, 395, 20, 20, 0xff4444);
    this.add.text(C.GAME_WIDTH / 2 + 75, 395, 'Player 2', { fontSize: '13px', color: '#ffaaaa' }).setOrigin(0, 0.5);

    // Socket events — use once for 'joined' so it auto-removes
    socket.once('joined', ({ playerId }) => {
      this.scene.start('GameScene', { playerId });
    });

    this._onRoomFull = () => {
      btnText.setText('방에 입장하기');
      btnBg.setFillStyle(0x2255cc);
      btnBg.setInteractive({ useHandCursor: true });
      this.statusText.setText('방이 가득 찼습니다.\n잠시 후 다시 시도하세요.');
    };
    socket.on('roomFull', this._onRoomFull);

    this._onDisconnect = () => {
      btnText.setText('방에 입장하기');
      btnBg.setFillStyle(0x663333);
      btnBg.disableInteractive();
      this.statusText.setText('서버와 연결이 끊겼습니다.\n페이지를 새로고침하세요.');
    };
    socket.on('disconnect', this._onDisconnect);
  }

  shutdown() {
    socket.off('roomFull', this._onRoomFull);
    socket.off('disconnect', this._onDisconnect);
    // 'joined' was socket.once, auto-removed
  }
}
