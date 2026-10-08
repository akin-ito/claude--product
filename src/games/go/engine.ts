import { seededRandom } from '../../core/search';
import type { GameEngine, Level, Outcome, Player } from '../../core/types';

/** 盤面: 0 = 空, 1 = 黒, 2 = 白 */
export interface GoState {
  size: number;
  board: number[];
  turn: Player;
  /** 直後に打てないコウの位置。なければ -1 */
  ko: number;
  /** captures[0] = 黒が取った石の数（アゲハマ） */
  captures: [number, number];
  /** 連続したパスの数 */
  passes: number;
  /** play = 対局中, scoring = 死石の確認中, ended = 終局 */
  phase: 'play' | 'scoring' | 'ended';
  /** 死石と判定された石の位置 */
  dead: number[];
  komi: number;
  /** 置石の数（0 = 互先・定先） */
  handicap: number;
  last: number;
  moveCount: number;
  /** 着手後の盤面（同形反復の判定用） */
  seen: string[];
  /** 三コウなどの同形反復で無勝負になった */
  noResult: boolean;
}

export type GoMove =
  | { t: 'play'; p: number }
  | { t: 'pass' }
  /** 死石の確認中に、石のグループの生き死にを切り替える */
  | { t: 'toggle'; p: number }
  /** 死石の確認を終えて終局する */
  | { t: 'done' }
  /** 死石の確認をやめて対局に戻る */
  | { t: 'resume' };

export interface GoOptions {
  size: number;
  /** 'even' = 互先（コミ6目半）, 'sente' = 定先（コミなし）, 数値 = 置石の数 */
  handicap: 'even' | 'sente' | number;
}

/** 置石の位置（黒から見た標準の配置）。row 0 が盤の上辺 */
export function handicapPoints(size: number, stones: number): number[] {
  const lo = size >= 13 ? 3 : 2;
  const hi = size - 1 - lo;
  const mid = (size - 1) / 2;
  const at = (r: number, c: number) => r * size + c;
  const upperRight = at(lo, hi);
  const lowerLeft = at(hi, lo);
  const lowerRight = at(hi, hi);
  const upperLeft = at(lo, lo);
  const center = at(mid, mid);
  const left = at(mid, lo);
  const right = at(mid, hi);
  const top = at(lo, mid);
  const bottom = at(hi, mid);
  const corners = [upperRight, lowerLeft, lowerRight, upperLeft];
  switch (stones) {
    case 2: return [upperRight, lowerLeft];
    case 3: return [upperRight, lowerLeft, lowerRight];
    case 4: return corners;
    case 5: return [...corners, center];
    case 6: return [...corners, left, right];
    case 7: return [...corners, left, right, center];
    case 8: return [...corners, left, right, top, bottom];
    case 9: return [...corners, left, right, top, bottom, center];
    default: return [];
  }
}

/** その盤で選べる置石の最大数 */
export const maxHandicap = (size: number) => (size >= 13 ? 9 : 5);

const boardKey = (board: number[], turn: Player) => board.join('') + turn;

const neighborCache = new Map<number, number[][]>();
export function neighbors(size: number): number[][] {
  let n = neighborCache.get(size);
  if (!n) {
    n = [];
    for (let i = 0; i < size * size; i++) {
      const r = Math.floor(i / size);
      const c = i % size;
      const list: number[] = [];
      if (r > 0) list.push(i - size);
      if (r < size - 1) list.push(i + size);
      if (c > 0) list.push(i - 1);
      if (c < size - 1) list.push(i + 1);
      n.push(list);
    }
    neighborCache.set(size, n);
  }
  return n;
}

/** i を含む連の石と、呼吸点の数 */
export function groupAt(board: ArrayLike<number>, size: number, i: number): { stones: number[]; liberties: number } {
  const nb = neighbors(size);
  const color = board[i];
  const seen = new Set<number>([i]);
  const libs = new Set<number>();
  const stack = [i];
  const stones: number[] = [];
  while (stack.length) {
    const j = stack.pop()!;
    stones.push(j);
    for (const k of nb[j]) {
      const v = board[k];
      if (v === 0) libs.add(k);
      else if (v === color && !seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
    }
  }
  return { stones, liberties: libs.size };
}

interface PlayResult {
  board: number[];
  captured: number;
  ko: number;
}

/** 石を置いた結果。置けない（自殺手）なら null */
function tryPlay(board: number[], size: number, p: number, color: number): PlayResult | null {
  if (board[p] !== 0) return null;
  const nb = neighbors(size);
  const next = board.slice();
  next[p] = color;
  const opp = 3 - color;
  let captured = 0;
  let lastCaptured = -1;
  for (const k of nb[p]) {
    if (next[k] !== opp) continue;
    const g = groupAt(next, size, k);
    if (g.liberties === 0) {
      for (const st of g.stones) next[st] = 0;
      captured += g.stones.length;
      lastCaptured = g.stones[0];
    }
  }
  const own = groupAt(next, size, p);
  if (own.liberties === 0) return null;
  const ko = captured === 1 && own.stones.length === 1 && own.liberties === 1 ? lastCaptured : -1;
  return { board: next, captured, ko };
}

export function isLegalPlay(s: GoState, p: number): boolean {
  return s.phase === 'play' && p !== s.ko && tryPlay(s.board, s.size, p, s.turn + 1) !== null;
}

// ---------------------------------------------------------------- 地の計算

export interface Score {
  black: number;
  white: number;
  /** 各点の帰属: 1 = 黒地, 2 = 白地, 0 = どちらでもない */
  territory: number[];
}

/** そこに c の石を置くと、置いた石の連がアタリ以下になる（自殺手を含む） */
function selfAtari(board: number[], size: number, p: number, c: number): boolean {
  const res = tryPlay(board, size, p, c);
  return !res || groupAt(res.board, size, p).liberties <= 1;
}

/**
 * 日本ルール: 地 + アゲハマ + 死石（白にはコミを加える）。
 * セキの石が囲んでいる眼は地にしない。
 */
export function score(s: GoState): Score {
  const n = s.size * s.size;
  const nb = neighbors(s.size);
  const deadSet = new Set(s.dead);
  const alive = s.board.map((v, i) => (deadSet.has(i) ? 0 : v));
  const territory = new Array(n).fill(0);
  const seen = new Uint8Array(n);
  const regions: { points: number[]; borders: Set<number>; stones: Set<number> }[] = [];
  for (let i = 0; i < n; i++) {
    if (alive[i] !== 0 || seen[i]) continue;
    const points: number[] = [];
    const borders = new Set<number>();
    const stones = new Set<number>();
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      points.push(j);
      for (const k of nb[j]) {
        if (alive[k] !== 0) {
          borders.add(alive[k]);
          stones.add(k);
        } else if (!seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    regions.push({ points, borders, stones });
  }

  // セキの判定: 黒白どちらが打っても自分がアタリになる共有のダメに接する連はセキ
  const inSeki = new Uint8Array(n);
  for (const r of regions) {
    if (r.borders.size !== 2) continue;
    const sekiPoint = r.points.some(
      (p) => nb[p].some((k) => alive[k] !== 0) && selfAtari(alive, s.size, p, 1) && selfAtari(alive, s.size, p, 2),
    );
    if (!sekiPoint) continue;
    for (const st of r.stones) {
      if (inSeki[st]) continue;
      for (const g of groupAt(alive, s.size, st).stones) inSeki[g] = 1;
    }
  }

  for (const r of regions) {
    if (r.borders.size !== 1) continue;
    if ([...r.stones].some((st) => inSeki[st])) continue;
    const owner = [...r.borders][0];
    for (const j of r.points) territory[j] = owner;
  }
  let black = s.captures[0];
  let white = s.captures[1] + s.komi;
  for (let i = 0; i < n; i++) {
    if (territory[i] === 1) black++;
    else if (territory[i] === 2) white++;
  }
  // 死石はアゲハマとして相手に加える
  for (const d of s.dead) {
    if (s.board[d] === 1) white++;
    else if (s.board[d] === 2) black++;
  }
  return { black, white, territory };
}

// ---------------------------------------------------------------- プレイアウト

/** color にとっての眼（自分で埋めると損な点）か */
function isEye(board: ArrayLike<number>, size: number, p: number, color: number): boolean {
  const nb = neighbors(size);
  for (const k of nb[p]) if (board[k] !== color) return false;
  const r = Math.floor(p / size);
  const c = p % size;
  let bad = 0;
  let diagonals = 0;
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
    diagonals++;
    const v = board[rr * size + cc];
    if (v !== 0 && v !== color) bad++;
  }
  return diagonals === 4 ? bad <= 1 : bad === 0;
}

/**
 * 盤が埋まるまでランダムに打ち合い、最終盤面を返す（中国ルール相当で数えるための形）。
 */
function playout(start: number[], size: number, firstColor: number, rand: () => number): number[] {
  let board = start.slice();
  let color = firstColor;
  let passes = 0;
  let ko = -1;
  const n = size * size;
  const limit = n * 3;
  const empties: number[] = [];
  for (let moves = 0; moves < limit && passes < 2; moves++) {
    empties.length = 0;
    for (let i = 0; i < n; i++) if (board[i] === 0) empties.push(i);
    let played = false;
    while (empties.length) {
      const k = Math.floor(rand() * empties.length);
      const p = empties[k];
      empties[k] = empties[empties.length - 1];
      empties.pop();
      if (p === ko || isEye(board, size, p, color)) continue;
      const res = tryPlay(board, size, p, color);
      if (!res) continue;
      board = res.board;
      ko = res.ko;
      played = true;
      break;
    }
    passes = played ? 0 : passes + 1;
    if (!played) ko = -1;
    color = 3 - color;
  }
  return board;
}

/** 終局盤面の各点の持ち主（石 or その石だけに囲まれた空点） */
function owners(board: number[], size: number): number[] {
  const nb = neighbors(size);
  return board.map((v, i) => {
    if (v !== 0) return v;
    let owner = 0;
    for (const k of nb[i]) {
      if (board[k] === 0) return 0;
      if (owner === 0) owner = board[k];
      else if (owner !== board[k]) return 0;
    }
    return owner;
  });
}

/** プレイアウトで各点の帰属を推定し、相手の地になりやすい石を死石とする */
export function estimateDead(s: GoState, playouts = 120): number[] {
  const n = s.size * s.size;
  const rand = seededRandom(s.moveCount * 7919 + n);
  const blackOwned = new Array(n).fill(0);
  for (let k = 0; k < playouts; k++) {
    const own = owners(playout(s.board, s.size, s.turn + 1, rand), s.size);
    for (let i = 0; i < n; i++) if (own[i] === 1) blackOwned[i]++;
  }
  const dead: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = s.board[i];
    const ratio = blackOwned[i] / playouts;
    if ((v === 1 && ratio < 0.3) || (v === 2 && ratio > 0.7)) dead.push(i);
  }
  return dead;
}

// ---------------------------------------------------------------- エンジン

function toggleGroup(s: GoState, p: number): number[] {
  if (s.board[p] === 0) return s.dead;
  const { stones } = groupAt(s.board, s.size, p);
  const deadSet = new Set(s.dead);
  const makeDead = !deadSet.has(p);
  for (const st of stones) {
    if (makeDead) deadSet.add(st);
    else deadSet.delete(st);
  }
  return [...deadSet];
}

export const go: GameEngine<GoState, GoMove, GoOptions> = {
  initial({ size, handicap }) {
    const board = new Array(size * size).fill(0);
    const stones = typeof handicap === 'number' ? Math.min(handicap, maxHandicap(size)) : 0;
    for (const p of handicapPoints(size, stones)) board[p] = 1;
    // 置き碁は白から打ち、コミはなし。定先もコミなし
    const turn: Player = stones >= 2 ? 1 : 0;
    return {
      size,
      board,
      turn,
      ko: -1,
      captures: [0, 0],
      passes: 0,
      phase: 'play',
      dead: [],
      komi: handicap === 'even' ? 6.5 : 0,
      handicap: stones,
      last: -1,
      moveCount: 0,
      seen: [boardKey(board, turn)],
      noResult: false,
    };
  },
  turn: (s) => s.turn,
  cpuCanAct: (s) => s.phase === 'play',
  apply(s, m) {
    const next = s.turn === 0 ? 1 : 0;
    switch (m.t) {
      case 'play': {
        const res = tryPlay(s.board, s.size, m.p, s.turn + 1)!;
        const captures: [number, number] = [...s.captures];
        captures[s.turn] += res.captured;
        const key = boardKey(res.board, next);
        // 同じ全局面が 3 回目に現れたら、三コウ・長生などの循環とみなして無勝負
        const noResult = s.noResult || s.seen.filter((k) => k === key).length >= 2;
        return {
          ...s,
          board: res.board,
          turn: next,
          ko: res.ko,
          captures,
          passes: 0,
          last: m.p,
          moveCount: s.moveCount + 1,
          seen: [...s.seen, key],
          noResult,
        };
      }
      case 'pass': {
        const after: GoState = { ...s, turn: next, ko: -1, passes: s.passes + 1, last: -1, moveCount: s.moveCount + 1 };
        if (after.passes < 2) return after;
        return { ...after, phase: 'scoring', dead: estimateDead(after) };
      }
      case 'toggle':
        return { ...s, dead: toggleGroup(s, m.p) };
      case 'done':
        return { ...s, phase: 'ended' };
      case 'resume':
        return { ...s, phase: 'play', passes: 0, dead: [] };
    }
  },
  outcome(s): Outcome | null {
    if (s.noResult) return { winner: null, reason: '同形反復（三コウなど）のため無勝負' };
    if (s.phase !== 'ended') return null;
    const { black, white } = score(s);
    const diff = Math.abs(black - white);
    const reason = `黒 ${black}目・白 ${white}目`;
    if (black === white) return { winner: null, reason: `持碁（${reason}）` };
    return { winner: black > white ? 0 : 1, reason: `${diff}目差（${reason}）` };
  },
};

// ---------------------------------------------------------------- CPU

/** 中国ルール相当（石 + 地）で数えた、color 側から見た差 */
function areaDiff(board: number[], size: number, color: number, komi: number): number {
  const own = owners(board, size);
  let b = 0;
  let w = 0;
  for (const v of own) {
    if (v === 1) b++;
    else if (v === 2) w++;
  }
  const diff = b - w - komi;
  return color === 1 ? diff : -diff;
}

export function chooseGoMove(s: GoState, level: Level): GoMove {
  const size = s.size;
  const n = size * size;
  const color = s.turn + 1;
  const rand = Math.random;

  // 相手がパスしていて、今終局すれば勝っているならパスする
  if (s.passes === 1) {
    const test: GoState = { ...s, passes: 2, dead: [] };
    test.dead = estimateDead(test, 60);
    const sc = score(test);
    if ((color === 1 ? sc.black - sc.white : sc.white - sc.black) > 0) return { t: 'pass' };
  }

  const stones = s.board.filter((v) => v !== 0).length;
  const opening = stones < n / 8;
  let cands: number[] = [];
  for (let p = 0; p < n; p++) {
    if (!isLegalPlay(s, p) || isEye(s.board, size, p, color)) continue;
    const r = Math.floor(p / size);
    const c = p % size;
    // 序盤は 1 線・2 線を避ける
    if (opening && size >= 9 && (r < 2 || c < 2 || r >= size - 2 || c >= size - 2)) continue;
    cands.push(p);
  }
  if (cands.length === 0) {
    for (let p = 0; p < n; p++) if (isLegalPlay(s, p) && !isEye(s.board, size, p, color)) cands.push(p);
  }
  if (cands.length === 0) return { t: 'pass' };

  if (level === 1 && rand() < 0.3) return { t: 'play', p: cands[Math.floor(rand() * cands.length)] };

  // 平坦なモンテカルロ（UCB1 で候補を選び、ランダムに打ち切る）
  const timeMs = level === 1 ? 500 : level === 2 ? 1500 : 3500;
  const end = Date.now() + timeMs;
  const after = cands.map((p) => tryPlay(s.board, size, p, color)!.board);
  const wins = new Array(cands.length).fill(0);
  const visits = new Array(cands.length).fill(0);
  let total = 0;
  while (Date.now() < end || total < cands.length) {
    let pick = 0;
    let bestU = -Infinity;
    for (let k = 0; k < cands.length; k++) {
      const u = visits[k] === 0 ? Infinity : wins[k] / visits[k] + Math.sqrt((2 * Math.log(total + 1)) / visits[k]);
      if (u > bestU) {
        bestU = u;
        pick = k;
      }
    }
    const final = playout(after[pick], size, 3 - color, rand);
    if (areaDiff(final, size, color, s.komi) > 0) wins[pick]++;
    visits[pick]++;
    total++;
  }
  let best = 0;
  for (let k = 1; k < cands.length; k++) if (visits[k] > visits[best]) best = k;
  // 何を打っても負けが濃厚で、相手がパスしているならパスで終局へ
  if (s.passes === 1 && wins[best] / visits[best] < 0.05) return { t: 'pass' };
  return { t: 'play', p: cands[best] };
}
