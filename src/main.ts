import { runMenu } from './menu';
import { startGame, type GameOptions } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;

function play(options: GameOptions): void {
  // Online sessions cannot be reused, so only offline matches offer a rematch.
  const rematch = options.net ? undefined : () => play(options);
  startGame(canvas, options, showMenu, rematch);
}

function showMenu(): void {
  runMenu(canvas, play);
}

showMenu();
