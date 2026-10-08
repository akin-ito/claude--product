import { describe, expect, it } from 'vitest';
import { chess, chooseChessMove, fromFEN, legalMoves as chessMoves, makeMove as chessMake, type ChessPos } from './chess/engine';
import { chooseGoMove, go, isLegalPlay, score } from './go/engine';
import { chooseGomokuMove, gomoku, SIZE } from './gomoku/engine';
import { chooseOthelloMove, legalMoves as othelloMoves, othello } from './othello/engine';
import {
  FU, HI, KI, OU,
  chooseShogiMove, initialPos, legalMoves as shogiMoves, makeMove as shogiMake, shogi, type ShogiPos, type ShogiState,
} from './shogi/engine';

function chessPerft(p: ChessPos, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of chessMoves(p)) n += chessPerft(chessMake(p, m), depth - 1);
  return n;
}

function shogiPerft(p: ShogiPos, depth: number): number {
  if (depth === 0) return 1;
  const moves = shogiMoves(p);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += shogiPerft(shogiMake(p, m), depth - 1);
  return n;
}

describe('チェス', () => {
  it('初期局面の perft', () => {
    const s = chess.initial({});
    expect(chessPerft(s, 1)).toBe(20);
    expect(chessPerft(s, 2)).toBe(400);
    expect(chessPerft(s, 3)).toBe(8902);
  });

  it('Kiwipete（キャスリング・アンパッサン・昇格を含む）の perft', () => {
    const s = fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(chessPerft(s, 1)).toBe(48);
    expect(chessPerft(s, 2)).toBe(2039);
  });

  it('position 3 の perft', () => {
    const s = fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(chessPerft(s, 3)).toBe(2812);
  });

  it('チェックメイトを判定する', () => {
    let s = chess.initial({});
    // フールズメイト
    for (const [from, to] of [[53, 45], [12, 28], [54, 38], [3, 39]]) s = chess.apply(s, { from, to });
    expect(chess.outcome(s)).toEqual({ winner: 1, reason: 'チェックメイト' });
  });

  it('CPU は一手詰めを逃さない', () => {
    const s = fromFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    expect(chooseChessMove(s, 2)).toEqual({ from: 56, to: 0 });
  });
});

describe('将棋', () => {
  it('初期局面の perft', () => {
    const p = initialPos();
    expect(shogiPerft(p, 1)).toBe(30);
    expect(shogiPerft(p, 2)).toBe(900);
    expect(shogiPerft(p, 3)).toBe(25470);
  });

  const empty = (): ShogiPos => ({ board: new Array(81).fill(0), hands: [new Array(8).fill(0), new Array(8).fill(0)], turn: 0 });

  it('二歩は打てない', () => {
    const p = empty();
    p.board[4] = -OU;
    p.board[76] = OU;
    p.board[6 * 9 + 2] = FU;
    p.hands[0][FU] = 1;
    const drops = shogiMoves(p).filter((m) => m.drop === FU);
    expect(drops.some((m) => m.to % 9 === 2)).toBe(false);
    expect(drops.some((m) => m.to < 9)).toBe(false); // 一段目にも打てない
    expect(drops.length).toBeGreaterThan(0);
  });

  it('打ち歩詰めは反則', () => {
    const p = empty();
    // 後手玉 1一、周りを先手の駒で固める
    p.board[8] = -OU; // 1一
    p.board[7] = -FU; // 2一 の後手の歩で逃げ道を塞ぐ
    p.board[2 * 9 + 8] = KI; // 1三 の金が 1二 を守る
    p.board[2 * 9 + 6] = HI; // 3三 の飛車が 2二 を押さえる
    p.board[80] = OU;
    p.hands[0][FU] = 1;
    const drop = shogiMoves(p).find((m) => m.drop === FU && m.to === 17);
    expect(drop).toBeUndefined();
  });

  it('詰みを判定する', () => {
    const p = empty();
    p.board[4] = -OU; // 5一
    p.board[2 * 9 + 4] = FU; // 5三
    p.board[80] = OU;
    p.hands[0][KI] = 1;
    const s: ShogiState = { ...p, keys: ['x'], checks: [false], lastMove: null };
    const next = shogi.apply(s, { from: -1, to: 13, drop: KI }); // 5二金
    expect(shogi.outcome(next)).toEqual({ winner: 0, reason: '詰み' });
  });

  it('CPU は頭金の一手詰めを指す', () => {
    const p = empty();
    p.board[4] = -OU;
    p.board[2 * 9 + 4] = FU;
    p.board[80] = OU;
    p.hands[0][KI] = 1;
    const s: ShogiState = { ...p, keys: ['x'], checks: [false], lastMove: null };
    expect(chooseShogiMove(s, 2)).toEqual({ from: -1, to: 13, drop: KI });
  });

  it('同一局面4回で千日手', () => {
    let s = shogi.initial({});
    const cycle = [
      { from: 70, to: 69, promote: false }, // 2八飛 → 3八
      { from: 10, to: 11, promote: false }, // 8二飛 → 7二
      { from: 69, to: 70, promote: false },
      { from: 11, to: 10, promote: false },
    ];
    for (let k = 0; k < 3; k++) for (const m of cycle) s = shogi.apply(s, m);
    expect(shogi.outcome(s)).toEqual({ winner: null, reason: '千日手' });
  });
});

describe('オセロ', () => {
  it('初期局面の合法手は 4 つ', () => {
    expect(othelloMoves(othello.initial({})).sort((a, b) => a - b)).toEqual([19, 26, 37, 44]);
  });

  it('石を挟んで返す', () => {
    const s = othello.apply(othello.initial({}), 19);
    expect(s.board[27]).toBe(1);
    expect(s.turn).toBe(1);
  });

  it('CPU が合法手を返す', () => {
    const s = othello.initial({});
    for (const lv of [1, 2, 3] as const) expect(othelloMoves(s)).toContain(chooseOthelloMove(s, lv));
  });
});

describe('五目並べ', () => {
  it('5 つ並ぶと勝ち', () => {
    let s = gomoku.initial({});
    for (let k = 0; k < 4; k++) {
      s = gomoku.apply(s, 7 * SIZE + k);
      s = gomoku.apply(s, 9 * SIZE + k);
    }
    expect(gomoku.outcome(s)).toBeNull();
    s = gomoku.apply(s, 7 * SIZE + 4);
    expect(gomoku.outcome(s)?.winner).toBe(0);
  });

  it('CPU は相手の四を止める', () => {
    let s = gomoku.initial({});
    const black = [7 * SIZE + 3, 7 * SIZE + 4, 7 * SIZE + 5, 7 * SIZE + 6];
    const white = [0, 2, 4];
    for (let k = 0; k < 3; k++) {
      s = gomoku.apply(s, black[k]);
      s = gomoku.apply(s, white[k]);
    }
    s = gomoku.apply(s, black[3]);
    for (const lv of [2, 3] as const) expect([7 * SIZE + 2, 7 * SIZE + 7]).toContain(chooseGomokuMove(s, lv));
  });
});

describe('囲碁', () => {
  it('コウ', () => {
    let s = go.initial({ size: 9 });
    const play = (p: number) => (s = go.apply(s, { t: 'play', p }));
    // 典型的なコウの形
    //   . B W .
    //   B W . W
    //   . B W .
    play(1); play(2);
    play(9); play(12);
    play(19); play(20);
    play(40); play(10); // 白が 10 に
    play(11); // 黒が 11 に打って白 10 を取る
    expect(s.board[10]).toBe(0);
    expect(s.captures[0]).toBe(1);
    expect(isLegalPlay(s, 10)).toBe(false); // コウ
    play(60); play(61);
    expect(isLegalPlay(s, 10)).toBe(true);
  });

  it('自殺手は打てない', () => {
    let s = go.initial({ size: 9 });
    const play = (p: number) => (s = go.apply(s, { t: 'play', p }));
    play(1); play(40);
    play(9); // 白が 0 に打つと自殺手
    expect(isLegalPlay(s, 0)).toBe(false);
  });

  it('パス 2 回で死石確認、確定で終局', () => {
    let s = go.initial({ size: 9 });
    s = go.apply(s, { t: 'pass' });
    s = go.apply(s, { t: 'pass' });
    expect(s.phase).toBe('scoring');
    s = go.apply(s, { t: 'done' });
    expect(go.outcome(s)).toEqual({ winner: 1, reason: '6.5目差（黒 0目・白 6.5目）' });
    expect(score(s).white).toBe(6.5);
  });

  it('CPU が手を返す', () => {
    const s = go.initial({ size: 9 });
    const m = chooseGoMove(s, 1);
    expect(m.t === 'pass' || (m.t === 'play' && isLegalPlay(s, m.p))).toBe(true);
  });
});
