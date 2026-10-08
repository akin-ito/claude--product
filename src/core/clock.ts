/**
 * 持ち時間の方式。時間はすべて秒で持つ。
 *   none     = 時計なし
 *   sudden   = 切れ負け（持ち時間を使い切ったら負け）
 *   byoyomi  = 秒読み（持ち時間を使い切った後、1手 periodSec 秒以内。超えるたびに 1 回分を消費）
 *   fischer  = フィッシャー（1手指すごとに incSec 秒加算）
 *   canadian = カナダ式（持ち時間の後、periodSec 秒で moves 手を指す）
 *   delay    = 遅延（毎手 delaySec 秒までは持ち時間が減らない。米国チェス連盟の方式）
 */
export type TimeControl =
  | { kind: 'none' }
  | { kind: 'sudden'; mainSec: number }
  | { kind: 'byoyomi'; mainSec: number; periodSec: number; periods: number }
  | { kind: 'fischer'; mainSec: number; incSec: number }
  | { kind: 'canadian'; mainSec: number; periodSec: number; moves: number }
  | { kind: 'delay'; mainSec: number; delaySec: number };

export type TimeKind = TimeControl['kind'];

export interface PlayerClock {
  /** 残りの持ち時間（ミリ秒） */
  main: number;
  /** 秒読みの残り回数 */
  periods: number;
  /** カナダ式: 今の区切りの残り時間と残り手数 */
  periodLeft: number;
  movesLeft: number;
}

export type ClockState = [PlayerClock, PlayerClock];

export function initClock(tc: TimeControl): ClockState {
  const one = (): PlayerClock => {
    switch (tc.kind) {
      case 'none':
        return { main: 0, periods: 0, periodLeft: 0, movesLeft: 0 };
      case 'byoyomi':
        return { main: tc.mainSec * 1000, periods: tc.periods, periodLeft: 0, movesLeft: 0 };
      case 'canadian':
        return { main: tc.mainSec * 1000, periods: 0, periodLeft: tc.periodSec * 1000, movesLeft: tc.moves };
      default:
        return { main: tc.mainSec * 1000, periods: 0, periodLeft: 0, movesLeft: 0 };
    }
  };
  return [one(), one()];
}

/** その手番で、あと何ミリ秒考えると時間切れになるか */
export function timeToFlag(tc: TimeControl, c: PlayerClock): number {
  switch (tc.kind) {
    case 'none':
      return Infinity;
    case 'sudden':
    case 'fischer':
      return c.main;
    case 'delay':
      return c.main + tc.delaySec * 1000;
    case 'byoyomi':
      return c.main + c.periods * tc.periodSec * 1000;
    case 'canadian':
      return c.main > 0 ? c.main + tc.periodSec * 1000 : c.periodLeft;
  }
}

/**
 * 1 手に elapsed ミリ秒使ったあとの時計。時間切れなら null。
 */
export function spend(tc: TimeControl, c: PlayerClock, elapsed: number): PlayerClock | null {
  if (elapsed > timeToFlag(tc, c)) return null;
  switch (tc.kind) {
    case 'none':
      return c;
    case 'sudden':
      return { ...c, main: c.main - elapsed };
    case 'fischer':
      return { ...c, main: c.main - elapsed + tc.incSec * 1000 };
    case 'delay':
      return { ...c, main: c.main - Math.max(0, elapsed - tc.delaySec * 1000) };
    case 'byoyomi': {
      if (elapsed <= c.main) return { ...c, main: c.main - elapsed };
      // 持ち時間を超えた分で、まるごと使い切った秒読みの回数を減らす
      const over = elapsed - c.main;
      const used = Math.floor(over / (tc.periodSec * 1000));
      return { ...c, main: 0, periods: c.periods - used };
    }
    case 'canadian': {
      const period = tc.periodSec * 1000;
      let { main, periodLeft, movesLeft } = c;
      let rest = elapsed;
      if (main > 0) {
        if (rest <= main) return { ...c, main: main - rest };
        rest -= main;
        main = 0;
        periodLeft = period;
        movesLeft = tc.moves;
      }
      periodLeft -= rest;
      movesLeft -= 1;
      if (movesLeft <= 0) {
        periodLeft = period;
        movesLeft = tc.moves;
      }
      return { ...c, main, periodLeft, movesLeft };
    }
  }
}

/** 表示用: elapsed ミリ秒考えている途中の状態 */
export function display(tc: TimeControl, c: PlayerClock, elapsed: number): { text: string; sub: string; low: boolean } {
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
  };
  switch (tc.kind) {
    case 'none':
      return { text: '', sub: '', low: false };
    case 'sudden':
    case 'fischer': {
      const left = c.main - elapsed;
      return { text: fmt(left), sub: tc.kind === 'fischer' ? `+${tc.incSec}秒` : '', low: left < 10_000 };
    }
    case 'delay': {
      const delay = tc.delaySec * 1000;
      const used = Math.max(0, elapsed - delay);
      const left = c.main - used;
      return { text: fmt(left), sub: elapsed < delay ? `遅延 ${Math.ceil((delay - elapsed) / 1000)}秒` : '', low: left < 10_000 };
    }
    case 'byoyomi': {
      if (elapsed < c.main) return { text: fmt(c.main - elapsed), sub: `秒読み${tc.periodSec}秒×${c.periods}`, low: false };
      const period = tc.periodSec * 1000;
      const over = elapsed - c.main;
      const used = Math.floor(over / period);
      const inPeriod = period - (over - used * period);
      const left = c.periods - used;
      return { text: `${Math.max(0, Math.ceil(inPeriod / 1000))}秒`, sub: `秒読み 残り${Math.max(0, left)}回`, low: inPeriod < 10_000 };
    }
    case 'canadian': {
      if (c.main > 0 && elapsed < c.main) return { text: fmt(c.main - elapsed), sub: `${tc.moves}手/${fmt(tc.periodSec * 1000)}`, low: false };
      const periodLeft = c.main > 0 ? tc.periodSec * 1000 - (elapsed - c.main) : c.periodLeft - elapsed;
      const moves = c.main > 0 ? tc.moves : c.movesLeft;
      return { text: fmt(periodLeft), sub: `あと${moves}手`, low: periodLeft < 15_000 };
    }
  }
}

/**
 * CPU がこの手に使ってよい思考時間の目安（ミリ秒）。時計がなければ undefined。
 */
export function thinkBudget(tc: TimeControl, c: PlayerClock): number | undefined {
  switch (tc.kind) {
    case 'none':
      return undefined;
    case 'sudden':
      return c.main / 40;
    case 'fischer':
      return c.main / 30 + tc.incSec * 800;
    case 'delay':
      return c.main / 30 + tc.delaySec * 800;
    case 'byoyomi':
      return c.main > tc.periodSec * 3000 ? c.main / 25 : tc.periodSec * 600;
    case 'canadian':
      return c.main > 0 ? c.main / 25 : (c.periodLeft / Math.max(1, c.movesLeft)) * 0.7;
  }
}

/** 設定画面で使う既定値 */
export function defaultTimeControl(kind: TimeKind): TimeControl {
  switch (kind) {
    case 'none':
      return { kind };
    case 'sudden':
      return { kind, mainSec: 600 };
    case 'byoyomi':
      return { kind, mainSec: 600, periodSec: 30, periods: 1 };
    case 'fischer':
      return { kind, mainSec: 300, incSec: 5 };
    case 'canadian':
      return { kind, mainSec: 600, periodSec: 300, moves: 25 };
    case 'delay':
      return { kind, mainSec: 1800, delaySec: 5 };
  }
}

export const TIME_KIND_NAMES: Record<TimeKind, string> = {
  none: 'なし',
  sudden: '切れ負け',
  byoyomi: '秒読み',
  fischer: 'フィッシャー（1手ごとに加算）',
  canadian: 'カナダ式',
  delay: '遅延（ディレイ）',
};

export function describeTimeControl(tc: TimeControl): string {
  const min = (s: number) => (s % 60 === 0 ? `${s / 60}分` : `${s}秒`);
  switch (tc.kind) {
    case 'none':
      return '';
    case 'sudden':
      return `${min(tc.mainSec)}切れ負け`;
    case 'byoyomi':
      return `${tc.mainSec ? `${min(tc.mainSec)}・` : ''}秒読み${tc.periodSec}秒${tc.periods > 1 ? `×${tc.periods}回` : ''}`;
    case 'fischer':
      return `${min(tc.mainSec)}＋${tc.incSec}秒`;
    case 'canadian':
      return `${min(tc.mainSec)}・${tc.moves}手${min(tc.periodSec)}`;
    case 'delay':
      return `${min(tc.mainSec)}・遅延${tc.delaySec}秒`;
  }
}
