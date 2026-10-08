import { describe, expect, it } from 'vitest';
import { initClock, spend, timeToFlag, type TimeControl } from './clock';

const S = 1000;

describe('対局時計', () => {
  it('切れ負け: 使い切ったら時間切れ', () => {
    const tc: TimeControl = { kind: 'sudden', mainSec: 60 };
    const [c] = initClock(tc);
    expect(spend(tc, c, 59 * S)?.main).toBe(1 * S);
    expect(spend(tc, c, 61 * S)).toBeNull();
  });

  it('フィッシャー: 指すたびに加算', () => {
    const tc: TimeControl = { kind: 'fischer', mainSec: 60, incSec: 5 };
    const [c] = initClock(tc);
    expect(spend(tc, c, 10 * S)?.main).toBe(55 * S);
  });

  it('遅延: 遅延時間内なら減らない', () => {
    const tc: TimeControl = { kind: 'delay', mainSec: 60, delaySec: 5 };
    const [c] = initClock(tc);
    expect(spend(tc, c, 4 * S)?.main).toBe(60 * S);
    expect(spend(tc, c, 8 * S)?.main).toBe(57 * S);
    expect(timeToFlag(tc, c)).toBe(65 * S);
  });

  it('秒読み: 持ち時間の後は 1 手ごと、超えた回数分を消費', () => {
    const tc: TimeControl = { kind: 'byoyomi', mainSec: 10, periodSec: 30, periods: 3 };
    let c = initClock(tc)[0];
    c = spend(tc, c, 20 * S)!; // 持ち時間 10 秒 + 秒読み 10 秒 → 回数は減らない
    expect(c).toMatchObject({ main: 0, periods: 3 });
    c = spend(tc, c, 45 * S)!; // 30 秒を 1 回使い切った
    expect(c.periods).toBe(2);
    expect(spend(tc, c, 61 * S)).toBeNull(); // 残り 2 回 = 60 秒を超えたら時間切れ
  });

  it('秒読みのみ（持ち時間なし）', () => {
    const tc: TimeControl = { kind: 'byoyomi', mainSec: 0, periodSec: 30, periods: 1 };
    const c = initClock(tc)[0];
    expect(spend(tc, c, 29 * S)).toMatchObject({ main: 0, periods: 1 });
    expect(spend(tc, c, 31 * S)).toBeNull();
  });

  it('カナダ式: 区切り時間内に決められた手数を指す', () => {
    const tc: TimeControl = { kind: 'canadian', mainSec: 10, periodSec: 60, moves: 2 };
    let c = initClock(tc)[0];
    c = spend(tc, c, 15 * S)!; // 持ち時間を使い切り、区切りに入って 5 秒使用
    expect(c).toMatchObject({ main: 0, periodLeft: 55 * S, movesLeft: 1 });
    c = spend(tc, c, 50 * S)!; // 2 手目で区切りを達成 → リセット
    expect(c).toMatchObject({ periodLeft: 60 * S, movesLeft: 2 });
    c = spend(tc, c, 40 * S)!;
    expect(spend(tc, c, 21 * S)).toBeNull();
  });
});
