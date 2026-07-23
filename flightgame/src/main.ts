import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root') as HTMLElement;

if (!canvas || !uiRoot) {
  throw new Error('Missing #game-canvas or #ui-root');
}

new Game(canvas, uiRoot);
