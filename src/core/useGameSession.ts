import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestAiMove } from './aiClient';
import type { GameEngine, Level, Outcome, Player } from './types';

export interface Settings<O> {
  mode: 'pvp' | 'cpu';
  /** CPU 対戦で人間が持つ手番 */
  humanSide: Player;
  level: Level;
  options: O;
}

interface Session<S, O> {
  settings: Settings<O>;
  history: S[];
  resigned: Player | null;
}

/** 保存形式を変えたら上げる。古い保存データは読み捨てる */
const STORAGE_VERSION = 2;

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

export function useGameSession<S, M, O>(gameId: string, engine: GameEngine<S, M, O>, defaults: Settings<O>) {
  const storageKey = `board-game-box:${gameId}`;
  const [session, setSession] = useState<Session<S, O>>(
    () =>
      load<S, O>(storageKey) ?? {
        settings: defaults,
        history: [engine.initial(defaults.options)],
        resigned: null,
      },
  );

  useEffect(() => save(storageKey, session), [storageKey, session]);

  const { settings, history, resigned } = session;
  const state = history[history.length - 1];
  const outcome: Outcome | null = useMemo(() => {
    if (resigned !== null) return { winner: resigned === 0 ? 1 : 0, reason: '投了' };
    return engine.outcome(state);
  }, [engine, state, resigned]);

  const cpuToMove =
    settings.mode === 'cpu' &&
    !outcome &&
    engine.turn(state) !== settings.humanSide &&
    (engine.cpuCanAct?.(state) ?? true);

  useEffect(() => {
    if (!cpuToMove) return;
    const req = requestAiMove<M>(gameId, state, settings.level);
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    req.promise.then(
      (move) => {
        timer = setTimeout(
          () => {
            setSession((cur) =>
              cur.history[cur.history.length - 1] === state
                ? { ...cur, history: [...cur.history, engine.apply(state, move)] }
                : cur,
            );
          },
          Math.max(0, MIN_THINK_MS - (Date.now() - started)),
        );
      },
      () => {},
    );
    return () => {
      req.cancel();
      clearTimeout(timer);
    };
  }, [cpuToMove, gameId, engine, state, settings.level]);

  const canInput = !outcome && !cpuToMove;

  const play = useCallback(
    (m: M) => {
      if (!canInput) return;
      setSession((cur) => ({ ...cur, history: [...cur.history, engine.apply(cur.history[cur.history.length - 1], m)] }));
    },
    [canInput, engine],
  );

  const undo = useCallback(() => {
    setSession((cur) => {
      if (cur.resigned !== null) return { ...cur, resigned: null };
      if (cur.history.length <= 1) return cur;
      let h = cur.history.slice(0, -1);
      // CPU 対戦では自分の手番まで戻す
      if (cur.settings.mode === 'cpu') {
        while (h.length > 1 && engine.turn(h[h.length - 1]) !== cur.settings.humanSide) h = h.slice(0, -1);
      }
      return { ...cur, history: h };
    });
  }, [engine]);

  const newGame = useCallback(
    (next: Settings<O>) => {
      setSession({ settings: next, history: [engine.initial(next.options)], resigned: null });
    },
    [engine],
  );

  const resign = useCallback(() => {
    setSession((cur) => {
      const s = cur.history[cur.history.length - 1];
      const loser = cur.settings.mode === 'cpu' ? cur.settings.humanSide : engine.turn(s);
      return { ...cur, resigned: loser };
    });
  }, [engine]);

  const canUndo =
    resigned !== null ||
    (settings.mode === 'cpu'
      ? history.slice(0, -1).some((s) => engine.turn(s) === settings.humanSide)
      : history.length > 1);

  return { state, settings, outcome, thinking: cpuToMove, canInput, canUndo, play, undo, newGame, resign };
}

export type GameSession<S, M, O> = ReturnType<typeof useGameSession<S, M, O>>;
