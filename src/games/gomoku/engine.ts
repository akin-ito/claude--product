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

/**
 * 開局規定（序盤の打ち方の決まり）
 *   none        = なし（黒から自由に打つ）
 *   swap        = Swap（1人目が3子を置き、2人目が色を選ぶ）
 *   swap2       = Swap2（五目並べの国際大会で一般的）
 *   rif         = 旧RIF規定（珠型26種＋5手目2題提示）
 *   yamaguchi   = 山口ルール（珠型と5手目の提示数を1人目が宣言）
 *   soosorv8    = Soosõrv-8（4手目を打つ側が5手目の提示数を宣言）
 *   taraguchi10 = Taraguchi-10（1手ごとに交替の機会。2024年からの世界選手権の規定）
 */
export type OpeningRule = 'none' | 'swap' | 'swap2' | 'rif' | 'yamaguchi' | 'soosorv8' | 'taraguchi10';

export const OPENING_NAMES: Record<OpeningRule, string> = {
  none: 'なし',
  swap: 'Swap',
  swap2: 'Swap2',
  rif: '旧RIF規定',
  yamaguchi: '山口ルール',
  soosorv8: 'Soosõrv-8',
  taraguchi10: 'Taraguchi-10',
};

/** そのルールで選べる開局規定 */
export const OPENINGS_FOR: Record<GomokuRule, OpeningRule[]> = {
  free: ['none', 'swap', 'swap2'],
  standard: ['none', 'swap', 'swap2'],
  renju: ['none', 'rif', 'yamaguchi', 'soosorv8', 'taraguchi10'],
};

export interface GomokuOptions {
  rule: GomokuRule;
  opening: OpeningRule;
}

/** 開局の手順の 1 段階 */
export type Step =
  /** 石を置く。seat 指定があればその席が、なければ次の石の色を持つ席が置く。stones 個目まで */
  | { k: 'place'; seat?: Player; until: number }
  /** 直前に打った人の相手が、色を交替するか決める */
  | { k: 'swap' }
  /** seat が自分の色を選ぶ */
  | { k: 'color'; seat: Player }
  /** Swap2 の 2 人目の選択（黒を持つ・白を持つ・さらに 2 子置いて相手に選ばせる） */
  | { k: 'swap2' }
  /** 直前に打った人が 5 手目の提示数を宣言する */
  | { k: 'declare'; max: number }
  /** 黒が 5 手目の候補を提示する */
  | { k: 'propose' }
  /** 白が提示された 5 手目から 1 つを選ぶ */
  | { k: 'select' }
  /** Taraguchi-10: 黒が 5 手目を 1 つ（9×9 内）打つか、10 個提示するか選ぶ */
  | { k: 'tchoice' };

/** 盤面: 0 = 空, 1 = 黒, 2 = 白 */
export interface GomokuState {
  board: number[];
  /** 今操作する席 */
  turn: Player;
  /** 黒を持っている席 */
  blackSeat: Player;
  last: number;
  winLine: number[] | null;
  /** 盤上の石の数 */
  moves: number;
  rule: GomokuRule;
  opening: OpeningRule;
  /** 開局の分岐（Swap2 の追加 2 子、Taraguchi の 1 手 / 10 個提示） */
  branch: 'more' | 'one' | 'ten' | null;
  /** 開局手順の何段階目か（手順が終われば通常の対局） */
  step: number;
  /** 直前に操作した席 */
  lastActor: Player;
  /** 5 手目の提示数 */
  fifthCount: number;
  /** 提示された 5 手目 */
  proposals: number[];
}

export type GomokuMove =
  | number
  | { t: 'swap'; swap: boolean }
  | { t: 'color'; color: 'black' | 'white' }
  | { t: 'swap2'; choice: 'black' | 'white' | 'more' }
  | { t: 'declare'; n: number }
  | { t: 'propose'; p: number }
  | { t: 'select'; p: number }
  | { t: 'tchoice'; mode: 'one' | 'ten' };

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

// ---------------------------------------------------------------- 開局規定

/** 珠型（連珠の決まった序盤）: 何手目を中央の何×何の範囲に置くか */
const AREAS: Partial<Record<OpeningRule, Record<number, number>>> = {
  rif: { 1: 1, 2: 3, 3: 5 },
  yamaguchi: { 1: 1, 2: 3, 3: 5 },
  soosorv8: { 1: 1, 2: 3, 3: 5 },
  taraguchi10: { 1: 1, 2: 3, 3: 5, 4: 7, 5: 9 },
};

/** stone 手目を置ける範囲（中央の k×k）。制限がなければ undefined */
export function placementArea(s: GomokuState, stone: number): number | undefined {
  if (stone === 5 && s.opening === 'taraguchi10' && s.branch !== 'one') return undefined;
  return AREAS[s.opening]?.[stone];
}

export function inArea(p: number, k: number | undefined): boolean {
  if (k === undefined) return true;
  const c = (SIZE - 1) / 2;
  const h = (k - 1) / 2;
  return Math.abs(Math.floor(p / SIZE) - c) <= h && Math.abs((p % SIZE) - c) <= h;
}

/** 開局の手順 */
export function script(opening: OpeningRule, branch: GomokuState['branch']): Step[] {
  switch (opening) {
    case 'none':
      return [];
    case 'swap':
      return [{ k: 'place', seat: 0, until: 3 }, { k: 'color', seat: 1 }];
    case 'swap2':
      return branch === 'more'
        ? [{ k: 'place', seat: 0, until: 3 }, { k: 'swap2' }, { k: 'place', seat: 1, until: 5 }, { k: 'color', seat: 0 }]
        : [{ k: 'place', seat: 0, until: 3 }, { k: 'swap2' }];
    case 'rif':
      return [{ k: 'place', seat: 0, until: 3 }, { k: 'swap' }, { k: 'place', until: 4 }, { k: 'propose' }, { k: 'select' }];
    case 'yamaguchi':
      return [
        { k: 'place', seat: 0, until: 3 },
        { k: 'declare', max: 10 },
        { k: 'swap' },
        { k: 'place', until: 4 },
        { k: 'propose' },
        { k: 'select' },
      ];
    case 'soosorv8':
      return [
        { k: 'place', seat: 0, until: 3 },
        { k: 'swap' },
        { k: 'place', until: 4 },
        { k: 'declare', max: 8 },
        { k: 'swap' },
        { k: 'propose' },
        { k: 'select' },
      ];
    case 'taraguchi10': {
      const base: Step[] = [];
      for (let k = 1; k <= 4; k++) base.push({ k: 'place', until: k }, { k: 'swap' });
      base.push({ k: 'tchoice' });
      if (branch === 'one') return [...base, { k: 'place', until: 5 }, { k: 'swap' }];
      if (branch === 'ten') return [...base, { k: 'propose' }, { k: 'select' }];
      return base;
    }
  }
}

/** 今の開局の段階。通常の対局なら null */
export function currentStep(s: GomokuState): Step | null {
  return script(s.opening, s.branch)[s.step] ?? null;
}

const colorOfNext = (moves: number) => (moves % 2 === 0 ? 1 : 2);
const seatOfColor = (s: GomokuState, color: number): Player => (color === 1 ? s.blackSeat : s.blackSeat === 0 ? 1 : 0);
const otherSeat = (p: Player): Player => (p === 0 ? 1 : 0);

/** その段階で操作する席 */
function actorFor(s: GomokuState, step: Step | null): Player {
  if (!step) return seatOfColor(s, colorOfNext(s.moves));
  switch (step.k) {
    case 'place':
      return step.seat ?? seatOfColor(s, colorOfNext(s.moves));
    case 'swap':
      return otherSeat(s.lastActor);
    case 'color':
      return step.seat;
    case 'swap2':
      return 1;
    case 'declare':
      return s.lastActor;
    case 'propose':
    case 'tchoice':
      return s.blackSeat;
    case 'select':
      return seatOfColor(s, 2);
  }
}

/** 段階を 1 つ進め、操作する席を決め直す */
function advance(s: GomokuState): GomokuState {
  const next = { ...s, step: s.step + 1 };
  return { ...next, turn: actorFor(next, currentStep(next)) };
}

/** 盤面の対称変換（中央を中心にした回転・反転） */
const TRANSFORMS: ((r: number, c: number) => [number, number])[] = [
  (r, c) => [r, c],
  (r, c) => [c, SIZE - 1 - r],
  (r, c) => [SIZE - 1 - r, SIZE - 1 - c],
  (r, c) => [SIZE - 1 - c, r],
  (r, c) => [r, SIZE - 1 - c],
  (r, c) => [SIZE - 1 - r, c],
  (r, c) => [c, r],
  (r, c) => [SIZE - 1 - c, SIZE - 1 - r],
];
const mapPoint = (t: (r: number, c: number) => [number, number], p: number) => {
  const [r, c] = t(Math.floor(p / SIZE), p % SIZE);
  return r * SIZE + c;
};

/** 5 手目の提示として置けるか（空点で、すでに提示した手と対称でない） */
export function canPropose(s: GomokuState, p: number): boolean {
  if (s.board[p] !== 0 || s.proposals.includes(p)) return false;
  // 今の局面を変えない対称変換で、既存の提示と重なる手は不可
  for (const t of TRANSFORMS.slice(1)) {
    const fixes = s.board.every((v, i) => v === 0 || s.board[mapPoint(t, i)] === v);
    if (fixes && s.proposals.includes(mapPoint(t, p))) return false;
  }
  return true;
}

export function isLegal(s: GomokuState, m: GomokuMove): boolean {
  if (s.winLine || s.moves >= N) return false;
  const step = currentStep(s);
  if (typeof m === 'number') {
    if (m < 0 || m >= N || s.board[m] !== 0) return false;
    if (step && step.k !== 'place') return false;
    if (step && !inArea(m, placementArea(s, s.moves + 1))) return false;
    return !(s.rule === 'renju' && colorOfNext(s.moves) === 1 && isForbidden(s.board, m));
  }
  switch (m.t) {
    case 'swap':
      return step?.k === 'swap';
    case 'color':
      return step?.k === 'color';
    case 'swap2':
      return step?.k === 'swap2';
    case 'declare':
      return step?.k === 'declare' && Number.isInteger(m.n) && m.n >= 1 && m.n <= step.max;
    case 'propose':
      return step?.k === 'propose' && s.proposals.length < s.fifthCount && canPropose(s, m.p);
    case 'select':
      return step?.k === 'select' && s.proposals.includes(m.p);
    case 'tchoice':
      return step?.k === 'tchoice';
  }
}

function placeStone(s: GomokuState, p: number): GomokuState {
  const board = s.board.slice();
  board[p] = colorOfNext(s.moves);
  return { ...s, board, last: p, moves: s.moves + 1, winLine: findWin(board, p, s.rule), lastActor: s.turn };
}

export const gomoku: GameEngine<GomokuState, GomokuMove, GomokuOptions> = {
  initial({ rule, opening }) {
    const op = OPENINGS_FOR[rule].includes(opening) ? opening : 'none';
    const s: GomokuState = {
      board: new Array(N).fill(0),
      turn: 0,
      blackSeat: 0,
      last: -1,
      winLine: null,
      moves: 0,
      rule,
      opening: op,
      branch: null,
      step: 0,
      lastActor: 1,
      fifthCount: op === 'rif' ? 2 : op === 'taraguchi10' ? 10 : 0,
      proposals: [],
    };
    return { ...s, turn: actorFor(s, currentStep(s)) };
  },
  turn: (s) => s.turn,
  apply(s, m) {
    const step = currentStep(s);
    if (typeof m === 'number') {
      const placed = placeStone(s, m);
      if (!step) return { ...placed, turn: actorFor(placed, null) };
      // 決められた数まで置き終えたら次の段階へ
      if (placed.moves >= (step as { until: number }).until) return advance(placed);
      return { ...placed, turn: actorFor(placed, step) };
    }
    const acted = { ...s, lastActor: s.turn };
    switch (m.t) {
      case 'swap':
        return advance({ ...acted, blackSeat: m.swap ? otherSeat(s.blackSeat) : s.blackSeat });
      case 'color':
        return advance({ ...acted, blackSeat: m.color === 'black' ? s.turn : otherSeat(s.turn) });
      case 'swap2':
        if (m.choice === 'more') return advance({ ...acted, branch: 'more' });
        return advance({ ...acted, blackSeat: m.choice === 'black' ? s.turn : otherSeat(s.turn) });
      case 'declare':
        return advance({ ...acted, fifthCount: m.n });
      case 'tchoice':
        return advance({ ...acted, branch: m.mode, fifthCount: m.mode === 'ten' ? 10 : s.fifthCount });
      case 'propose': {
        const next = { ...acted, proposals: [...s.proposals, m.p] };
        return next.proposals.length >= s.fifthCount ? advance(next) : next;
      }
      case 'select':
        return advance({ ...placeStone(acted, m.p), proposals: [] });
    }
  },
  outcome(s): Outcome | null {
    if (s.winLine) return { winner: seatOfColor(s, s.board[s.last]), reason: '五目並び' };
    if (s.moves >= N) return { winner: null, reason: '盤が埋まりました' };
    return null;
  },
};

/** 席が今持っている色（1 = 黒, 2 = 白） */
export const colorOfSeat = (s: GomokuState, seat: Player) => (seat === s.blackSeat ? 1 : 2);
/** 次に置かれる石の色 */
export const nextColor = (s: GomokuState) => colorOfNext(s.moves);

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

/** 黒から見た盤面の形勢（大きいほど黒が有利） */
function blackAdvantage(board: number[], nextColor: number): number {
  const v = evaluate(board, 1);
  // 次に打つ側が少し有利
  return v + (nextColor === 1 ? 150 : -150);
}

/** 通常の着手（area があれば、その範囲内だけから選ぶ） */
function choosePlay(s: GomokuState, level: Level, budgetMs: number | undefined, area?: number): number {
  const color = colorOfNext(s.moves);
  const opp = 3 - color;
  const rule = s.rule;
  const board = s.board.slice();
  if (s.moves === 0) return Math.floor(N / 2);
  let scored = scoreCandidates(board, color).filter((x) => inArea(x.move, area));
  if (rule === 'renju' && color === 1) scored = scored.filter((x) => !isForbidden(board, x.move));
  if (scored.length === 0) {
    const free: number[] = [];
    for (let p = 0; p < N; p++) if (board[p] === 0 && inArea(p, area)) free.push(p);
    return free[Math.floor(Math.random() * free.length)];
  }

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
  if (level === 2 || s.moves < 4) return scored[0].move;

  // 強い: 上位候補について 4 手先まで読む
  const deadline = new Deadline(2500, budgetMs);
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

/** 開局で 1 人目がまとめて石を置くときの手（中央付近の自然な形） */
function chooseOpeningStone(s: GomokuState): number {
  const area = placementArea(s, s.moves + 1) ?? 5;
  const c = Math.floor(N / 2);
  if (s.moves === 0 && inArea(c, area)) return c;
  const options: number[] = [];
  for (let p = 0; p < N; p++) {
    if (s.board[p] !== 0 || !inArea(p, area)) continue;
    // 既存の石の近く（2 路以内）に限る
    const r = Math.floor(p / SIZE);
    const col = p % SIZE;
    const near = s.board.some((v, i) => v !== 0 && Math.abs(Math.floor(i / SIZE) - r) <= 2 && Math.abs((i % SIZE) - col) <= 2);
    if (near) options.push(p);
  }
  return options[Math.floor(Math.random() * options.length)];
}

export function chooseGomokuMove(s: GomokuState, level: Level, budgetMs?: number): GomokuMove {
  const step = currentStep(s);
  if (!step) return choosePlay(s, level, budgetMs);
  const me = s.turn;
  const advBlack = () => blackAdvantage(s.board, colorOfNext(s.moves));
  switch (step.k) {
    case 'place':
      // 1 人目が色に関係なくまとめて置く場合は、偏りの少ない自然な形にする
      if (step.seat !== undefined) return chooseOpeningStone(s);
      return choosePlay(s, level, budgetMs, placementArea(s, s.moves + 1));
    case 'swap': {
      // 交替すると相手の色になる。有利な方の色を持つ
      const iAmBlack = me === s.blackSeat;
      const wantBlack = advBlack() > 0;
      return { t: 'swap', swap: iAmBlack !== wantBlack };
    }
    case 'color':
      return { t: 'color', color: advBlack() > 0 ? 'black' : 'white' };
    case 'swap2': {
      const a = advBlack();
      return { t: 'swap2', choice: a > 400 ? 'black' : a < -400 ? 'white' : a > 0 ? 'black' : 'white' };
    }
    case 'declare':
      return { t: 'declare', n: Math.min(step.max, 2) };
    case 'tchoice':
      return { t: 'tchoice', mode: 'one' };
    case 'propose': {
      // 相手（白）は黒に一番不利な候補を選ぶので、どれを選ばれても困らない手を並べる
      const board = s.board;
      const ranked = scoreCandidates(board, 1).sort((a, b) => b.attack + b.defense - (a.attack + a.defense));
      for (const x of ranked) if (canPropose(s, x.move)) return { t: 'propose', p: x.move };
      for (let p = 0; p < N; p++) if (canPropose(s, p)) return { t: 'propose', p };
      return { t: 'propose', p: -1 };
    }
    case 'select': {
      // 黒にとって一番弱い候補を選ぶ
      let best = s.proposals[0];
      let bestVal = Infinity;
      for (const p of s.proposals) {
        const board = s.board.slice();
        board[p] = 1;
        const v = blackAdvantage(board, 2);
        if (v < bestVal) {
          bestVal = v;
          best = p;
        }
      }
      return { t: 'select', p: best };
    }
  }
}
