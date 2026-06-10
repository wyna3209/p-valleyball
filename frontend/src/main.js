import Phaser from 'phaser';
import { LobbyScene } from './game/LobbyScene.js';
import { GameScene } from './game/GameScene.js';
import { C } from './constants.js';
import { initTouchControls } from './touchControls.js';
import './style.css';

initTouchControls();

const config = {
  type: Phaser.AUTO,
  width: C.GAME_WIDTH,
  height: C.GAME_HEIGHT,
  parent: 'app',
  backgroundColor: '#0d1b3e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [LobbyScene, GameScene],
};

new Phaser.Game(config);
