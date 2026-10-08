import { useState, type ReactNode } from 'react';
import type { Settings } from '../core/useGameSession';
import type { Level, Outcome, Player } from '../core/types';

const LEVEL_NAMES: Record<Level, string> = { 1: '弱い', 2: '普通', 3: '強い' };

export interface ShellSession<O> {
  settings: Settings<O>;
  outcome: Outcome | null;
  thinking: boolean;
  canUndo: boolean;
  undo(): void;
  resign(): void;
  newGame(s: Settings<O>): void;
}

interface Props<O> {
  title: string;
  /** 手番の呼び名（例: ['先手', '後手']） */
  sideNames: [string, string];
  turn: Player;
  session: ShellSession<O>;
  /** 盤面反転ボタンを出すか */
  flippable?: boolean;
  /** 先手が白（チェス） */
  whiteFirst?: boolean;
  /** 新規対局の設定に、ゲーム固有の項目を足す */
  renderOptions?: (options: O, set: (o: O) => void) => ReactNode;
  onBack(): void;
  /** ルール説明を開く */
  onRules(): void;
  children: (view: { flipped: boolean }) => ReactNode;
}

export function GameShell<O>({
  title,
  sideNames,
  turn,
  session,
  flippable,
  whiteFirst,
  renderOptions,
  onBack,
  onRules,
  children,
}: Props<O>) {
  const { settings, outcome, thinking } = session;
  const [showSettings, setShowSettings] = useState(false);
  const [manualFlip, setManualFlip] = useState(false);
  const autoFlip = settings.mode === 'cpu' && settings.humanSide === 1;
  const flipped = flippable ? autoFlip !== manualFlip : false;

  const who = (p: Player) => {
    if (settings.mode !== 'cpu') return sideNames[p];
    return `${sideNames[p]}（${p === settings.humanSide ? 'あなた' : 'CPU'}）`;
  };

  let status: string;
  let tone: 'normal' | 'win' | 'lose' | 'draw' = 'normal';
  if (outcome) {
    if (outcome.winner === null) {
      status = `引き分け ― ${outcome.reason}`;
      tone = 'draw';
    } else {
      status = `${who(outcome.winner)}の勝ち ― ${outcome.reason}`;
      if (settings.mode === 'cpu') tone = outcome.winner === settings.humanSide ? 'win' : 'lose';
      else tone = 'win';
    }
  } else if (thinking) {
    status = 'CPU が考えています…';
  } else {
    status = `${who(turn)}の番`;
  }

  const modeLabel = settings.mode === 'cpu' ? `CPU対戦・${LEVEL_NAMES[settings.level]}` : '2人対戦';

  return (
    <div className={`game${whiteFirst ? ' white-first' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="ゲーム一覧に戻る">
          ‹
        </button>
        <div className="topbar-title">
          <h1>{title}</h1>
          <span className="mode">{modeLabel}</span>
        </div>
        <button className="icon-btn small" onClick={onRules} aria-label="ルール">
          ？
        </button>
      </header>

      <div className={`status status-${tone}`} role="status">
        {!outcome && <span className={`turn-dot turn-${turn}`} aria-hidden />}
        {thinking && <span className="spinner" aria-hidden />}
        <span>{status}</span>
      </div>

      <main className="board-area">{children({ flipped })}</main>

      <footer className="controls">
        <button onClick={session.undo} disabled={!session.canUndo}>
          待った
        </button>
        {flippable && <button onClick={() => setManualFlip((f) => !f)}>反転</button>}
        <button onClick={session.resign} disabled={!!outcome || (settings.mode === 'cpu' && thinking)}>
          投了
        </button>
        <button className="primary" onClick={() => setShowSettings(true)}>
          新しい対局
        </button>
      </footer>

      {showSettings && (
        <SettingsSheet
          initial={settings}
          sideNames={sideNames}
          renderOptions={renderOptions}
          onCancel={() => setShowSettings(false)}
          onStart={(s) => {
            session.newGame(s);
            setManualFlip(false);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

function SettingsSheet<O>({
  initial,
  sideNames,
  renderOptions,
  onCancel,
  onStart,
}: {
  initial: Settings<O>;
  sideNames: [string, string];
  renderOptions?: (options: O, set: (o: O) => void) => ReactNode;
  onCancel(): void;
  onStart(s: Settings<O>): void;
}) {
  const [s, setS] = useState(initial);
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-label="新しい対局" onClick={(e) => e.stopPropagation()}>
        <h2>新しい対局</h2>

        <fieldset>
          <legend>対戦相手</legend>
          <Segmented
            value={s.mode}
            options={[
              ['pvp', '2人で対戦'],
              ['cpu', 'CPUと対戦'],
            ]}
            onChange={(mode) => setS({ ...s, mode })}
          />
        </fieldset>

        {s.mode === 'cpu' && (
          <>
            <fieldset>
              <legend>あなたの手番</legend>
              <Segmented
                value={String(s.humanSide)}
                options={[
                  ['0', `${sideNames[0]}`],
                  ['1', `${sideNames[1]}`],
                ]}
                onChange={(v) => setS({ ...s, humanSide: Number(v) as Player })}
              />
            </fieldset>
            <fieldset>
              <legend>CPUの強さ</legend>
              <Segmented
                value={String(s.level)}
                options={[
                  ['1', LEVEL_NAMES[1]],
                  ['2', LEVEL_NAMES[2]],
                  ['3', LEVEL_NAMES[3]],
                ]}
                onChange={(v) => setS({ ...s, level: Number(v) as Level })}
              />
            </fieldset>
          </>
        )}

        {renderOptions?.(s.options, (options) => setS({ ...s, options }))}

        <div className="sheet-actions">
          <button onClick={onCancel}>キャンセル</button>
          <button className="primary" onClick={() => onStart(s)}>
            はじめる
          </button>
        </div>
      </div>
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange(v: T): void;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange(v: T): void;
}) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)} aria-pressed={v === value}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** 2 回タップで確定する着手（スマホでの誤タップ防止） */
export function useConfirmTap(resetKey: unknown) {
  const [pending, setPending] = useState<{ key: unknown; p: number } | null>(null);
  const current = pending && pending.key === resetKey ? pending.p : -1;
  return {
    pending: current,
    /** 確定したら true */
    tap(p: number): boolean {
      if (current === p) {
        setPending(null);
        return true;
      }
      setPending({ key: resetKey, p });
      return false;
    },
  };
}
