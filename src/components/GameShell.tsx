import { useEffect, useState, type ReactNode } from 'react';
import {
  defaultTimeControl,
  describeTimeControl,
  display,
  TIME_KIND_NAMES,
  type ClockState,
  type TimeControl,
  type TimeKind,
} from '../core/clock';
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
  clock: ClockState;
  actor: Player;
  clockRunning: boolean;
  elapsed(): number;
}

/** よく使われる持ち時間の設定 */
export interface TimePreset {
  name: string;
  time: TimeControl;
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
  /** 手番の丸の色（指定がなければ席 0 = 黒） */
  turnColor?: 'black' | 'white';
  /** 設定画面で「あなたの手番」に表示する席の名前（指定がなければ sideNames） */
  seatNames?: [string, string];
  /** 持ち時間のプリセット */
  timePresets?: TimePreset[];
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
  turnColor,
  seatNames,
  timePresets = [],
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

  const timeLabel = describeTimeControl(settings.time);
  const modeLabel = [settings.mode === 'cpu' ? `CPU対戦・${LEVEL_NAMES[settings.level]}` : '2人対戦', timeLabel]
    .filter(Boolean)
    .join('・');
  const dot = turnColor ? (turnColor === 'black' ? 0 : 1) : turn;

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
        {!outcome && <span className={`turn-dot ${turnColor ? `dot-${turnColor}` : `turn-${dot}`}`} aria-hidden />}
        {thinking && <span className="spinner" aria-hidden />}
        <span>{status}</span>
      </div>

      {settings.time.kind !== 'none' && (
        <ClockBar session={session} names={sideNames} flipped={flipped} humanSide={settings.mode === 'cpu' ? settings.humanSide : null} />
      )}

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
          sideNames={seatNames ?? sideNames}
          timePresets={timePresets}
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

/** 両者の残り時間。手番側を強調し、考えている間は毎秒更新する */
function ClockBar<O>({
  session,
  names,
  flipped,
  humanSide,
}: {
  session: ShellSession<O>;
  names: [string, string];
  flipped: boolean;
  humanSide: Player | null;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!session.clockRunning) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [session.clockRunning]);
  const order: Player[] = flipped ? [0, 1] : [1, 0];
  return (
    <div className="clockbar">
      {order.map((p) => {
        const active = !session.outcome && session.actor === p;
        const d = display(session.settings.time, session.clock[p], active && session.clockRunning ? session.elapsed() : 0);
        return (
          <div key={p} className={`clock${active ? ' active' : ''}${d.low && active ? ' low' : ''}`}>
            <span className="clock-name">
              {names[p]}
              {humanSide !== null && (p === humanSide ? '（あなた）' : '（CPU）')}
            </span>
            <span className="clock-time">{d.text}</span>
            {d.sub && <span className="clock-sub">{d.sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

function TimeSettings({ value, presets, onChange }: { value: TimeControl; presets: TimePreset[]; onChange(t: TimeControl): void }) {
  const num = (label: string, key: string, unit: 'min' | 'sec' | 'count', min = 0) => {
    const raw = (value as unknown as Record<string, number>)[key];
    const shown = unit === 'min' ? raw / 60 : raw;
    const id = `time-${key}`;
    return (
      <label className="num-field" htmlFor={id}>
        <span>{label}</span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          value={shown}
          onChange={(e) => {
            const n = Math.max(min, Number(e.target.value) || 0);
            onChange({ ...value, [key]: unit === 'min' ? Math.round(n * 60) : n } as TimeControl);
          }}
        />
        <span className="unit">{unit === 'min' ? '分' : unit === 'sec' ? '秒' : unit === 'count' && key === 'moves' ? '手' : '回'}</span>
      </label>
    );
  };
  const presetIndex = presets.findIndex((p) => JSON.stringify(p.time) === JSON.stringify(value));
  return (
    <fieldset>
      <legend>持ち時間</legend>
      {presets.length > 0 && (
        <Select
          value={presetIndex >= 0 ? String(presetIndex) : 'custom'}
          options={[
            ...presets.map((p, i) => [String(i), p.name] as [string, string]),
            ['custom', 'カスタム（下で設定）'] as [string, string],
          ]}
          onChange={(v) => v !== 'custom' && onChange(presets[Number(v)].time)}
        />
      )}
      <div className="time-detail">
        <Select
          value={value.kind}
          options={(Object.keys(TIME_KIND_NAMES) as TimeKind[]).map((k) => [k, TIME_KIND_NAMES[k]] as [TimeKind, string])}
          onChange={(k) => onChange(defaultTimeControl(k))}
        />
        {value.kind !== 'none' && (
          <div className="num-row">
            {num('持ち時間', 'mainSec', 'min')}
            {value.kind === 'byoyomi' && num('秒読み', 'periodSec', 'sec', 1)}
            {value.kind === 'byoyomi' && num('回数', 'periods', 'count', 1)}
            {value.kind === 'fischer' && num('1手ごとに加算', 'incSec', 'sec')}
            {value.kind === 'canadian' && num('区切り', 'periodSec', 'sec', 1)}
            {value.kind === 'canadian' && num('手数', 'moves', 'count', 1)}
            {value.kind === 'delay' && num('遅延', 'delaySec', 'sec')}
          </div>
        )}
      </div>
    </fieldset>
  );
}

function SettingsSheet<O>({
  initial,
  sideNames,
  timePresets,
  renderOptions,
  onCancel,
  onStart,
}: {
  initial: Settings<O>;
  sideNames: [string, string];
  timePresets: TimePreset[];
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

        <TimeSettings value={s.time} presets={timePresets} onChange={(time) => setS({ ...s, time })} />

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
