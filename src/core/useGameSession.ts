import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestAiMove } from './aiClient';
import { initClock, spend, thinkBudget, timeToFlag, type ClockState, type TimeControl } from './clock';
import type { GameEngine, Level, Outcome, Player } from './types';

export interface Settings<O> {
  mode: 'pvp' | 'cpu';
  /** CPU 対戦で人間が持つ手番（席） */
  humanSide: Player;
  level: Level;
  /** 持ち時間 */
  time: TimeControl;
  options: O;
}

interface Session<S, O> {
  settings: Settings<O>;
  history: S[];
  /** history と同じ長さ。各局面の時点での両者の時計 */
  clocks: ClockState[];
  resigned: Player | null;
  /** 時間切れになった席 */
  flagged: Player | null;
}

/** 保存形式を変えたら上げる。古い保存データは読み捨てる */
const STORAGE_VERSION = 3;

function load<S, O>(key: string): Session<S, O> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.v === STORAGE_VERSION ? data.session : null;
  } catch {
    return null;
  }
}

function save(key: string, session: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ v: STORAGE_VERSION, session }));
  } catch {
    // 保存できなくても遊べるので無視する
  }
}

/** CPU の手が一瞬で出ると分かりにくいので、最低限待つ時間 */
const MIN_THINK_MS = 350;

function fresh<S, O>(engine: GameEngine<S, unknown, O>, settings: Settings<O>): Session<S, O> {
  return {
    settings,
    history: [engine.initial(settings.options)],
    clocks: [initClock(settings.time)],
    resigned: null,
    flagged: null,
  };
}

/**
 * 今の手番で考えている時間を測る。画面が隠れている間（アプリを閉じた・画面が消えた）は止める。
 */
function useTurnTimer(turnKey: unknown, running: boolean) {
  const acc = useRef(0);
  const since = useRef<number | null>(null);
  const lastKey = useRef(turnKey);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 手番が変わったら測り直す
  if (lastKey.current !== turnKey) {
    lastKey.current = turnKey;
    acc.current = 0;
    since.current = null;
  }
  const active = running && visible;
  if (active && since.current === null) since.current = Date.now();
  if (!active && since.current !== null) {
    acc.current += Date.now() - since.current;
    since.current = null;
  }
  const elapsed = useCallback(() => acc.current + (since.current !== null ? Date.now() - since.current : 0), []);
  return { elapsed, active };
}

export function useGameSession<S, M, O>(gameId: string, engine: GameEngine<S, M, O>, defaults: Settings<O>) {
  const storageKey = `board-game-box:${gameId}`;
  const [session, setSession] = useState<Session<S, O>>(() => load<S, O>(storageKey) ?? fresh(engine, defaults));

  useEffect(() => save(storageKey, session), [storageKey, session]);

  const { settings, history, resigned, flagged } = session;
  const state = history[history.length - 1];
  const clock = session.clocks[session.clocks.length - 1];
  const tc = settings.time;

  const outcome: Outcome | null = useMemo(() => {
    if (resigned !== null) return { winner: resigned === 0 ? 1 : 0, reason: '投了' };
    if (flagged !== null) return engine.timeoutOutcome?.(state, flagged) ?? { winner: flagged === 0 ? 1 : 0, reason: '時間切れ' };
    return engine.outcome(state);
  }, [engine, state, resigned, flagged]);

  const actor = engine.turn(state);
  const clockRunning = tc.kind !== 'none' && !outcome && (engine.clockRunning?.(state) ?? true);
  const timer = useTurnTimer(state, clockRunning);

  // 時間切れの判定
  useEffect(() => {
    if (!timer.active) return;
    const left = timeToFlag(tc, clock[actor]) - timer.elapsed();
    const id = setTimeout(
      () => setSession((cur) => (cur.history[cur.history.length - 1] === state ? { ...cur, flagged: actor } : cur)),
      Math.max(0, left + 50),
    );
    return () => clearTimeout(id);
  }, [timer, tc, clock, actor, state]);

  /** 手を適用する（時計も進める）。時間切れなら手は指されない */
  const commit = useCallback(
    (cur: Session<S, O>, m: M, elapsed: number): Session<S, O> => {
      const prev = cur.history[cur.history.length - 1];
      const prevClock = cur.clocks[cur.clocks.length - 1];
      let nextClock = prevClock;
      if (cur.settings.time.kind !== 'none' && (engine.clockRunning?.(prev) ?? true)) {
        const mover = engine.turn(prev);
        const spent = spend(cur.settings.time, prevClock[mover], elapsed);
        if (!spent) return { ...cur, flagged: mover };
        nextClock = mover === 0 ? [spent, prevClock[1]] : [prevClock[0], spent];
      }
      return { ...cur, history: [...cur.history, engine.apply(prev, m)], clocks: [...cur.clocks, nextClock] };
    },
    [engine],
  );

  const cpuToMove =
    settings.mode === 'cpu' && !outcome && actor !== settings.humanSide && (engine.cpuCanAct?.(state) ?? true);

  useEffect(() => {
    if (!cpuToMove) return;
    const budget = thinkBudget(tc, clock[actor]);
    const req = requestAiMove<M>(gameId, state, settings.level, budget);
    const started = Date.now();
    let t: ReturnType<typeof setTimeout> | undefined;
    req.promise.then(
      (move) => {
        t = setTimeout(
          () => {
            const elapsed = timer.elapsed();
            setSession((cur) => (cur.history[cur.history.length - 1] === state ? commit(cur, move, elapsed) : cur));
          },
          Math.max(0, MIN_THINK_MS - (Date.now() - started)),
        );
      },
      () => {},
    );
    return () => {
      req.cancel();
      clearTimeout(t);
    };
    // 時計の値が変わるたびに考え直さないよう、局面と設定だけに反応させる
  }, [cpuToMove, gameId, engine, state, settings.level]);

  const canInput = !outcome && !cpuToMove;

  const play = useCallback(
    (m: M) => {
      if (!canInput) return;
      const elapsed = timer.elapsed();
      setSession((cur) => commit(cur, m, elapsed));
    },
    [canInput, commit, timer],
  );

  const undo = useCallback(() => {
    setSession((cur) => {
      if (cur.resigned !== null || cur.flagged !== null) return { ...cur, resigned: null, flagged: null };
      if (cur.history.length <= 1) return cur;
      let n = cur.history.length - 1;
      // CPU 対戦では自分の手番まで戻す
      if (cur.settings.mode === 'cpu') {
        while (n > 1 && engine.turn(cur.history[n - 1]) !== cur.settings.humanSide) n--;
      }
      return { ...cur, history: cur.history.slice(0, n), clocks: cur.clocks.slice(0, n) };
    });
  }, [engine]);

  const newGame = useCallback((next: Settings<O>) => setSession(fresh(engine, next)), [engine]);

  const resign = useCallback(() => {
    setSession((cur) => {
      const s = cur.history[cur.history.length - 1];
      const loser = cur.settings.mode === 'cpu' ? cur.settings.humanSide : engine.turn(s);
      return { ...cur, resigned: loser };
    });
  }, [engine]);

  const canUndo =
    resigned !== null ||
    flagged !== null ||
    (settings.mode === 'cpu'
      ? history.slice(0, -1).some((s) => engine.turn(s) === settings.humanSide)
      : history.length > 1);

  return {
    state,
    settings,
    outcome,
    thinking: cpuToMove,
    canInput,
    canUndo,
    play,
    undo,
    newGame,
    resign,
    clock,
    actor,
    clockRunning: timer.active,
    elapsed: timer.elapsed,
  };
}

export type GameSession<S, M, O> = ReturnType<typeof useGameSession<S, M, O>>;
