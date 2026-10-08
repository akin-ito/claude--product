import { Deadline, isAbort } from '../../core/search';
import type { GameEngine, Level, Outcome, Player } from '../../core/types';

export const SIZE = 15;
const N = SIZE * SIZE;

/** 盤面: 0 = 空, 1 = 黒, 2 = 白 */
export interface GomokuState {
  board: number[];
  turn: Player;
  last: number;
  winLine: number[] | null;
  moves: number;
}

export type GomokuMove = number;

const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** i に置いた石を含めて 5 つ以上並んでいれば、その石の位置を返す */
function findFive(board: number[], i: number): number[] | null {
  const color = board[i];
  const r0 = Math.floor(i / SIZE);
  const c0 = i % SIZE;
  for (const [dr, dc] of DIRS) {
    const line = [i];
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (inside(r, c) && board[r * SIZE + c] === color) {
        line.push(r * SIZE + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export function isLegal(s: GomokuState, m: GomokuMove): boolean {
  return !s.winLine && m >= 0 && m < N && s.board[m] === 0;
}

export const gomoku: GameEngine<GomokuState, GomokuMove> = {
  initial() {
    return { board: new Array(N).fill(0), turn: 0, last: -1, winLine: null, moves: 0 };
  },
  turn: (s) => s.turn,
  apply(s, m) {
    const board = s.board.slice();
    board[m] = s.turn + 1;
    return {
      board,
      turn: s.turn === 0 ? 1 : 0,
      last: m,
      winLine: findFive(board, m),
      moves: s.moves + 1,
    };
  },
  outcome(s): Outcome | null {
    if (s.winLine) return { winner: (s.board[s.last] - 1) as Player, reason: '五目並び' };
    if (s.moves >= N) return { winner: null, reason: '盤が埋まりました' };
    return null;
  },
};

// ---------------------------------------------------------------- CPU

/** 5 マスの窓に自分の石が n 個（相手の石なし）あるときの評価 */
const WINDOW = [0, 1, 12, 120, 2500, 1_000_000];
const WIN = 10_000_000;

/** color の石を i に置いたと仮定した、i を含む全ての 5 マス窓の評価の合計 */
function cellScore(board: number[], i: number, color: number): number {
  const r0 = Math.floor(i / SIZE);
  const c0 = i % SIZE;
  let total = 0;
  for (const [dr, dc] of DIRS) {
    for (let k = 0; k < 5; k++) {
      const sr = r0 - dr * k;
      const sc = c0 - dc * k;
      if (!inside(sr, sc) || !inside(sr + dr * 4, sc + dc * 4)) continue;
      let own = 0;
      let blocked = false;
      for (let t = 0; t < 5; t++) {
        const v = board[(sr + dr * t) * SIZE + sc + dc * t];
        if (v === color) own++;
        else if (v !== 0) {
          blocked = true;
          break;
        }
      }
      if (!blocked) total += WINDOW[own + 1];
    }
  }
  return total;
}

/** 既存の石から 2 マス以内の空点を候補にする */
function candidates(board: number[]): number[] {
  const mark = new Uint8Array(N);
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    if (board[i] === 0) continue;
    const r0 = Math.floor(i / SIZE);
    const c0 = i % SIZE;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (!inside(r, c)) continue;
        const j = r * SIZE + c;
        if (board[j] === 0 && !mark[j]) {
          mark[j] = 1;
          out.push(j);
        }
      }
    }
  }
  return out;
}

interface Scored {
  move: number;
  attack: number;
  defense: number;
}

function scoreCandidates(board: number[], color: number): Scored[] {
  const opp = 3 - color;
  return candidates(board).map((move) => ({
    move,
    attack: cellScore(board, move, color),
    defense: cellScore(board, move, opp),
  }));
}

/** 盤面全体の評価（color 側から見た値） */
function evaluate(board: number[], color: number): number {
  let score = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of DIRS) {
        if (!inside(r + dr * 4, c + dc * 4)) continue;
        let mine = 0;
        let theirs = 0;
        for (let t = 0; t < 5; t++) {
          const v = board[(r + dr * t) * SIZE + c + dc * t];
          if (v === color) mine++;
          else if (v !== 0) theirs++;
        }
        if (mine && !theirs) score += WINDOW[mine] * 1.2;
        else if (theirs && !mine) score -= WINDOW[theirs];
      }
    }
  }
  return score;
}

const BEAM = 10;

function negamax(
  board: number[],
  color: number,
  depth: number,
  alpha: number,
  beta: number,
  deadline: Deadline,
): number {
  deadline.check();
  const scored = scoreCandidates(board, color);
  if (scored.length === 0) return 0;
  for (const s of scored) if (s.attack >= WINDOW[5]) return WIN + depth;
  if (depth === 0) return evaluate(board, color);

  scored.sort((a, b) => b.attack + b.defense - (a.attack + a.defense));
  // 相手の四を止めなければならない場合は、その手しか読まない
  const forced = scored.filter((s) => s.defense >= WINDOW[5]);
  const list = forced.length ? forced : scored.slice(0, BEAM);

  let best = -Infinity;
  for (const { move } of list) {
    board[move] = color;
    const v = -negamax(board, 3 - color, depth - 1, -beta, -alpha, deadline);
    board[move] = 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseGomokuMove(s: GomokuState, level: Level): GomokuMove {
  const center = Math.floor(N / 2);
  if (s.moves === 0) return center;
  const color = s.turn + 1;
  const scored = scoreCandidates(s.board, color);

  if (level === 1) {
    // 弱い: 守りが甘く、ゆらぎも大きい
    const win = scored.find((x) => x.attack >= WINDOW[5]);
    if (win) return win.move;
    let best = scored[0];
    let bestVal = -Infinity;
    for (const x of scored) {
      const v = x.attack + x.defense * 0.35 + Math.random() * 150;
      if (v > bestVal) {
        bestVal = v;
        best = x;
      }
    }
    return best.move;
  }

  scored.sort((a, b) => b.attack + b.defense * 0.85 - (a.attack + a.defense * 0.85));
  if (level === 2) return scored[0].move;

  // 強い: 上位候補について 4 手先まで読む
  const win = scored.find((x) => x.attack >= WINDOW[5]);
  if (win) return win.move;
  const forced = scored.filter((x) => x.defense >= WINDOW[5]);
  if (forced.length) return forced[0].move;

  const board = s.board.slice();
  const deadline = new Deadline(2500);
  let bestMove = scored[0].move;
  try {
    for (const depth of [2, 4]) {
      let alpha = -Infinity;
      let iterBest = bestMove;
      for (const { move } of scored.slice(0, BEAM + 2)) {
        board[move] = color;
        const v = -negamax(board, 3 - color, depth - 1, -Infinity, -alpha, deadline);
        board[move] = 0;
        if (v > alpha) {
          alpha = v;
          iterBest = move;
        }
      }
      bestMove = iterBest;
    }
  } catch (e) {
    if (!isAbort(e)) throw e;
  }
  return bestMove;
}
