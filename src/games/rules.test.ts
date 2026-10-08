import { describe, expect, it } from 'vitest';
import { chess, claimableDraw } from './chess/engine';
import { go, handicapPoints, score, type GoState } from './go/engine';
import { gomoku, isForbidden, isLegal as gomokuLegal, SIZE } from './gomoku/engine';
import { othello } from './othello/engine';
import {
  declaration, FU, HI, KA, legalMoves as shogiMoves, OU, shogi,
  type ShogiState,
} from './shogi/engine';

/** 図の文字列（PointDiagram 形式）を 15 路盤の中央付近に置く */
function gomokuBoard(rows: string[]): { board: number[]; at: (r: number, c: number) => number; marks: number[] } {
  const board = new Array(SIZE * SIZE).fill(0);
  const marks: number[] = [];
  const off = 4;
  const at = (r: number, c: number) => (r + off) * SIZE + c + off;
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === 'X') board[at(r, c)] = 1;
      if (ch === 'O') board[at(r, c)] = 2;
      if (ch === '#' || ch === '*') marks.push(at(r, c));
    }),
  );
  return { board, at, marks };
}

describe('五目並べ（ルールガイドの図を含む）', () => {
  it('三三・四四・長連は禁じ手', () => {
    for (const rows of [
      ['.......', '.......', '....X..', '....X..', '..XX#..', '.......', '.......'],
      ['....O..', '....X..', '....X..', '....X..', '.XXX#..', '.......'],
      ['.........', '.XXX#XX..', '.........'],
    ]) {
      const { board, marks } = gomokuBoard(rows);
      expect(isForbidden(board, marks[0])).toBe(true);
    }
  });

  it('四三は禁じ手ではない', () => {
    const { board, marks } = gomokuBoard(['....O....', '....X....', '....X....', '....X....', '..XX*....', '.........', '.........']);
    expect(isForbidden(board, marks[0])).toBe(false);
  });

  it('五ができる手は、禁じ手の形があっても勝ち', () => {
    // 横に五、縦に三三の形
    const { board, at } = gomokuBoard(['.......', '.......', '....X..', '....X..', 'XXXX...', '.......', '.......']);
    expect(isForbidden(board, at(4, 4))).toBe(false);
  });

  it('止められた三は三ではない（三三にならない）', () => {
    const { board, marks } = gomokuBoard(['....O..', '....X..', '....X..', '..XX#..', '.......', '.......']);
    expect(isForbidden(board, marks[0])).toBe(false);
  });

  it('長連の扱いはルールで異なる', () => {
    const make = (rule: 'free' | 'standard' | 'renju', color: 'black' | 'white') => {
      let s = gomoku.initial({ rule, opening: 'none' });
      const row = 7 * SIZE;
      const mine = [row + 1, row + 2, row + 3, row + 5, row + 6];
      const theirs = [0, 2, 4, 6, 8];
      if (color === 'white') s = gomoku.apply(s, 14 * SIZE + 14);
      for (let k = 0; k < 5; k++) {
        s = gomoku.apply(s, mine[k]);
        s = gomoku.apply(s, theirs[k]);
      }
      return { s, gap: row + 4 };
    };
    // 自由ルール: 長連でも勝ち
    let { s, gap } = make('free', 'black');
    expect(gomoku.outcome(gomoku.apply(s, gap))?.winner).toBe(0);
    // 標準ルール: 長連は勝ちにならない
    ({ s, gap } = make('standard', 'black'));
    expect(gomoku.outcome(gomoku.apply(s, gap))).toBeNull();
    // 連珠: 黒の長連は禁じ手、白の長連は勝ち
    ({ s, gap } = make('renju', 'black'));
    expect(gomokuLegal(s, gap)).toBe(false);
    ({ s, gap } = make('renju', 'white'));
    expect(gomoku.outcome(gomoku.apply(s, gap))?.winner).toBe(1);
  });
});

describe('オセロ', () => {
  it('空きマスは勝者に加算する', () => {
    const board = new Array(64).fill(0);
    for (let i = 0; i < 10; i++) board[i] = 1;
    board[20] = 2;
    board[21] = 2;
    const out = othello.outcome({ board, turn: 0, last: -1, passed: null, over: true });
    expect(out).toEqual({ winner: 0, reason: '62 対 2（空き52マスは勝者に加算）' });
  });
});

describe('チェス（FIDE）', () => {
  const shuffle = [
    { from: 62, to: 45 },
    { from: 6, to: 21 },
    { from: 45, to: 62 },
    { from: 21, to: 6 },
  ];

  it('3回同形は申請で引き分け、5回同形は自動で引き分け', () => {
    let s = chess.initial({ drawRule: 'fide' });
    for (let k = 0; k < 2; k++) for (const m of shuffle) s = chess.apply(s, m);
    expect(chess.outcome(s)).toBeNull();
    expect(claimableDraw(s)).toBe('同一局面3回');
    expect(chess.outcome(chess.apply(s, { claim: true }))).toEqual({ winner: null, reason: '同一局面3回（申請）' });
    for (let k = 0; k < 2; k++) for (const m of shuffle) s = chess.apply(s, m);
    expect(chess.outcome(s)).toEqual({ winner: null, reason: '同一局面5回' });
  });

  it('アンパッサンできないときは、局面の区別に含めない', () => {
    const s = chess.apply(chess.initial({ drawRule: 'fide' }), { from: 52, to: 36 }); // e4
    expect(s.ep).toBe(44);
    expect(s.keys[1].endsWith('-1')).toBe(true);
  });
});

describe('将棋（駒落ち・入玉宣言）', () => {
  it('駒落ちは上手の駒を除き、上手から指す', () => {
    const s = shogi.initial({ handicap: 'two', declareRule: '27' });
    expect(s.turn).toBe(1);
    expect(s.board[10]).toBe(0);
    expect(s.board[16]).toBe(0);
    expect(shogiMoves(s).every((m) => s.board[m.from] < 0)).toBe(true);
  });

  it('駒落ちでも千日手の手番を正しく数える', () => {
    let s = shogi.initial({ handicap: 'bishop', declareRule: '27' });
    const cycle = [
      { from: 10, to: 11, promote: false }, // 上手 8二飛 → 7二
      { from: 70, to: 69, promote: false }, // 下手 2八飛 → 3八
      { from: 11, to: 10, promote: false },
      { from: 69, to: 70, promote: false },
    ];
    for (let k = 0; k < 3; k++) for (const m of cycle) s = shogi.apply(s, m);
    expect(shogi.outcome(s)).toEqual({ winner: null, reason: '千日手（指し直し）' });
  });

  const declarationPosition = (inCamp: number): ShogiState => {
    const board = new Array(81).fill(0);
    board[1 * 9 + 4] = OU; // 先手玉 5二
    board[0] = HI;
    board[1] = KA;
    for (let k = 0; k < inCamp - 2; k++) board[2 * 9 + k] = FU;
    board[8 * 9 + 8] = -OU; // 後手玉 1九
    const hands: [number[], number[]] = [new Array(8).fill(0), new Array(8).fill(0)];
    hands[0][FU] = 10;
    return { board, hands, turn: 0, handicap: 'none', declareRule: '27', offer: null, declined: null, agreed: false, declareResult: null, startTurn: 0, declared: null, keys: ['x'], checks: [false], lastMove: null };
  };

  it('27点法の条件を満たせば宣言勝ち', () => {
    const s = declarationPosition(10);
    const d = declaration(s);
    expect(d).toMatchObject({ ok: true, piecesInCamp: 10, points: 28, required: 28 });
    expect(shogi.outcome(shogi.apply(s, { declare: true }))).toEqual({ winner: 0, reason: '入玉宣言' });
  });

  it('敵陣の駒が10枚未満なら宣言できない', () => {
    const s = declarationPosition(9);
    expect(declaration(s).ok).toBe(false);
    expect(shogi.outcome(shogi.apply(s, { declare: true }))).toBeNull();
  });

  it('打ち歩詰めのガイドの図は、実際に打ち歩詰め', () => {
    const board = new Array(81).fill(0);
    board[7] = -FU; // 2一 後手歩
    board[8] = -OU; // 1一 後手玉
    board[2 * 9 + 8] = 5; // 1三 先手金
    board[80] = OU;
    const hands: [number[], number[]] = [new Array(8).fill(0), new Array(8).fill(0)];
    hands[0][FU] = 1;
    const moves = shogiMoves({ board, hands, turn: 0 });
    expect(moves.some((m) => m.drop === FU && m.to === 17)).toBe(false);
    expect(moves.some((m) => m.drop === FU && m.to === 26 - 9 - 1)).toBe(true); // ほかの場所には打てる
  });
});

describe('囲碁（日本ルール）', () => {
  const fromRows = (rows: string[], ruleset: GoState['ruleset'] = 'japanese'): GoState => {
    const size = rows.length;
    const s = go.initial({ size, handicap: 'even', ruleset, komi: ruleset === 'japanese' ? 6.5 : 7.5 });
    const board = rows.join('').split('').map((ch) => (ch === 'X' ? 1 : ch === 'O' ? 2 : 0));
    return { ...s, board, phase: 'ended' };
  };

  it('置き碁は定位置に置石、白から打ち、コミなし', () => {
    const s = go.initial({ size: 19, handicap: 4, ruleset: 'japanese', komi: 6.5 });
    expect(s.board.filter((v) => v === 1).length).toBe(4);
    expect(s.turn).toBe(1);
    expect(s.komi).toBe(0);
    expect(handicapPoints(19, 2)).toEqual([3 * 19 + 15, 15 * 19 + 3]);
  });

  it('定先はコミなしで黒から', () => {
    const s = go.initial({ size: 9, handicap: 'sente', ruleset: 'japanese', komi: 6.5 });
    expect(s.turn).toBe(0);
    expect(s.komi).toBe(0);
  });

  it('セキの眼は地にならない', () => {
    const s = fromRows(['.X.O.', 'XXXOO', 'XXXOO', 'XXXOO', 'XXXOO']);
    const sc = score(s);
    expect(sc.black).toBe(0);
    expect(sc.white).toBe(6.5);
  });

  it('詰めていないダメがあっても、ふつうの地は数える', () => {
    const s = fromRows(['.X.O.', '.X.O.', '.X.O.', '.X.O.', '.X.O.']);
    const sc = score(s);
    expect(sc.black).toBe(5);
    expect(sc.white).toBe(5 + 6.5);
  });

  it('同点は持碁', () => {
    const s = { ...fromRows(['.X.O.', '.X.O.', '.X.O.', '.X.O.', '.X.O.']), komi: 0 };
    expect(go.outcome(s)).toEqual({ winner: null, reason: '持碁（黒 5目・白 5目）' });
  });

  it('同じ全局面が3回現れたら無勝負', () => {
    let s = go.initial({ size: 9, handicap: 'even', ruleset: 'japanese', komi: 6.5 });
    const play = (p: number) => (s = go.apply(s, { t: 'play', p }));
    // コウの形を作り、パスを挟んで取り合いを続ける（同じ局面を循環させる）
    const passTwiceAndResume = () => {
      s = go.apply(s, { t: 'pass' });
      s = go.apply(s, { t: 'pass' });
      s = go.apply(s, { t: 'resume' });
    };
    play(1); play(2);
    play(9); play(12);
    play(19); play(20);
    play(40); play(10);
    for (let k = 0; k < 3 && !s.noResult; k++) {
      play(11); // 黒がコウを取る
      passTwiceAndResume();
      play(10); // 白が取り返す
      passTwiceAndResume();
    }
    expect(go.outcome(s)?.reason).toBe('同形反復（三コウなど）のため無勝負');
  });
});
