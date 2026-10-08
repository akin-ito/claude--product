/// <reference lib="webworker" />
import { chooseChessMove } from '../games/chess/engine';
import { chooseGoMove } from '../games/go/engine';
import { chooseGomokuMove } from '../games/gomoku/engine';
import { chooseOthelloMove } from '../games/othello/engine';
import { chooseShogiMove } from '../games/shogi/engine';
import type { Level } from './types';

const choosers: Record<string, (s: any, level: Level) => unknown> = {
  gomoku: chooseGomokuMove,
  othello: chooseOthelloMove,
  chess: chooseChessMove,
  shogi: chooseShogiMove,
  go: chooseGoMove,
};

self.onmessage = (e: MessageEvent<{ id: number; game: string; state: unknown; level: Level }>) => {
  const { id, game, state, level } = e.data;
  const move = choosers[game](state, level);
  self.postMessage({ id, move });
};
