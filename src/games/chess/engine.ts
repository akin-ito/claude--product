import { Deadline, isAbort, shuffle } from '../../core/search';
import type { GameEngine, Level, Outcome, Player } from '../../core/types';

/**
 * 盤面は 64 要素。index = row * 8 + col、row 0 が 8 段目（黒側）。
 * 駒は 'PNBRQK'（白）/'pnbrqk'（黒）、空きは ''。
 * Player 0 = 白, 1 = 黒。
 */
export interface ChessPos {
  board: string[];
  turn: Player;
  /** 'KQkq' の部分文字列 */
  castling: string;
  /** アンパッサンで取れるマス。なければ -1 */
  ep: number;
  halfmove: number;
}

export interface ChessState extends ChessPos {
  /** 同一局面判定用のキー（初期局面から順に） */
  keys: string[];
  lastMove: ChessMove | null;
  /** 引き分けを申請して認められた理由 */
  claimed: string | null;
}

export type Promo = 'q' | 'r' | 'b' | 'n';

export interface ChessMove {
  from: number;
  to: number;
  promo?: Promo;
}

/** 駒を動かす手、または引き分けの申請 */
export type ChessAction = ChessMove | { claim: true };

const isWhite = (p: string) => p !== '' && p <= 'Z';
const ownedBy = (p: string, player: Player) => p !== '' && isWhite(p) === (player === 0);
const row = (i: number) => i >> 3;
const col = (i: number) => i & 7;
const at = (r: number, c: number) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);

const KNIGHT: [number, number][] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
];
const KING: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];
const ORTH: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export function fromFEN(fen: string): ChessState {
  const [placement, turn, castling, ep, half] = fen.split(' ');
  const board: string[] = [];
  for (const ch of placement.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) board.push('');
    else board.push(ch);
  }
  const epSq = ep && ep !== '-' ? at(8 - Number(ep[1]), ep.charCodeAt(0) - 97) : -1;
  const pos: ChessPos = {
    board,
    turn: turn === 'b' ? 1 : 0,
    castling: castling === '-' ? '' : castling,
    ep: epSq,
    halfmove: Number(half ?? 0),
  };
  return { ...pos, keys: [positionKey(pos)], lastMove: null, claimed: null };
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * 同一局面の判定用キー。FIDE の規定どおり、アンパッサンの権利は
 * 実際にアンパッサンが指せる場合だけ局面の違いとして扱う。
 */
function positionKey(p: ChessPos): string {
  const epMatters = p.ep >= 0 && legalMoves(p).some((m) => m.to === p.ep && p.board[m.from].toUpperCase() === 'P');
  return p.board.map((x) => x || '.').join('') + p.turn + p.castling + (epMatters ? p.ep : -1);
}

const repetitions = (s: ChessState) => {
  const last = s.keys[s.keys.length - 1];
  return s.keys.filter((k) => k === last).length;
};

/** 手番側が申請できる引き分け（3回同形・50手ルール）。なければ null */
export function claimableDraw(s: ChessState): string | null {
  if (repetitions(s) >= 3) return '同一局面3回';
  if (s.halfmove >= 100) return '50手ルール';
  return null;
}

/** sq が byWhite 側の駒に利かされているか */
export function attacked(board: string[], sq: number, byWhite: boolean): boolean {
  const r = row(sq);
  const c = col(sq);
  const own = (p: string) => p !== '' && isWhite(p) === byWhite;
  // ポーン（白は上へ進むので、下側から利く）
  const pr = byWhite ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const j = at(pr, c + dc);
    if (j >= 0 && board[j] === (byWhite ? 'P' : 'p')) return true;
  }
  for (const [dr, dc] of KNIGHT) {
    const j = at(r + dr, c + dc);
    if (j >= 0 && board[j] === (byWhite ? 'N' : 'n')) return true;
  }
  for (const [dr, dc] of KING) {
    const j = at(r + dr, c + dc);
    if (j >= 0 && board[j] === (byWhite ? 'K' : 'k')) return true;
  }
  for (const [dirs, kinds] of [
    [ORTH, 'RQ'],
    [DIAG, 'BQ'],
  ] as const) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      let j = at(rr, cc);
      while (j >= 0) {
        const p = board[j];
        if (p !== '') {
          if (own(p) && kinds.includes(p.toUpperCase())) return true;
          break;
        }
        rr += dr;
        cc += dc;
        j = at(rr, cc);
      }
    }
  }
  return false;
}

function kingSquare(board: string[], player: Player): number {
  return board.indexOf(player === 0 ? 'K' : 'k');
}

export function inCheck(p: ChessPos, player: Player = p.turn): boolean {
  const k = kingSquare(p.board, player);
  return k >= 0 && attacked(p.board, k, player === 1);
}

/** 自玉の安全を考慮しない手の生成 */
function pseudoMoves(p: ChessPos, capturesOnly = false): ChessMove[] {
  const { board, turn } = p;
  const white = turn === 0;
  const out: ChessMove[] = [];
  const push = (from: number, to: number) => {
    const target = board[to];
    if (target !== '' && ownedBy(target, turn)) return false;
    if (!capturesOnly || target !== '') out.push({ from, to });
    return target === '';
  };

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (!ownedBy(piece, turn)) continue;
    const r = row(i);
    const c = col(i);
    switch (piece.toUpperCase()) {
      case 'P': {
        const dir = white ? -1 : 1;
        const lastRow = white ? 0 : 7;
        const addPawn = (to: number) => {
          if (row(to) === lastRow) for (const promo of ['q', 'r', 'b', 'n'] as Promo[]) out.push({ from: i, to, promo });
          else out.push({ from: i, to });
        };
        const one = at(r + dir, c);
        if (one >= 0 && board[one] === '' && (!capturesOnly || row(one) === lastRow)) {
          addPawn(one);
          const startRow = white ? 6 : 1;
          const two = at(r + 2 * dir, c);
          if (!capturesOnly && r === startRow && board[two] === '') out.push({ from: i, to: two });
        }
        for (const dc of [-1, 1]) {
          const j = at(r + dir, c + dc);
          if (j < 0) continue;
          if ((board[j] !== '' && !ownedBy(board[j], turn)) || j === p.ep) addPawn(j);
        }
        break;
      }
      case 'N':
        for (const [dr, dc] of KNIGHT) {
          const j = at(r + dr, c + dc);
          if (j >= 0) push(i, j);
        }
        break;
      case 'K':
        for (const [dr, dc] of KING) {
          const j = at(r + dr, c + dc);
          if (j >= 0) push(i, j);
        }
        break;
      default: {
        const kind = piece.toUpperCase();
        const dirs = kind === 'R' ? ORTH : kind === 'B' ? DIAG : [...ORTH, ...DIAG];
        for (const [dr, dc] of dirs) {
          let j = at(r + dr, c + dc);
          let k = 1;
          while (j >= 0 && push(i, j)) {
            k++;
            j = at(r + dr * k, c + dc * k);
          }
        }
      }
    }
  }

  if (!capturesOnly) {
    // キャスリング
    const k = white ? 60 : 4;
    const enemy = !white;
    const [kc, qc, rook] = white ? ['K', 'Q', 'R'] : ['k', 'q', 'r'];
    if (board[k] === (white ? 'K' : 'k') && !attacked(board, k, enemy)) {
      if (
        p.castling.includes(kc) &&
        board[k + 1] === '' &&
        board[k + 2] === '' &&
        board[k + 3] === rook &&
        !attacked(board, k + 1, enemy) &&
        !attacked(board, k + 2, enemy)
      )
        out.push({ from: k, to: k + 2 });
      if (
        p.castling.includes(qc) &&
        board[k - 1] === '' &&
        board[k - 2] === '' &&
        board[k - 3] === '' &&
        board[k - 4] === rook &&
        !attacked(board, k - 1, enemy) &&
        !attacked(board, k - 2, enemy)
      )
        out.push({ from: k, to: k - 2 });
    }
  }
  return out;
}

const CORNER_RIGHTS: Record<number, string> = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q', 60: 'KQ', 4: 'kq' };

/** 手を適用した局面（合法性は確認しない） */
export function makeMove(p: ChessPos, m: ChessMove): ChessPos {
  const board = p.board.slice();
  const piece = board[m.from];
  const kind = piece.toUpperCase();
  let captured = board[m.to];
  if (kind === 'P' && m.to === p.ep && captured === '') {
    // アンパッサン
    const victim = at(row(m.from), col(m.to));
    captured = board[victim];
    board[victim] = '';
  }
  board[m.to] = m.promo ? (isWhite(piece) ? m.promo.toUpperCase() : m.promo) : piece;
  board[m.from] = '';
  if (kind === 'K' && Math.abs(m.to - m.from) === 2) {
    // キャスリングのルーク移動
    const kingside = m.to > m.from;
    const rookFrom = kingside ? m.from + 3 : m.from - 4;
    const rookTo = kingside ? m.from + 1 : m.from - 1;
    board[rookTo] = board[rookFrom];
    board[rookFrom] = '';
  }
  let castling = p.castling;
  for (const sq of [m.from, m.to]) {
    const lost = CORNER_RIGHTS[sq];
    if (lost) for (const ch of lost) castling = castling.replace(ch, '');
  }
  const ep = kind === 'P' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return {
    board,
    turn: p.turn === 0 ? 1 : 0,
    castling,
    ep,
    halfmove: kind === 'P' || captured !== '' ? 0 : p.halfmove + 1,
  };
}

export function legalMoves(p: ChessPos): ChessMove[] {
  return pseudoMoves(p).filter((m) => !inCheck(makeMove(p, m), p.turn));
}

function insufficientMaterial(board: string[]): boolean {
  const pieces: { kind: string; sq: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === '' || p === 'K' || p === 'k') continue;
    const kind = p.toUpperCase();
    if (kind === 'P' || kind === 'R' || kind === 'Q') return false;
    pieces.push({ kind, sq: i });
  }
  if (pieces.length <= 1) return true;
  // ビショップのみで全て同じ色のマスにある
  if (pieces.every((x) => x.kind === 'B')) {
    const shade = (i: number) => (row(i) + col(i)) & 1;
    return pieces.every((x) => shade(x.sq) === shade(pieces[0].sq));
  }
  return false;
}

export const chess: GameEngine<ChessState, ChessAction> = {
  initial: () => fromFEN(START_FEN),
  turn: (s) => s.turn,
  apply(s, m) {
    if ('claim' in m) return { ...s, claimed: claimableDraw(s) };
    const pos = makeMove(s, m);
    return { ...pos, keys: [...s.keys, positionKey(pos)], lastMove: m, claimed: null };
  },
  outcome(s): Outcome | null {
    if (s.claimed) return { winner: null, reason: `${s.claimed}（申請）` };
    if (legalMoves(s).length === 0) {
      if (inCheck(s)) return { winner: s.turn === 0 ? 1 : 0, reason: 'チェックメイト' };
      return { winner: null, reason: 'ステイルメイト' };
    }
    if (insufficientMaterial(s.board)) return { winner: null, reason: 'デッドポジション（駒不足）' };
    // 5回同形と75手ルールは申請なしで自動的に引き分け
    if (repetitions(s) >= 5) return { winner: null, reason: '同一局面5回' };
    if (s.halfmove >= 150) return { winner: null, reason: '75手ルール' };
    return null;
  },
};

// ---------------------------------------------------------------- CPU

const VALUE: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

// 白から見た駒の位置評価（index 0 = a8）
const PST: Record<string, number[]> = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  R: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  K: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/** 手番側から見た評価値 */
function evaluate(p: ChessPos): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const piece = p.board[i];
    if (piece === '') continue;
    const kind = piece.toUpperCase();
    if (isWhite(piece)) score += VALUE[kind] + PST[kind][i];
    else score -= VALUE[kind] + PST[kind][i ^ 56];
  }
  return p.turn === 0 ? score : -score;
}

const MATE = 100_000;

function orderScore(p: ChessPos, m: ChessMove): number {
  const victim = p.board[m.to];
  let s = 0;
  if (victim !== '') s += 10 * VALUE[victim.toUpperCase()] - VALUE[p.board[m.from].toUpperCase()] / 10;
  if (m.promo === 'q') s += 900;
  return s;
}

function sortMoves(p: ChessPos, moves: ChessMove[]): ChessMove[] {
  return moves
    .map((m) => ({ m, s: orderScore(p, m) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

function quiesce(p: ChessPos, alpha: number, beta: number, deadline: Deadline, qdepth: number): number {
  deadline.check();
  const stand = evaluate(p);
  if (stand >= beta || qdepth === 0) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of sortMoves(p, pseudoMoves(p, true))) {
    const child = makeMove(p, m);
    if (inCheck(child, p.turn)) continue;
    const v = -quiesce(child, -beta, -alpha, deadline, qdepth - 1);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(p: ChessPos, depth: number, alpha: number, beta: number, ply: number, deadline: Deadline): number {
  deadline.check();
  if (depth <= 0) return quiesce(p, alpha, beta, deadline, 6);
  let legal = 0;
  let best = -Infinity;
  for (const m of sortMoves(p, pseudoMoves(p))) {
    const child = makeMove(p, m);
    if (inCheck(child, p.turn)) continue;
    legal++;
    const v = -search(child, depth - 1, -beta, -alpha, ply + 1, deadline);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  if (legal === 0) return inCheck(p) ? -MATE + ply : 0;
  return best;
}

export function chooseChessMove(s: ChessState, level: Level): ChessAction {
  // 同じ評価の手が並んだとき、毎回同じ手にならないよう先に混ぜておく
  const moves = sortMoves(s, shuffle(legalMoves(s)));
  if (moves.length === 1) return moves[0];
  const claimable = level >= 2 && claimableDraw(s) !== null;

  if (level === 1) {
    // 弱い: 1 手読み + ゆらぎ
    let best = moves[0];
    let bestVal = -Infinity;
    for (const m of moves) {
      const v = -quiesce(makeMove(s, m), -Infinity, Infinity, new Deadline(1000), 1) + Math.random() * 120;
      if (v > bestVal) {
        bestVal = v;
        best = m;
      }
    }
    return best;
  }

  const maxDepth = level === 2 ? 2 : 6;
  const deadline = new Deadline(level === 2 ? 1500 : 3000);
  let ordered = moves;
  let best = moves[0];
  let bestScore = 0;
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
      bestScore = alpha;
      ordered = [best, ...ordered.filter((m) => m !== best)];
      if (alpha >= MATE - 100) break;
    }
  } catch (e) {
    if (!isAbort(e)) throw e;
  }
  // 形勢が悪いなら、申請できる引き分けを取る
  if (claimable && bestScore < -50) return { claim: true };
  return best;
}
