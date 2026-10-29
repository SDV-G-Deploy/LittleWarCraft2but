import { runMenu } from './menu';
import { startGame, type GameOptions } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;

function showMenu(): void {
  runMenu(canvas, (options: GameOptions) => {
    startGame(canvas, options, showMenu);
  });
}

showMenu();
