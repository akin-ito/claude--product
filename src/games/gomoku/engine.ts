import { Deadline, isAbort } from '../../core/search';
import type { GameEngine, Level, Outcome, Player } from '../../core/types';

export const SIZE = 15;
const N = SIZE * SIZE;

/**
 * free     = 自由ルール（五つ以上並べば勝ち）
 * standard = 標準ルール（ちょうど五つで勝ち。六つ以上の長連は勝ちにならない）
 * renju    = 連珠（黒だけに三三・四四・長連の禁じ手。白は長連でも勝ち）
 */
export type GomokuRule = 'free' | 'standard' | 'renju';

export interface GomokuOptions {
  rule: GomokuRule;
}

/** 盤面: 0 = 空, 1 = 黒, 2 = 白 */
export interface GomokuState {
  board: number[];
  turn: Player;
  last: number;
  winLine: number[] | null;
  moves: number;
  rule: GomokuRule;
}

export type GomokuMove = number;

const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

/** i を通る (dr, dc) 方向の、i と同じ色の連続した石 */
function lineThrough(board: number[], i: number, dr: number, dc: number, color = board[i]): number[] {
  const r0 = Math.floor(i / SIZE);
  const c0 = i % SIZE;
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
  return line;
}

/** その長さの並びが勝ちになるか */
function isWinningLength(len: number, color: number, rule: GomokuRule): boolean {
  if (rule === 'free') return len >= 5;
  if (rule === 'standard') return len === 5;
  return color === 1 ? len === 5 : len >= 5;
}

/** i に置いた石で勝ちが成立していれば、並んだ石の位置を返す */
function findWin(board: number[], i: number, rule: GomokuRule): number[] | null {
  for (const [dr, dc] of DIRS) {
    const line = lineThrough(board, i, dr, dc);
    if (isWinningLength(line.length, board[i], rule)) return line;
  }
  return null;
}

// ---------------------------------------------------------------- 連珠の禁じ手

/**
 * 黒石 p を含む (dr, dc) 方向で、あと 1 つ置けばちょうど五になる空点（「五の点」）。
 * board[p] には黒が置かれている前提。
 */
function fivePoints(board: number[], p: number, dr: number, dc: number): number[] {
  const r0 = Math.floor(p / SIZE);
  const c0 = p % SIZE;
  const out: number[] = [];
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const r = r0 + dr * k;
    const c = c0 + dc * k;
    if (!inside(r, c)) continue;
    const q = r * SIZE + c;
    if (board[q] !== 0) continue;
    board[q] = 1;
    const line = lineThrough(board, q, dr, dc, 1);
    board[q] = 0;
    if (line.length === 5 && line.includes(p)) out.push(q);
  }
  return out;
}

/** 五の点が 2 つあり、それが連続した 4 つの両端なら「達四」（四としては 1 つ） */
function isStraightFour(points: number[], dr: number, dc: number): boolean {
  if (points.length !== 2) return false;
  const step = dr * SIZE + dc;
  return Math.abs(points[0] - points[1]) === 5 * Math.abs(step);
}

/** p の (dr, dc) 方向にできている四の数（一直線上の四四は 2） */
function countFours(board: number[], p: number, dr: number, dc: number): number {
  const pts = fivePoints(board, p, dr, dc);
  if (pts.length === 0) return 0;
  return isStraightFour(pts, dr, dc) ? 1 : Math.min(pts.length, 2);
}

/** p の (dr, dc) 方向が「三」（禁じ手でない一手で達四にできる）か */
function isThree(board: number[], p: number, dr: number, dc: number, depth: number): boolean {
  const r0 = Math.floor(p / SIZE);
  const c0 = p % SIZE;
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const r = r0 + dr * k;
    const c = c0 + dc * k;
    if (!inside(r, c)) continue;
    const q = r * SIZE + c;
    if (board[q] !== 0) continue;
    board[q] = 1;
    const straight = isStraightFour(fivePoints(board, p, dr, dc), dr, dc);
    board[q] = 0;
    if (straight && (depth >= 3 || !forbiddenAt(board, q, depth + 1))) return true;
  }
  return false;
}

function forbiddenAt(board: number[], p: number, depth: number): boolean {
  if (board[p] !== 0) return false;
  board[p] = 1;
  try {
    let fours = 0;
    let threes = 0;
    let overline = false;
    for (const [dr, dc] of DIRS) {
      const len = lineThrough(board, p, dr, dc).length;
      if (len === 5) return false; // 五ができれば禁じ手より優先して勝ち
      if (len >= 6) overline = true;
    }
    if (overline) return true;
    for (const [dr, dc] of DIRS) fours += countFours(board, p, dr, dc);
    if (fours >= 2) return true;
    for (const [dr, dc] of DIRS) if (isThree(board, p, dr, dc, depth)) threes++;
    return threes >= 2;
  } finally {
    board[p] = 0;
  }
}

/** 連珠で、黒が p に打つと禁じ手（三三・四四・長連）になるか */
export function isForbidden(board: number[], p: number): boolean {
  return forbiddenAt(board.slice(), p, 0);
}

export function isLegal(s: GomokuState, m: GomokuMove): boolean {
  if (s.winLine || m < 0 || m >= N || s.board[m] !== 0) return false;
  return !(s.rule === 'renju' && s.turn === 0 && isForbidden(s.board, m));
}

export const gomoku: GameEngine<GomokuState, GomokuMove, GomokuOptions> = {
  initial({ rule }) {
    return { board: new Array(N).fill(0), turn: 0, last: -1, winLine: null, moves: 0, rule };
  },
  turn: (s) => s.turn,
  apply(s, m) {
    const board = s.board.slice();
    board[m] = s.turn + 1;
    return {
      board,
      turn: s.turn === 0 ? 1 : 0,
      last: m,
      winLine: findWin(board, m, s.rule),
      moves: s.moves + 1,
      rule: s.rule,
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

/** 実際にその手で勝てるか（ルールの長連の扱いを考慮） */
function winsWith(board: number[], p: number, color: number, rule: GomokuRule): boolean {
  board[p] = color;
  const win = findWin(board, p, rule) !== null;
  board[p] = 0;
  return win;
}

export function chooseGomokuMove(s: GomokuState, level: Level): GomokuMove {
  const center = Math.floor(N / 2);
  if (s.moves === 0) return center;
  const color = s.turn + 1;
  const opp = 3 - color;
  const rule = s.rule;
  const board = s.board.slice();
  let scored = scoreCandidates(board, color);
  if (rule === 'renju' && color === 1) scored = scored.filter((x) => !isForbidden(board, x.move));
  if (scored.length === 0) return board.findIndex((v, i) => v === 0 && isLegal(s, i));

  // 勝てる手があれば打つ
  const win = scored.find((x) => winsWith(board, x.move, color, rule));
  if (win) return win.move;

  if (level === 1) {
    // 弱い: 守りが甘く、ゆらぎも大きい
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

  // 相手の勝ちを止める（連珠で相手の黒が禁じ手になる点は止めなくてよい）
  const threats = scored.filter(
    (x) => winsWith(board, x.move, opp, rule) && !(rule === 'renju' && opp === 1 && isForbidden(board, x.move)),
  );
  if (threats.length) return threats[0].move;

  scored.sort((a, b) => b.attack + b.defense * 0.85 - (a.attack + a.defense * 0.85));
  if (level === 2) return scored[0].move;

  // 強い: 上位候補について 4 手先まで読む
  const deadline = new Deadline(2500);
  let bestMove = scored[0].move;
  try {
    for (const depth of [2, 4]) {
      let alpha = -Infinity;
      let iterBest = bestMove;
      for (const { move } of scored.slice(0, BEAM + 2)) {
        board[move] = color;
        const v = -negamax(board, opp, depth - 1, -Infinity, -alpha, deadline);
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
