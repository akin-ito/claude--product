import { useState } from 'react';
import { GameShell, Segmented, Select, useConfirmTap } from '../../components/GameShell';
import { IntersectionBoard, Stone } from '../../components/IntersectionBoard';
import { TIME_PRESETS } from '../../core/timePresets';
import type { Player } from '../../core/types';
import { useGameSession } from '../../core/useGameSession';
import {
  canPropose,
  colorOfSeat,
  currentStep,
  gomoku,
  isForbidden,
  isLegal,
  nextColor,
  OPENING_NAMES,
  OPENINGS_FOR,
  placementArea,
  SIZE,
  type GomokuMove,
  type GomokuOptions,
  type GomokuRule,
  type GomokuState,
  type OpeningRule,
} from './engine';

const STARS = [3 * SIZE + 3, 3 * SIZE + 11, 7 * SIZE + 7, 11 * SIZE + 3, 11 * SIZE + 11];

export const GOMOKU_RULE_NAMES: Record<GomokuRule, string> = {
  free: '自由ルール',
  standard: '標準ルール',
  renju: '連珠',
};

const COLOR_NAME = { 1: '黒', 2: '白' } as const;

/** 石の近く（2 路以内）の空点だけを禁じ手の候補として調べる */
function forbiddenPoints(s: GomokuState): number[] {
  if (s.rule !== 'renju' || nextColor(s) !== 1 || s.winLine || currentStep(s)) return [];
  const out: number[] = [];
  for (let p = 0; p < SIZE * SIZE; p++) {
    if (s.board[p] !== 0) continue;
    const r = Math.floor(p / SIZE);
    const c = p % SIZE;
    let near = 0;
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && s.board[rr * SIZE + cc] === 1) near++;
      }
    if (near >= 2 && isForbidden(s.board, p)) out.push(p);
  }
  return out;
}

/** 開局の段階ごとの説明 */
function instruction(s: GomokuState, seatName: (p: Player) => string): string {
  const step = currentStep(s);
  const who = seatName(s.turn);
  if (!step) return '';
  switch (step.k) {
    case 'place': {
      const area = placementArea(s, s.moves + 1);
      const where = area ? `（中央の${area}×${area}の範囲）` : '';
      if (step.seat !== undefined) {
        return `${who}が${step.until}手目まで置きます。次は${s.moves + 1}手目の${COLOR_NAME[nextColor(s)]}${where}`;
      }
      return `${who}が${s.moves + 1}手目（${COLOR_NAME[nextColor(s)]}）を置きます${where}`;
    }
    case 'swap':
      return `${who}は、色を交替するか決めます`;
    case 'color':
      return `${who}は、黒と白のどちらを持つか選びます`;
    case 'swap2':
      return `${who}は、黒を持つ・白を持つ・さらに2子置いて相手に選ばせる、のどれかを選びます`;
    case 'declare':
      return `${who}は、5手目の提示数を宣言します（1〜${step.max}）`;
    case 'propose':
      return `${who}（黒）は5手目の候補を${s.fifthCount}か所示します（${s.proposals.length}/${s.fifthCount}）。対称な位置は選べません`;
    case 'select':
      return `${who}（白）は、示された5手目から1つを選びます`;
    case 'tchoice':
      return `${who}（黒）は、5手目を中央9×9に1つ打つか、10か所示すかを選びます`;
  }
}

export function GomokuGame({ onBack, onRules }: { onBack(): void; onRules(): void }) {
  const session = useGameSession<GomokuState, GomokuMove, GomokuOptions>('gomoku', gomoku, {
    mode: 'cpu',
    humanSide: 0,
    level: 2,
    time: { kind: 'none' },
    options: { rule: 'free', opening: 'none' },
  });
  const { state, canInput, play, settings } = session;
  const confirm = useConfirmTap(state);
  const [declareN, setDeclareN] = useState(2);
  const win = new Set(state.winLine ?? []);
  const step = currentStep(state);
  const forbidden = canInput ? forbiddenPoints(state) : [];
  const usesSeats = state.opening !== 'none';

  // 開局規定があると席と色が入れ替わるので、席の名前に今の色を添える
  const seatLabel = (p: Player) => (p === 0 ? 'プレイヤー1' : 'プレイヤー2');
  const sideNames: [string, string] = usesSeats
    ? [0, 1].map((p) => `${seatLabel(p as Player)}・${COLOR_NAME[colorOfSeat(state, p as Player)]}`) as [string, string]
    : ['黒', '白'];
  const seatName = (p: Player) =>
    settings.mode === 'cpu' ? (p === settings.humanSide ? 'あなた' : 'CPU') : seatLabel(p);

  const onTap = (p: number) => {
    if (!canInput) return;
    if (step?.k === 'propose') {
      if (canPropose(state, p) && confirm.tap(p)) play({ t: 'propose', p });
      return;
    }
    if (step?.k === 'select') {
      if (state.proposals.includes(p) && confirm.tap(p)) play({ t: 'select', p });
      return;
    }
    if (isLegal(state, p) && confirm.tap(p)) play(p);
  };

  const area = step?.k === 'place' ? placementArea(state, state.moves + 1) : undefined;
  const half = area ? area / 2 : 0;
  const center = SIZE / 2;
  const pendingColor = step?.k === 'propose' || step?.k === 'select' ? 1 : nextColor(state);

  return (
    <GameShell
      timePresets={TIME_PRESETS.gomoku}
      title="五目並べ"
      sideNames={sideNames}
      seatNames={['プレイヤー1（最初に打つ側）', 'プレイヤー2']}
      turnColor={usesSeats ? (colorOfSeat(state, state.turn) === 1 ? 'black' : 'white') : undefined}
      turn={state.turn}
      session={session}
      onBack={onBack}
      onRules={onRules}
      renderOptions={(o, set) => (
        <>
          <fieldset>
            <legend>ルール</legend>
            <Segmented<GomokuRule>
              value={o.rule}
              options={[
                ['free', GOMOKU_RULE_NAMES.free],
                ['standard', GOMOKU_RULE_NAMES.standard],
                ['renju', GOMOKU_RULE_NAMES.renju],
              ]}
              onChange={(rule) => set({ rule, opening: OPENINGS_FOR[rule].includes(o.opening) ? o.opening : 'none' })}
            />
          </fieldset>
          <fieldset>
            <legend>開局規定</legend>
            <Select<OpeningRule>
              value={o.opening}
              options={OPENINGS_FOR[o.rule].map((r) => [r, OPENING_NAMES[r]] as [OpeningRule, string])}
              onChange={(opening) => set({ ...o, opening })}
            />
          </fieldset>
        </>
      )}
    >
      {() => (
        <>
          <div className="scoreline">
            <span>{GOMOKU_RULE_NAMES[state.rule]}</span>
            {state.opening !== 'none' && <span>{OPENING_NAMES[state.opening]}</span>}
            {state.rule === 'renju' && <span>× は黒の禁じ手</span>}
          </div>
          <IntersectionBoard size={SIZE} stars={STARS} label="五目並べの盤" onTap={canInput ? onTap : undefined}>
            {area && (
              <rect
                x={center - half}
                y={center - half}
                width={area}
                height={area}
                className="area-box"
                pointerEvents="none"
              />
            )}
            {state.board.map((v, p) =>
              v ? <Stone key={p} p={p} size={SIZE} color={v} last={p === state.last} dim={win.size > 0 && !win.has(p)} /> : null,
            )}
            {state.proposals.map((p, i) => (
              <g key={`pr${p}`} pointerEvents="none">
                <Stone p={p} size={SIZE} color={1} ghost />
                <text x={(p % SIZE) + 0.5} y={Math.floor(p / SIZE) + 0.52} className="proposal-label">
                  {i + 1}
                </text>
              </g>
            ))}
            {forbidden.map((p) => {
              const x = (p % SIZE) + 0.5;
              const y = Math.floor(p / SIZE) + 0.5;
              return (
                <g key={`f${p}`} className="forbid" pointerEvents="none">
                  <line x1={x - 0.22} y1={y - 0.22} x2={x + 0.22} y2={y + 0.22} />
                  <line x1={x - 0.22} y1={y + 0.22} x2={x + 0.22} y2={y - 0.22} />
                </g>
              );
            })}
            {confirm.pending >= 0 && <Stone p={confirm.pending} size={SIZE} color={pendingColor} ghost />}
          </IntersectionBoard>

          {step && <p className="hint opening-hint">{instruction(state, seatName)}</p>}

          {canInput && step?.k === 'swap' && (
            <div className="inline-actions">
              <button onClick={() => play({ t: 'swap', swap: false })}>
                {COLOR_NAME[colorOfSeat(state, state.turn)]}のまま
              </button>
              <button className="primary" onClick={() => play({ t: 'swap', swap: true })}>
                交替して{COLOR_NAME[colorOfSeat(state, state.turn) === 1 ? 2 : 1]}を持つ
              </button>
            </div>
          )}
          {canInput && step?.k === 'color' && (
            <div className="inline-actions">
              <button onClick={() => play({ t: 'color', color: 'black' })}>黒を持つ</button>
              <button onClick={() => play({ t: 'color', color: 'white' })}>白を持つ</button>
            </div>
          )}
          {canInput && step?.k === 'swap2' && (
            <div className="inline-actions">
              <button onClick={() => play({ t: 'swap2', choice: 'black' })}>黒を持つ</button>
              <button onClick={() => play({ t: 'swap2', choice: 'white' })}>白を持つ</button>
              <button onClick={() => play({ t: 'swap2', choice: 'more' })}>2子追加</button>
            </div>
          )}
          {canInput && step?.k === 'declare' && (
            <div className="inline-actions">
              <Select
                value={String(declareN)}
                options={Array.from({ length: step.max }, (_, i) => [String(i + 1), `${i + 1}か所`] as [string, string])}
                onChange={(v) => setDeclareN(Number(v))}
              />
              <button className="primary" onClick={() => play({ t: 'declare', n: Math.min(declareN, step.max) })}>
                宣言する
              </button>
            </div>
          )}
          {canInput && step?.k === 'tchoice' && (
            <div className="inline-actions">
              <button onClick={() => play({ t: 'tchoice', mode: 'one' })}>9×9内に1手打つ</button>
              <button onClick={() => play({ t: 'tchoice', mode: 'ten' })}>10か所示す</button>
            </div>
          )}

          <p className="hint">
            {canInput && (step === null || ['place', 'propose', 'select'].includes(step.k))
              ? confirm.pending >= 0
                ? 'もう一度タップで確定'
                : step?.k === 'select'
                  ? '選ぶ候補をタップ'
                  : '置きたい場所をタップ'
              : ' '}
          </p>
        </>
      )}
    </GameShell>
  );
}
