import { Deadline, isAbort } from '../../core/search';
import type { GameEngine, Level, Outcome, Player } from '../../core/types';

/** 盤面: 0 = 空, 1 = 黒, 2 = 白 */
export interface OthelloState {
  board: number[];
  turn: Player;
  last: number;
  /** 直前にパスした手番（表示用） */
  passed: Player | null;
  over: boolean;
}

export type OthelloMove = number;

const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

/** dir 方向に進んだマス。盤外なら -1 */
function step(i: number, dir: number): number {
  const c = i % 8;
  if ((dir === -9 || dir === -1 || dir === 7) && c === 0) return -1;
  if ((dir === -7 || dir === 1 || dir === 9) && c === 7) return -1;
  const j = i + dir;
  return j >= 0 && j < 64 ? j : -1;
}

function flips(board: number[], i: number, color: number): number[] {
  if (board[i] !== 0) return [];
  const opp = 3 - color;
  const out: number[] = [];
  for (const d of DIRS) {
    const line: number[] = [];
    let j = step(i, d);
    while (j >= 0 && board[j] === opp) {
      line.push(j);
      j = step(j, d);
    }
    if (line.length && j >= 0 && board[j] === color) out.push(...line);
  }
  return out;
}

function canFlip(board: number[], i: number, color: number): boolean {
  if (board[i] !== 0) return false;
  const opp = 3 - color;
  for (const d of DIRS) {
    let j = step(i, d);
    let n = 0;
    while (j >= 0 && board[j] === opp) {
      j = step(j, d);
      n++;
    }
    if (n && j >= 0 && board[j] === color) return true;
  }
  return false;
}

export function movesFor(board: number[], color: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if (canFlip(board, i, color)) out.push(i);
  return out;
}

export function legalMoves(s: OthelloState): number[] {
  return s.over ? [] : movesFor(s.board, s.turn + 1);
}

function place(board: number[], i: number, color: number): number[] {
  const next = board.slice();
  next[i] = color;
  for (const j of flips(board, i, color)) next[j] = color;
  return next;
}

export function count(board: number[]): [number, number] {
  let b = 0;
  let w = 0;
  for (const v of board) {
    if (v === 1) b++;
    else if (v === 2) w++;
  }
  return [b, w];
}

export const othello: GameEngine<OthelloState, OthelloMove> = {
  initial() {
    const board = new Array(64).fill(0);
    board[27] = 2;
    board[28] = 1;
    board[35] = 1;
    board[36] = 2;
    return { board, turn: 0, last: -1, passed: null, over: false };
  },
  turn: (s) => s.turn,
  apply(s, m) {
    const board = place(s.board, m, s.turn + 1);
    const next: Player = s.turn === 0 ? 1 : 0;
    // 次の手番に打てる場所がなければ自動でパス
    if (movesFor(board, next + 1).length) return { board, turn: next, last: m, passed: null, over: false };
    if (movesFor(board, s.turn + 1).length) return { board, turn: s.turn, last: m, passed: next, over: false };
    return { board, turn: next, last: m, passed: null, over: true };
  },
  outcome(s): Outcome | null {
    if (!s.over) return null;
    const [b, w] = count(s.board);
    if (b === w) return { winner: null, reason: `${b} 対 ${w}` };
    // 日本オセロ連盟の競技ルール: 空きマスは勝者の石数に加える
    const empty = 64 - b - w;
    const final = b > w ? `${b + empty} 対 ${w}` : `${b} 対 ${w + empty}`;
    const note = empty ? `（空き${empty}マスは勝者に加算）` : '';
    return { winner: b > w ? 0 : 1, reason: final + note };
  },
};

// ---------------------------------------------------------------- CPU

const WEIGHTS = [
  100, -25, 10, 5, 5, 10, -25, 100,
  -25, -45, -2, -2, -2, -2, -45, -25,
  10, -2, 2, 1, 1, 2, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 2, 1, 1, 2, -2, 10,
  -25, -45, -2, -2, -2, -2, -45, -25,
  100, -25, 10, 5, 5, 10, -25, 100,
];

const CORNER_OF: Record<number, number> = { 1: 0, 8: 0, 9: 0, 6: 7, 15: 7, 14: 7, 48: 56, 57: 56, 49: 56, 55: 63, 62: 63, 54: 63 };

function evaluate(board: number[], color: number): number {
  const opp = 3 - color;
  let pos = 0;
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    if (v === 0) continue;
    // 角が埋まっていれば、隣接マスの減点は不要
    const w = CORNER_OF[i] !== undefined && board[CORNER_OF[i]] !== 0 ? 0 : WEIGHTS[i];
    pos += v === color ? w : -w;
  }
  const mob = movesFor(board, color).length - movesFor(board, opp).length;
  return pos + mob * 8;
}

const BIG = 1_000_000;

function finalScore(board: number[], color: number): number {
  const [b, w] = count(board);
  const diff = color === 1 ? b - w : w - b;
  return diff * 10_000 + (diff > 0 ? BIG : diff < 0 ? -BIG : 0);
}

function negamax(
  board: number[],
  color: number,
  depth: number,
  alpha: number,
  beta: number,
  passed: boolean,
  deadline: Deadline,
): number {
  deadline.check();
  const moves = movesFor(board, color);
  if (moves.length === 0) {
    if (passed) return finalScore(board, color);
    return -negamax(board, 3 - color, depth, -beta, -alpha, true, deadline);
  }
  if (depth === 0) return evaluate(board, color);
  moves.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  let best = -Infinity;
  for (const m of moves) {
    const v = -negamax(place(board, m, color), 3 - color, depth - 1, -beta, -alpha, false, deadline);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function searchRoot(board: number[], color: number, moves: number[], depth: number, deadline: Deadline): number {
  let best = moves[0];
  let alpha = -Infinity;
  for (const m of moves) {
    const v = -negamax(place(board, m, color), 3 - color, depth - 1, -Infinity, -alpha, false, deadline);
    if (v > alpha) {
      alpha = v;
      best = m;
    }
  }
  return best;
}

export function chooseOthelloMove(s: OthelloState, level: Level): OthelloMove {
  const color = s.turn + 1;
  const moves = legalMoves(s);
  if (moves.length === 1) return moves[0];

  if (level === 1) {
    // 弱い: 1 手先の評価 + 大きなゆらぎ
    let best = moves[0];
    let bestVal = -Infinity;
    for (const m of moves) {
      const v = -evaluate(place(s.board, m, color), 3 - color) + Math.random() * 60;
      if (v > bestVal) {
        bestVal = v;
        best = m;
      }
    }
    return best;
  }

  const empties = s.board.filter((v) => v === 0).length;
  const maxDepth = level === 2 ? 3 : 7;
  const exactAt = level === 2 ? 6 : 12;
  const deadline = new Deadline(level === 2 ? 1500 : 3000);
  const ordered = moves.slice().sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  let best = ordered[0];
  try {
    if (empties <= exactAt) return searchRoot(s.board, color, ordered, 64, deadline);
    for (let d = 1; d <= maxDepth; d++) {
      best = searchRoot(s.board, color, ordered, d, deadline);
      ordered.splice(ordered.indexOf(best), 1);
      ordered.unshift(best);
    }
  } catch (e) {
    if (!isAbort(e)) throw e;
  }
  return best;
}
