import { Deadline, isAbort, shuffle } from '../../core/search';
import type { GameEngine, Level, Outcome, Player } from '../../core/types';

/**
 * 盤面は 81 要素。index = row * 9 + col。
 * row 0 = 一段目（後手側）、col 0 = 9筋（先手から見て左端）。
 * 駒は 正 = 先手, 負 = 後手, 0 = 空。絶対値が駒の種類。
 */
export const FU = 1, KY = 2, KE = 3, GI = 4, KI = 5, KA = 6, HI = 7, OU = 8;
export const TO = 9, NY = 10, NK = 11, NG = 12, UM = 14, RY = 15;

export const PROMOTE: Record<number, number> = { [FU]: TO, [KY]: NY, [KE]: NK, [GI]: NG, [KA]: UM, [HI]: RY };
export const unpromote = (t: number) => (t > OU ? t - 8 : t);

export interface ShogiPos {
  board: number[];
  /** hands[player][type]（type は 1〜7） */
  hands: [number[], number[]];
  turn: Player;
}

/** 駒落ちの種類。上手（後手の位置に座る側）の駒を落とす */
export type Handicap = 'none' | 'lance' | 'bishop' | 'rook' | 'rook-lance' | 'two' | 'four' | 'six' | 'eight';

export const HANDICAPS: { id: Handicap; name: string }[] = [
  { id: 'none', name: '平手' },
  { id: 'lance', name: '香落ち' },
  { id: 'bishop', name: '角落ち' },
  { id: 'rook', name: '飛車落ち' },
  { id: 'rook-lance', name: '飛香落ち' },
  { id: 'two', name: '二枚落ち' },
  { id: 'four', name: '四枚落ち' },
  { id: 'six', name: '六枚落ち' },
  { id: 'eight', name: '八枚落ち' },
];

/** 上手から取り除くマス（row 0〜1 の index） */
const HANDICAP_SQUARES: Record<Handicap, number[]> = {
  none: [],
  lance: [8], // 1一香
  bishop: [16], // 2二角
  rook: [10], // 8二飛
  'rook-lance': [10, 8],
  two: [10, 16],
  four: [10, 16, 0, 8],
  six: [10, 16, 0, 8, 1, 7],
  eight: [10, 16, 0, 8, 1, 7, 2, 6],
};

export interface ShogiOptions {
  handicap: Handicap;
  declareRule: DeclareRule;
}

export interface ShogiState extends ShogiPos {
  handicap: Handicap;
  declareRule: DeclareRule;
  /** 持将棋を提案している側（相入玉のときのみ） */
  offer: Player | null;
  /** 直前に提案を断った側（表示用） */
  declined: Player | null;
  /** 合意で持将棋が成立した */
  agreed: boolean;
  /** 入玉宣言の結果 */
  declareResult: 'win' | 'draw' | 'lose' | null;
  /** 最初に指した手番（駒落ちは上手 = 1 から指す） */
  startTurn: Player;
  /** 入玉宣言が成立した手番 */
  declared: Player | null;
  /** 千日手判定用のキー（初期局面から順に） */
  keys: string[];
  /** 各局面に至った手が王手だったか */
  checks: boolean[];
  lastMove: ShogiMove | null;
}

export interface ShogiMove {
  /** 打つ手なら -1 */
  from: number;
  to: number;
  /** 打つ駒の種類（打つ手のみ） */
  drop?: number;
  promote?: boolean;
}

type Vec = [number, number];
const GOLD: Vec[] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const SILVER: Vec[] = [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]];
const DIAG: Vec[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH: Vec[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const ALL8: Vec[] = [...DIAG, ...ORTH];

/** 先手から見た 1 マスだけ動ける方向（row が減る方向が前） */
const STEPS: Record<number, Vec[]> = {
  [FU]: [[-1, 0]],
  [KY]: [],
  [KE]: [[-2, -1], [-2, 1]],
  [GI]: SILVER,
  [KI]: GOLD,
  [KA]: [],
  [HI]: [],
  [OU]: ALL8,
  [TO]: GOLD,
  [NY]: GOLD,
  [NK]: GOLD,
  [NG]: GOLD,
  [UM]: ORTH,
  [RY]: DIAG,
};
/** 先手から見た走る方向 */
const SLIDES: Record<number, Vec[]> = {
  [KY]: [[-1, 0]],
  [KA]: DIAG,
  [HI]: ORTH,
  [UM]: DIAG,
  [RY]: ORTH,
};

const owner = (v: number): Player => (v > 0 ? 0 : 1);
const sign = (p: Player) => (p === 0 ? 1 : -1);
const onBoard = (r: number, c: number) => r >= 0 && r < 9 && c >= 0 && c < 9;
const inZone = (p: Player, r: number) => (p === 0 ? r <= 2 : r >= 6);
/** その駒が to の段でもう動けなくなるか（成りが強制される/打てない） */
function deadEnd(type: number, p: Player, r: number): boolean {
  const fromEdge = p === 0 ? r : 8 - r;
  if (type === FU || type === KY) return fromEdge === 0;
  if (type === KE) return fromEdge <= 1;
  return false;
}

const BACK = [KY, KE, GI, KI, OU, KI, GI, KE, KY];

export function initialPos(handicap: Handicap = 'none'): ShogiPos {
  const board = new Array(81).fill(0);
  for (let c = 0; c < 9; c++) {
    board[c] = -BACK[c];
    board[2 * 9 + c] = -FU;
    board[6 * 9 + c] = FU;
    board[8 * 9 + c] = BACK[c];
  }
  board[1 * 9 + 1] = -HI;
  board[1 * 9 + 7] = -KA;
  board[7 * 9 + 1] = KA;
  board[7 * 9 + 7] = HI;
  for (const sq of HANDICAP_SQUARES[handicap]) board[sq] = 0;
  return { board, hands: [new Array(8).fill(0), new Array(8).fill(0)], turn: handicap === 'none' ? 0 : 1 };
}

function positionKey(p: ShogiPos): string {
  return `${p.board.join(',')}|${p.hands[0].join('')}|${p.hands[1].join('')}|${p.turn}`;
}

/** sq が by 側の駒に利かされているか */
export function attacked(board: number[], sq: number, by: Player): boolean {
  const r = Math.floor(sq / 9);
  const c = sq % 9;
  const s = sign(by);
  for (const [dr, dc] of ALL8) {
    let rr = r + dr;
    let cc = c + dc;
    let dist = 1;
    while (onBoard(rr, cc)) {
      const v = board[rr * 9 + cc];
      if (v !== 0) {
        if (owner(v) === by) {
          // 駒から sq へのベクトルを、その駒の持ち主から見た向きに直す
          const vr = -dr * s;
          const vc = -dc * s;
          const t = Math.abs(v);
          if (dist === 1 && STEPS[t].some(([a, b]) => a === vr && b === vc)) return true;
          if (SLIDES[t]?.some(([a, b]) => a === vr && b === vc)) return true;
        }
        break;
      }
      rr += dr;
      cc += dc;
      dist++;
    }
  }
  // 桂馬
  for (const dc of [-1, 1]) {
    const rr = r + 2 * s;
    const cc = c + dc;
    if (onBoard(rr, cc) && board[rr * 9 + cc] === s * KE) return true;
  }
  return false;
}

export function inCheck(p: ShogiPos, player: Player = p.turn): boolean {
  const k = p.board.indexOf(sign(player) * OU);
  return k >= 0 && attacked(p.board, k, player === 0 ? 1 : 0);
}

function pseudoMoves(p: ShogiPos, capturesOnly = false, noDrops = false): ShogiMove[] {
  const { board, turn } = p;
  const s = sign(turn);
  const out: ShogiMove[] = [];
  const add = (from: number, to: number, t: number, fr: number, tr: number) => {
    const canPromote = PROMOTE[t] !== undefined && (inZone(turn, fr) || inZone(turn, tr));
    if (canPromote) out.push({ from, to, promote: true });
    if (!deadEnd(t, turn, tr)) out.push({ from, to, promote: false });
  };

  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (v === 0 || owner(v) !== turn) continue;
    const t = Math.abs(v);
    const r = Math.floor(i / 9);
    const c = i % 9;
    for (const [dr, dc] of STEPS[t]) {
      const tr = r + dr * s;
      const tc = c + dc * s;
      if (!onBoard(tr, tc)) continue;
      const target = board[tr * 9 + tc];
      if (target !== 0 && owner(target) === turn) continue;
      if (capturesOnly && target === 0) continue;
      add(i, tr * 9 + tc, t, r, tr);
    }
    for (const [dr, dc] of SLIDES[t] ?? []) {
      let tr = r + dr * s;
      let tc = c + dc * s;
      while (onBoard(tr, tc)) {
        const target = board[tr * 9 + tc];
        if (target !== 0 && owner(target) === turn) break;
        if (!capturesOnly || target !== 0) add(i, tr * 9 + tc, t, r, tr);
        if (target !== 0) break;
        tr += dr * s;
        tc += dc * s;
      }
    }
  }

  if (capturesOnly || noDrops) return out;

  const hand = p.hands[turn];
  const pawnCols = new Array(9).fill(false);
  for (let i = 0; i < 81; i++) if (board[i] === s * FU) pawnCols[i % 9] = true;
  for (let t = FU; t <= HI; t++) {
    if (!hand[t]) continue;
    for (let i = 0; i < 81; i++) {
      if (board[i] !== 0) continue;
      if (deadEnd(t, turn, Math.floor(i / 9))) continue;
      if (t === FU && pawnCols[i % 9]) continue; // 二歩
      out.push({ from: -1, to: i, drop: t });
    }
  }
  return out;
}

/** 手を適用した局面（合法性は確認しない） */
export function makeMove(p: ShogiPos, m: ShogiMove): ShogiPos {
  const board = p.board.slice();
  const hands: [number[], number[]] = [p.hands[0].slice(), p.hands[1].slice()];
  const s = sign(p.turn);
  if (m.from < 0) {
    board[m.to] = s * m.drop!;
    hands[p.turn][m.drop!]--;
  } else {
    const v = board[m.from];
    const captured = board[m.to];
    if (captured !== 0) hands[p.turn][unpromote(Math.abs(captured))]++;
    board[m.to] = m.promote ? s * PROMOTE[Math.abs(v)] : v;
    board[m.from] = 0;
  }
  return { board, hands, turn: p.turn === 0 ? 1 : 0 };
}

/** 打ち歩詰めの判定で使う、手があるかどうかの軽い確認 */
function hasLegalMove(p: ShogiPos): boolean {
  for (const m of pseudoMoves(p)) if (!inCheck(makeMove(p, m), p.turn)) return true;
  return false;
}

/** child は m を指した後の局面。自殺手・打ち歩詰めでなければ true */
function isLegalResult(p: ShogiPos, m: ShogiMove, child: ShogiPos): boolean {
  if (inCheck(child, p.turn)) return false;
  if (m.drop === FU && inCheck(child) && !hasLegalMove(child)) return false;
  return true;
}

export function legalMoves(p: ShogiPos): ShogiMove[] {
  return pseudoMoves(p).filter((m) => isLegalResult(p, m, makeMove(p, m)));
}

/** 千日手の判定。成立していれば結果を返す */
function repetition(s: ShogiState): Outcome | null {
  const n = s.keys.length - 1;
  const last = s.keys[n];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) if (s.keys[i] === last) idx.push(i);
  if (idx.length < 4) return null;
  // 局面 j に至る手を指したのは (startTurn + j - 1) % 2 の手番
  const first = idx[0];
  for (const p of [0, 1] as Player[]) {
    let moves = 0;
    let allCheck = true;
    for (let j = first + 1; j <= n; j++) {
      if ((s.startTurn + j - 1) % 2 !== p) continue;
      moves++;
      if (!s.checks[j]) allCheck = false;
    }
    if (moves > 0 && allCheck) return { winner: p === 0 ? 1 : 0, reason: '連続王手の千日手' };
  }
  return { winner: null, reason: '千日手（指し直し）' };
}

// ---------------------------------------------------------------- 入玉宣言（27点法）

const BIG_PIECES = new Set([KA, HI, UM, RY]);
const piecePoints = (t: number) => (t === OU ? 0 : BIG_PIECES.has(t) ? 5 : 1);

/**
 * 入玉宣言の方式
 *   27 = 27点法（アマチュア大会など）: 先手28点・後手27点以上で宣言勝ち。条件を満たさない宣言はできない
 *   24 = 24点法（プロ公式戦）: 31点以上で勝ち、24〜30点で持将棋、23点以下で負け
 */
export type DeclareRule = '27' | '24';

export interface Declaration {
  /** 宣言できるか（27点法は勝てる場合のみ、24点法は点数以外の条件を満たせば宣言できる） */
  ok: boolean;
  /** 宣言したときの結果 */
  result: 'win' | 'draw' | 'lose';
  kingInCamp: boolean;
  /** 敵陣にある玉以外の駒の枚数（10枚以上必要） */
  piecesInCamp: number;
  /** 点数（駒落ちの上手は落とした駒の点数を含む） */
  points: number;
  /** 勝ちに必要な点数 */
  required: number;
  inCheck: boolean;
}

/** 駒落ちで上手が落とした駒の点数 */
function handicapPoints(h: Handicap): number {
  const start = initialPos().board;
  return HANDICAP_SQUARES[h].reduce((sum, sq) => sum + piecePoints(Math.abs(start[sq])), 0);
}

/** 手番側が入玉宣言したらどうなるか */
export function declaration(s: ShogiState): Declaration {
  const p = s.turn;
  const sg = sign(p);
  const enemyCamp = (r: number) => (p === 0 ? r <= 2 : r >= 6);
  let kingInCamp = false;
  let piecesInCamp = 0;
  let points = 0;
  for (let i = 0; i < 81; i++) {
    const v = s.board[i];
    if (v === 0 || owner(v) !== p || !enemyCamp(Math.floor(i / 9))) continue;
    if (v === sg * OU) kingInCamp = true;
    else {
      piecesInCamp++;
      points += piecePoints(Math.abs(v));
    }
  }
  for (let t = FU; t <= HI; t++) points += s.hands[p][t] * piecePoints(t);
  // 駒落ちでは、落とした駒の点数を上手に加える
  if (p === 1) points += handicapPoints(s.handicap);
  const check = inCheck(s);
  const conditions = kingInCamp && piecesInCamp >= 10 && !check;
  if (s.declareRule === '24') {
    const result = points >= 31 ? 'win' : points >= 24 ? 'draw' : 'lose';
    return { ok: conditions, result, kingInCamp, piecesInCamp, points, required: 31, inCheck: check };
  }
  const required = p === 0 ? 28 : 27;
  return { ok: conditions && points >= required, result: 'win', kingInCamp, piecesInCamp, points, required, inCheck: check };
}

/** 盤上と持ち駒を合わせた全部の駒の点数（合意による持将棋の判定用） */
export function totalPoints(s: ShogiState, p: Player): number {
  let points = 0;
  for (const v of s.board) if (v !== 0 && owner(v) === p) points += piecePoints(Math.abs(v));
  for (let t = FU; t <= HI; t++) points += s.hands[p][t] * piecePoints(t);
  if (p === 1) points += handicapPoints(s.handicap);
  return points;
}

/** 両方の玉が敵陣に入っている（相入玉） */
export function bothKingsEntered(s: ShogiPos): boolean {
  const sente = s.board.indexOf(OU);
  const gote = s.board.indexOf(-OU);
  return sente >= 0 && gote >= 0 && Math.floor(sente / 9) <= 2 && Math.floor(gote / 9) >= 6;
}

/** 相手から持将棋の提案が出ているか */
export const offerPending = (s: ShogiState) => s.offer !== null && s.offer !== s.turn;

/** 盤上の手、入玉宣言、持将棋の提案・受諾・拒否 */
export type ShogiAction =
  | ShogiMove
  | { declare: true }
  | { offer: true }
  | { accept: true }
  | { decline: true };

export const shogi: GameEngine<ShogiState, ShogiAction, ShogiOptions> = {
  initial({ handicap, declareRule }) {
    const pos = initialPos(handicap);
    return {
      ...pos,
      handicap,
      declareRule,
      offer: null,
      declined: null,
      agreed: false,
      declareResult: null,
      startTurn: pos.turn,
      declared: null,
      keys: [positionKey(pos)],
      checks: [false],
      lastMove: null,
    };
  },
  turn: (s) => s.turn,
  apply(s, m) {
    if ('declare' in m) {
      const d = declaration(s);
      return d.ok ? { ...s, declared: s.turn, declareResult: d.result } : s;
    }
    if ('offer' in m) return bothKingsEntered(s) ? { ...s, offer: s.turn } : s;
    if ('accept' in m) return offerPending(s) ? { ...s, agreed: true } : s;
    if ('decline' in m) return offerPending(s) ? { ...s, offer: null, declined: s.turn } : s;
    const pos = makeMove(s, m);
    return {
      ...s,
      ...pos,
      offer: s.offer === s.turn ? s.offer : null,
      declined: offerPending(s) ? s.turn : null,
      keys: [...s.keys, positionKey(pos)],
      checks: [...s.checks, inCheck(pos)],
      lastMove: m,
    };
  },
  outcome(s): Outcome | null {
    if (s.declared !== null) {
      const other: Player = s.declared === 0 ? 1 : 0;
      if (s.declareResult === 'draw') return { winner: null, reason: '持将棋（入玉宣言・24点法）' };
      if (s.declareResult === 'lose') return { winner: other, reason: '入玉宣言の点数不足' };
      return { winner: s.declared, reason: '入玉宣言' };
    }
    if (s.agreed) {
      // 合意による持将棋: 24点に満たない側は負け
      const short = ([0, 1] as Player[]).filter((p) => totalPoints(s, p) < 24);
      if (short.length === 1) return { winner: short[0] === 0 ? 1 : 0, reason: '持将棋（24点に満たず）' };
      return { winner: null, reason: '持将棋（合意）' };
    }
    const rep = repetition(s);
    if (rep) return rep;
    if (legalMoves(s).length === 0) return { winner: s.turn === 0 ? 1 : 0, reason: '詰み' };
    return null;
  },
};

// ---------------------------------------------------------------- CPU

const VALUE: Record<number, number> = {
  [FU]: 90, [KY]: 300, [KE]: 350, [GI]: 500, [KI]: 560, [KA]: 800, [HI]: 950, [OU]: 0,
  [TO]: 520, [NY]: 500, [NK]: 500, [NG]: 540, [UM]: 1100, [RY]: 1300,
};
const HAND_BONUS = 1.1;

/** 手番側から見た評価値 */
function evaluate(p: ShogiPos): number {
  let score = 0;
  const kings = [p.board.indexOf(OU), p.board.indexOf(-OU)];
  for (let i = 0; i < 81; i++) {
    const v = p.board[i];
    if (v === 0) continue;
    const t = Math.abs(v);
    const pl = owner(v);
    let val = VALUE[t];
    // 玉の近くの金銀は守り、相手玉の近くの駒は攻めとして加点
    if (t !== OU) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      for (const who of [0, 1] as Player[]) {
        const k = kings[who];
        if (k < 0) continue;
        const d = Math.max(Math.abs(Math.floor(k / 9) - r), Math.abs((k % 9) - c));
        if (d <= 2) {
          if (who === pl && (t === KI || t === GI)) val += 40;
          if (who !== pl) val += 25;
        }
      }
    }
    score += pl === 0 ? val : -val;
  }
  for (let t = FU; t <= HI; t++) {
    score += (p.hands[0][t] - p.hands[1][t]) * VALUE[t] * HAND_BONUS;
  }
  // 駒の働き（盤上の駒が動ける手の数）
  const other: ShogiPos = { ...p, turn: p.turn === 0 ? 1 : 0 };
  const mobility = pseudoMoves(p, false, true).length - pseudoMoves(other, false, true).length;
  return (p.turn === 0 ? score : -score) + mobility * 4;
}

const MATE = 1_000_000;

function orderMoves(p: ShogiPos, moves: ShogiMove[]): ShogiMove[] {
  const score = (m: ShogiMove) => {
    let s = 0;
    const victim = p.board[m.to];
    if (victim !== 0) s += 10 * VALUE[Math.abs(victim)] - (m.from >= 0 ? VALUE[Math.abs(p.board[m.from])] / 10 : 0);
    if (m.promote) s += 300;
    if (m.from < 0) s -= 50;
    return s;
  };
  return moves
    .map((m) => ({ m, s: score(m) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

function quiesce(p: ShogiPos, alpha: number, beta: number, deadline: Deadline, qdepth: number): number {
  deadline.check();
  const stand = evaluate(p);
  if (stand >= beta || qdepth === 0) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of orderMoves(p, pseudoMoves(p, true))) {
    if (Math.abs(p.board[m.to]) === OU) return MATE; // 玉を取れる = 直前の手は反則
    const child = makeMove(p, m);
    if (inCheck(child, p.turn)) continue;
    const v = -quiesce(child, -beta, -alpha, deadline, qdepth - 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(p: ShogiPos, depth: number, alpha: number, beta: number, ply: number, deadline: Deadline): number {
  deadline.check();
  if (depth <= 0) return quiesce(p, alpha, beta, deadline, 4);
  let legal = 0;
  let best = -Infinity;
  for (const m of orderMoves(p, pseudoMoves(p))) {
    const child = makeMove(p, m);
    if (!isLegalResult(p, m, child)) continue;
    legal++;
    const v = -search(child, depth - 1, -beta, -alpha, ply + 1, deadline);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  // 将棋では指す手がなければ（王手でなくても）負け
  if (legal === 0) return -MATE + ply;
  return best;
}

export function chooseShogiMove(s: ShogiState, level: Level, budgetMs?: number): ShogiAction {
  const d = declaration(s);
  if (d.ok && d.result === 'win') return { declare: true };
  // 持将棋の提案は、負けにならず形勢も良くないときだけ受ける
  if (offerPending(s)) {
    if (totalPoints(s, s.turn) >= 24 && evaluate(s) < 100) return { accept: true };
  }
  // 同じ評価の手が並んだとき、毎回同じ手にならないよう先に混ぜておく
  const moves = orderMoves(s, shuffle(legalMoves(s)));
  if (moves.length === 1) return moves[0];

  if (level === 1) {
    let best = moves[0];
    let bestVal = -Infinity;
    for (const m of moves) {
      const v = -quiesce(makeMove(s, m), -Infinity, Infinity, new Deadline(1000), 1) + Math.random() * 250;
      if (v > bestVal) {
        bestVal = v;
        best = m;
      }
    }
    return best;
  }

  const maxDepth = level === 2 ? 2 : 4;
  const deadline = new Deadline(level === 2 ? 2000 : 4000, budgetMs);
  let ordered = moves;
  let best = moves[0];
  try {
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -Infinity;
      let iterBest = ordered[0];
      for (const m of ordered) {
        const v = -search(makeMove(s, m), d - 1, -Infinity, -alpha, 1, deadline);
        if (v > alpha) {
          alpha = v;
          iterBest = m;
        }
      }
      best = iterBest;
      ordered = [best, ...ordered.filter((m) => m !== best)];
      if (alpha >= MATE - 100) break;
    }
  } catch (e) {
    if (!isAbort(e)) throw e;
  }
  return best;
}
