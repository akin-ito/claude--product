/// <reference lib="webworker" />
import { chooseChessMove } from '../games/chess/engine';
import { chooseGoMove } from '../games/go/engine';
import { chooseGomokuMove } from '../games/gomoku/engine';
import { chooseReversiMove } from '../games/reversi/engine';
import { chooseShogiMove } from '../games/shogi/engine';
import type { Level } from './types';

const choosers: Record<string, (s: any, level: Level, budgetMs?: number) => unknown> = {
  gomoku: chooseGomokuMove,
  reversi: chooseReversiMove,
  chess: chooseChessMove,
  shogi: chooseShogiMove,
  go: chooseGoMove,
};

self.onmessage = (e: MessageEvent<{ id: number; game: string; state: unknown; level: Level; budgetMs?: number }>) => {
  const { id, game, state, level, budgetMs } = e.data;
  const move = choosers[game](state, level, budgetMs);
  self.postMessage({ id, move });
};
