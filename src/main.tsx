import { Game } from "./game";
import { log } from "./lib/log";

const game = Game.instance;
log('apparatus:', game);

document.body.appendChild(game.renderer.canvas);
