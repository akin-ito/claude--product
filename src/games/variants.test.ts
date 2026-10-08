import { describe, expect, it } from 'vitest';
import { chess, fromFEN, type ChessState } from './chess/engine';
import { go, isLegalPlay, score, type GoState } from './go/engine';
import {
  chooseGomokuMove,
  currentStep,
  gomoku,
  isLegal,
  OPENINGS_FOR,
  SIZE,
  type GomokuRule,
  type GomokuState,
  type OpeningRule,
} from './gomoku/engine';
import { declaration, FU, HI, KA, KI, OU, shogi, type ShogiState } from './shogi/engine';

const at = (r: number, c: number) => r * SIZE + c;

describe('五目並べ・連珠の開局規定', () => {
  it('Swap: 1人目が3子を置き、2人目が色を選ぶ', () => {
    let s = gomoku.initial({ rule: 'free', opening: 'swap' });
    for (const p of [at(7, 7), at(6, 8), at(8, 6)]) {
      expect(s.turn).toBe(0);
      s = gomoku.apply(s, p);
    }
    expect(currentStep(s)?.k).toBe('color');
    expect(s.turn).toBe(1);
    s = gomoku.apply(s, { t: 'color', color: 'white' });
    expect(s.blackSeat).toBe(0);
    expect(currentStep(s)).toBeNull();
    expect(s.turn).toBe(1); // 4手目は白 = プレイヤー2
  });

  it('Swap2: 2子追加なら、1人目が色を選ぶ', () => {
    let s = gomoku.initial({ rule: 'standard', opening: 'swap2' });
    for (const p of [at(7, 7), at(6, 8), at(8, 6)]) s = gomoku.apply(s, p);
    s = gomoku.apply(s, { t: 'swap2', choice: 'more' });
    expect(s.turn).toBe(1);
    s = gomoku.apply(s, at(6, 6));
    s = gomoku.apply(s, at(8, 8));
    expect(s.board.filter((v) => v === 1).length).toBe(3);
    expect(currentStep(s)?.k).toBe('color');
    expect(s.turn).toBe(0);
    s = gomoku.apply(s, { t: 'color', color: 'black' });
    expect(s.blackSeat).toBe(0);
    expect(s.turn).toBe(1); // 6手目は白
  });

  it('旧RIF規定: 珠型の範囲、交替、5手目2題提示と選択', () => {
    let s = gomoku.initial({ rule: 'renju', opening: 'rif' });
    expect(isLegal(s, at(6, 6))).toBe(false); // 1手目は天元のみ
    s = gomoku.apply(s, at(7, 7));
    expect(isLegal(s, at(5, 7))).toBe(false); // 2手目は中央3×3
    s = gomoku.apply(s, at(6, 7));
    expect(isLegal(s, at(4, 7))).toBe(false); // 3手目は中央5×5
    s = gomoku.apply(s, at(5, 7));
    expect(currentStep(s)?.k).toBe('swap');
    expect(s.turn).toBe(1);
    s = gomoku.apply(s, { t: 'swap', swap: true }); // プレイヤー2が黒になる
    expect(s.blackSeat).toBe(1);
    expect(s.turn).toBe(0); // 4手目の白はプレイヤー1
    s = gomoku.apply(s, at(9, 7)); // 4手目（どこでもよい）
    expect(currentStep(s)?.k).toBe('propose');
    expect(s.turn).toBe(1);
    // 局面は縦の線で左右対称なので、鏡像の位置は同時に提示できない
    s = gomoku.apply(s, { t: 'propose', p: at(8, 6) });
    expect(isLegal(s, { t: 'propose', p: at(8, 8) })).toBe(false);
    s = gomoku.apply(s, { t: 'propose', p: at(8, 9) });
    expect(currentStep(s)?.k).toBe('select');
    expect(s.turn).toBe(0);
    s = gomoku.apply(s, { t: 'select', p: at(8, 9) });
    expect(s.board[at(8, 9)]).toBe(1);
    expect(s.board[at(8, 6)]).toBe(0);
    expect(currentStep(s)).toBeNull();
    expect(s.turn).toBe(0); // 6手目は白 = プレイヤー1
  });

  it('Soosõrv-8: 4手目の後に提示数を宣言し、相手が交替を選ぶ', () => {
    let s = gomoku.initial({ rule: 'renju', opening: 'soosorv8' });
    for (const p of [at(7, 7), at(6, 6), at(8, 8)]) s = gomoku.apply(s, p);
    s = gomoku.apply(s, { t: 'swap', swap: false });
    s = gomoku.apply(s, at(3, 3)); // 白（プレイヤー2）の4手目
    expect(currentStep(s)?.k).toBe('declare');
    expect(s.turn).toBe(1);
    expect(isLegal(s, { t: 'declare', n: 9 })).toBe(false);
    s = gomoku.apply(s, { t: 'declare', n: 3 });
    expect(currentStep(s)?.k).toBe('swap');
    expect(s.turn).toBe(0);
    s = gomoku.apply(s, { t: 'swap', swap: false });
    expect(currentStep(s)?.k).toBe('propose');
    expect(s.fifthCount).toBe(3);
  });

  it('Taraguchi-10: 1手ごとに交替の機会があり、範囲が広がる', () => {
    let s = gomoku.initial({ rule: 'renju', opening: 'taraguchi10' });
    const stones = [at(7, 7), at(6, 7), at(5, 8), at(10, 7)];
    for (const p of stones) {
      s = gomoku.apply(s, p);
      expect(currentStep(s)?.k).toBe('swap');
      s = gomoku.apply(s, { t: 'swap', swap: true });
    }
    expect(currentStep(s)?.k).toBe('tchoice');
    s = gomoku.apply(s, { t: 'tchoice', mode: 'one' });
    expect(isLegal(s, at(2, 7))).toBe(false); // 9×9 の外
    s = gomoku.apply(s, at(9, 9));
    expect(currentStep(s)?.k).toBe('swap');
  });

  it('Taraguchi-10 の4手目は中央7×7まで', () => {
    let s = gomoku.initial({ rule: 'renju', opening: 'taraguchi10' });
    for (const p of [at(7, 7), at(6, 7), at(5, 8)]) {
      s = gomoku.apply(s, p);
      s = gomoku.apply(s, { t: 'swap', swap: false });
    }
    expect(isLegal(s, at(3, 7))).toBe(false);
    expect(isLegal(s, at(4, 7))).toBe(true);
  });

  it('CPU どうしで、どの開局規定でも合法な操作だけで通常の対局まで進む', () => {
    for (const rule of ['free', 'standard', 'renju'] as GomokuRule[]) {
      for (const opening of OPENINGS_FOR[rule] as OpeningRule[]) {
        let s: GomokuState = gomoku.initial({ rule, opening });
        for (let k = 0; k < 40 && currentStep(s); k++) {
          const m = chooseGomokuMove(s, 2);
          expect(isLegal(s, m)).toBe(true);
          s = gomoku.apply(s, m);
        }
        expect(currentStep(s)).toBeNull();
        expect(isLegal(s, chooseGomokuMove(s, 2))).toBe(true);
      }
    }
  });
});

describe('チェス: 引き分けの方式と合意', () => {
  it('提案は手と一緒に伝わり、相手が受ければ引き分け', () => {
    let s: ChessState = chess.initial({ drawRule: 'fide' });
    s = chess.apply(s, { offer: true });
    s = chess.apply(s, { from: 52, to: 36 });
    expect(s.offer).toBe(0);
    s = chess.apply(s, { accept: true });
    expect(chess.outcome(s)).toEqual({ winner: null, reason: '合意' });
  });

  it('提案を受けずに指せば断ったことになる', () => {
    let s: ChessState = chess.initial({ drawRule: 'fide' });
    s = chess.apply(s, { offer: true });
    s = chess.apply(s, { from: 52, to: 36 });
    s = chess.apply(s, { from: 12, to: 28 });
    expect(s.offer).toBeNull();
    expect(s.declined).toBe(1);
  });

  it('自動方式では3回同形で自動的に引き分け', () => {
    let s: ChessState = chess.initial({ drawRule: 'auto' });
    const shuffle = [
      { from: 62, to: 45 },
      { from: 6, to: 21 },
      { from: 45, to: 62 },
      { from: 21, to: 6 },
    ];
    for (let k = 0; k < 2; k++) for (const m of shuffle) s = chess.apply(s, m);
    expect(chess.outcome(s)).toEqual({ winner: null, reason: '同一局面3回' });
  });

  it('時間切れでも、相手がキングだけなら引き分け', () => {
    const s = { ...fromFEN('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'), drawRule: 'fide' as const };
    // 白が時間切れ → 黒はキングだけなので引き分け
    expect(chess.timeoutOutcome!(s, 0).winner).toBeNull();
    // 黒が時間切れ → 白はポーンがあるので白の勝ち
    expect(chess.timeoutOutcome!(s, 1).winner).toBe(0);
  });
});

describe('将棋: 入玉宣言の方式と持将棋', () => {
  const position = (inCampPoints: 'many' | 'mid', rule: '24' | '27'): ShogiState => {
    const board = new Array(81).fill(0);
    board[1 * 9 + 4] = OU;
    board[0] = HI;
    board[1] = KA;
    for (let k = 0; k < 8; k++) board[2 * 9 + k] = FU;
    board[8 * 9 + 8] = -OU;
    const hands: [number[], number[]] = [new Array(8).fill(0), new Array(8).fill(0)];
    hands[0][FU] = inCampPoints === 'many' ? 13 : 6; // 31点 / 24点
    return {
      board,
      hands,
      turn: 0,
      handicap: 'none',
      declareRule: rule,
      offer: null,
      declined: null,
      agreed: false,
      declareResult: null,
      startTurn: 0,
      declared: null,
      keys: ['x'],
      checks: [false],
      lastMove: null,
    };
  };

  it('24点法: 31点以上は勝ち、24〜30点は持将棋', () => {
    let s = position('many', '24');
    expect(declaration(s)).toMatchObject({ ok: true, result: 'win', points: 31 });
    expect(shogi.outcome(shogi.apply(s, { declare: true }))?.winner).toBe(0);
    s = position('mid', '24');
    expect(declaration(s)).toMatchObject({ ok: true, result: 'draw', points: 24 });
    expect(shogi.outcome(shogi.apply(s, { declare: true }))).toEqual({ winner: null, reason: '持将棋（入玉宣言・24点法）' });
  });

  it('27点法: 点数が足りなければ宣言できない', () => {
    expect(declaration(position('mid', '27')).ok).toBe(false);
  });

  it('相入玉で持将棋を提案・合意し、24点未満の側は負け', () => {
    const board = new Array(81).fill(0);
    board[1 * 9 + 4] = OU; // 先手玉 5二
    board[7 * 9 + 4] = -OU; // 後手玉 5八
    board[0] = HI;
    board[1] = KA;
    board[2] = KI;
    const hands: [number[], number[]] = [new Array(8).fill(0), new Array(8).fill(0)];
    hands[0][FU] = 20; // 先手 5+5+1+20 = 31点、後手 0点
    let s: ShogiState = { ...position('mid', '27'), board, hands };
    s = shogi.apply(s, { offer: true });
    s = shogi.apply(s, { from: 2, to: 3, promote: false });
    s = shogi.apply(s, { accept: true });
    expect(shogi.outcome(s)).toEqual({ winner: 0, reason: '持将棋（24点に満たず）' });
  });
});

describe('囲碁: ルールセット', () => {
  const fromRows = (rows: string[], ruleset: GoState['ruleset'], komi: number): GoState => {
    const s = go.initial({ size: rows.length, handicap: 'even', ruleset, komi });
    const board = rows.join('').split('').map((ch) => (ch === 'X' ? 1 : ch === 'O' ? 2 : 0));
    return { ...s, board, phase: 'ended' };
  };

  it('中国ルールは石＋地で数え、セキの眼も数える', () => {
    const s = fromRows(['.X.O.', 'XXXOO', 'XXXOO', 'XXXOO', 'XXXOO'], 'chinese', 7.5);
    const sc = score(s);
    expect(sc.black).toBe(13 + 1); // 黒石13 + 眼1
    expect(sc.white).toBe(9 + 1 + 7.5);
  });

  it('置き碁の補償: 中国は置石の数、AGA は置石の数−1に半目', () => {
    expect(go.initial({ size: 19, handicap: 4, ruleset: 'chinese', komi: 7.5 }).komi).toBe(4);
    expect(go.initial({ size: 19, handicap: 4, ruleset: 'aga', komi: 7.5 }).komi).toBe(3.5);
    expect(go.initial({ size: 19, handicap: 4, ruleset: 'japanese', komi: 6.5 }).komi).toBe(0);
    expect(go.initial({ size: 9, handicap: 'even', ruleset: 'chinese', komi: 5.5 }).komi).toBe(5.5);
  });

  it('中国ルールの超コウ: 以前の盤面に戻す手は打てない', () => {
    let s = go.initial({ size: 9, handicap: 'even', ruleset: 'chinese', komi: 7.5 });
    const play = (p: number) => (s = go.apply(s, { t: 'play', p }));
    play(1); play(2);
    play(9); play(12);
    play(19); play(20);
    play(40); play(10);
    play(11); // 黒がコウを取る
    play(60); // 白がコウダテ
    play(61); // 黒が受ける
    // 白が取り返すと、黒が 11 に打つ前と同じ盤面にはならない（60, 61 が増えている）ので打てる
    expect(isLegalPlay(s, 10)).toBe(true);
  });

  it('同じ盤面を作る手は中国ルールでは打てず、日本ルールでは打てる', () => {
    for (const ruleset of ['chinese', 'japanese'] as const) {
      let s = go.initial({ size: 9, handicap: 'even', ruleset, komi: 7.5 });
      const play = (p: number) => (s = go.apply(s, { t: 'play', p }));
      play(1); play(2);
      play(9); play(12);
      play(19); play(20);
      play(40); play(10);
      play(11); // 黒がコウを取る
      s = go.apply(s, { t: 'pass' }); // 白パス（コウの禁止が解ける）
      s = go.apply(s, { t: 'pass' }); // 黒パス → 死石確認
      s = go.apply(s, { t: 'resume' }); // 白の番で対局再開
      // 白 10 で取り返すと、黒が 11 に打つ前の盤面（白番 → 黒番の違いはあるが盤面は同じ）に戻る
      expect(isLegalPlay(s, 10)).toBe(ruleset === 'japanese');
    }
  });

  it('AGA ルールでは白のパスで終局する', () => {
    let s = go.initial({ size: 9, handicap: 'even', ruleset: 'aga', komi: 7.5 });
    s = go.apply(s, { t: 'play', p: 40 }); // 黒
    s = go.apply(s, { t: 'pass' }); // 白パス
    s = go.apply(s, { t: 'pass' }); // 黒パス → まだ終わらない
    expect(s.phase).toBe('play');
    s = go.apply(s, { t: 'pass' }); // 白パス → 終局
    expect(s.phase).toBe('scoring');
  });
});
