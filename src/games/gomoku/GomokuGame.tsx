import { GameShell, Segmented, useConfirmTap } from '../../components/GameShell';
import { IntersectionBoard, Stone } from '../../components/IntersectionBoard';
import { useGameSession } from '../../core/useGameSession';
import { gomoku, isForbidden, isLegal, SIZE, type GomokuMove, type GomokuOptions, type GomokuRule, type GomokuState } from './engine';

const STARS = [3 * SIZE + 3, 3 * SIZE + 11, 7 * SIZE + 7, 11 * SIZE + 3, 11 * SIZE + 11];

export const GOMOKU_RULE_NAMES: Record<GomokuRule, string> = {
  free: '自由ルール',
  standard: '標準ルール',
  renju: '連珠',
};

/** 石の近く（2 路以内）の空点だけを禁じ手の候補として調べる */
function forbiddenPoints(s: GomokuState): number[] {
  if (s.rule !== 'renju' || s.turn !== 0 || s.winLine) return [];
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

export function GomokuGame({ onBack, onRules }: { onBack(): void; onRules(): void }) {
  const session = useGameSession<GomokuState, GomokuMove, GomokuOptions>('gomoku', gomoku, {
    mode: 'cpu',
    humanSide: 0,
    level: 2,
    options: { rule: 'free' },
  });
  const { state, canInput, play } = session;
  const confirm = useConfirmTap(state);
  const win = new Set(state.winLine ?? []);
  const forbidden = canInput ? forbiddenPoints(state) : [];

  return (
    <GameShell
      title="五目並べ"
      sideNames={['黒', '白']}
      turn={state.turn}
      session={session}
      onBack={onBack}
      onRules={onRules}
      renderOptions={(o, set) => (
        <fieldset>
          <legend>ルール</legend>
          <Segmented
            value={o.rule}
            options={[
              ['free', GOMOKU_RULE_NAMES.free],
              ['standard', GOMOKU_RULE_NAMES.standard],
              ['renju', GOMOKU_RULE_NAMES.renju],
            ]}
            onChange={(rule) => set({ ...o, rule })}
          />
        </fieldset>
      )}
    >
      {() => (
        <>
          <div className="scoreline">
            <span>{GOMOKU_RULE_NAMES[state.rule]}</span>
            {state.rule === 'renju' && <span>× は黒の禁じ手</span>}
          </div>
          <IntersectionBoard
            size={SIZE}
            stars={STARS}
            label="五目並べの盤"
            onTap={
              canInput
                ? (p) => {
                    if (isLegal(state, p) && confirm.tap(p)) play(p);
                  }
                : undefined
            }
          >
            {state.board.map((v, p) =>
              v ? <Stone key={p} p={p} size={SIZE} color={v} last={p === state.last} dim={win.size > 0 && !win.has(p)} /> : null,
            )}
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
            {confirm.pending >= 0 && <Stone p={confirm.pending} size={SIZE} color={state.turn + 1} ghost />}
          </IntersectionBoard>
          <p className="hint">{canInput ? (confirm.pending >= 0 ? 'もう一度タップで確定' : '置きたい場所をタップ') : ' '}</p>
        </>
      )}
    </GameShell>
  );
}
