import { GameShell, Segmented, Select, useConfirmTap } from '../../components/GameShell';
import { IntersectionBoard, Stone } from '../../components/IntersectionBoard';
import { TIME_PRESETS } from '../../core/timePresets';
import { useGameSession } from '../../core/useGameSession';
import {
  DEFAULT_KOMI,
  go,
  isAreaScoring,
  isLegalPlay,
  maxHandicap,
  RULESET_NAMES,
  score,
  type GoMove,
  type GoOptions,
  type GoRuleset,
  type GoState,
} from './engine';

function starPoints(size: number): number[] {
  const at = (r: number, c: number) => r * size + c;
  if (size === 9) return [at(2, 2), at(2, 6), at(4, 4), at(6, 2), at(6, 6)];
  if (size === 13) return [at(3, 3), at(3, 9), at(6, 6), at(9, 3), at(9, 9)];
  const out: number[] = [];
  for (const r of [3, 9, 15]) for (const c of [3, 9, 15]) out.push(at(r, c));
  return out;
}

function handicapOptions(size: number, ruleset: GoRuleset): [string, string][] {
  const comp = (k: number) =>
    ruleset === 'chinese' ? `白に${k}目` : ruleset === 'aga' ? `白に${k - 1 + 0.5}目` : 'コミなし';
  const out: [string, string][] = [
    ['even', '互先（黒番・コミあり）'],
    ['sente', `定先（黒番・${ruleset === 'aga' ? '白に0.5目' : 'コミなし'}）`],
  ];
  for (let k = 2; k <= maxHandicap(size); k++) out.push([String(k), `${k}子局（置き碁・${comp(k)}）`]);
  return out;
}

const KOMI_CHOICES = [7.5, 6.5, 5.5, 0.5, 0];

export function GoGame({ onBack, onRules }: { onBack(): void; onRules(): void }) {
  const session = useGameSession<GoState, GoMove, GoOptions>('go', go, {
    mode: 'cpu',
    humanSide: 0,
    level: 2,
    time: { kind: 'none' },
    options: { size: 9, handicap: 'even', ruleset: 'japanese', komi: 6.5 },
  });
  const { state, canInput, play } = session;
  const { size } = state;
  const confirm = useConfirmTap(state);
  const scoring = state.phase !== 'play';
  const unit = isAreaScoring(state.ruleset) ? '点' : '目';
  const sc = scoring ? score(state) : null;
  const dead = new Set(state.dead);

  const onTap = (p: number) => {
    if (!canInput) return;
    if (state.phase === 'scoring') {
      if (state.board[p] !== 0) play({ t: 'toggle', p });
      return;
    }
    if (isLegalPlay(state, p) && confirm.tap(p)) play({ t: 'play', p });
  };

  return (
    <GameShell
      timePresets={TIME_PRESETS.go}
      title="囲碁"
      sideNames={['黒', '白']}
      turn={state.turn}
      session={session}
      onBack={onBack}
      onRules={onRules}
      renderOptions={(o, set) => (
        <>
          <fieldset>
            <legend>ルール</legend>
            <Segmented<GoRuleset>
              value={o.ruleset}
              options={(Object.keys(RULESET_NAMES) as GoRuleset[]).map((r) => [r, RULESET_NAMES[r]] as [GoRuleset, string])}
              onChange={(ruleset) => set({ ...o, ruleset, komi: DEFAULT_KOMI[ruleset] })}
            />
          </fieldset>
          <fieldset>
            <legend>盤の大きさ</legend>
            <Segmented
              value={String(o.size)}
              options={[
                ['9', '9路'],
                ['13', '13路'],
                ['19', '19路'],
              ]}
              onChange={(v) => {
                const size = Number(v);
                const handicap = typeof o.handicap === 'number' ? Math.min(o.handicap, maxHandicap(size)) : o.handicap;
                set({ ...o, size, handicap });
              }}
            />
          </fieldset>
          <fieldset>
            <legend>手合い（置き碁は白が先に打ちます）</legend>
            <Select
              value={String(o.handicap)}
              options={handicapOptions(o.size, o.ruleset)}
              onChange={(v) => set({ ...o, handicap: v === 'even' || v === 'sente' ? v : Number(v) })}
            />
          </fieldset>
          {o.handicap === 'even' && (
            <fieldset>
              <legend>コミ</legend>
              <Select
                value={String(o.komi)}
                options={KOMI_CHOICES.map((k) => [String(k), `${k}目${k === DEFAULT_KOMI[o.ruleset] ? '（このルールの標準）' : ''}`] as [string, string])}
                onChange={(v) => set({ ...o, komi: Number(v) })}
              />
            </fieldset>
          )}
        </>
      )}
    >
      {() => (
        <>
          <div className="scoreline">
            <span>{RULESET_NAMES[state.ruleset]}</span>
            {!isAreaScoring(state.ruleset) && (
              <span>
                アゲハマ 黒{state.captures[0]}・白{state.captures[1]}
              </span>
            )}
            <span>
              {state.handicap ? `${state.handicap}子局・` : ''}
              {state.komi ? `白に${state.komi}${unit}` : 'コミなし'}
            </span>
          </div>
          <IntersectionBoard size={size} stars={starPoints(size)} label="碁盤" onTap={canInput ? onTap : undefined}>
            {sc &&
              sc.territory.map((t, p) =>
                t ? (
                  <rect
                    key={`t${p}`}
                    x={(p % size) + 0.32}
                    y={Math.floor(p / size) + 0.32}
                    width={0.36}
                    height={0.36}
                    className={`terr terr-${t === 1 ? 'b' : 'w'}`}
                    pointerEvents="none"
                  />
                ) : null,
              )}
            {state.board.map((v, p) =>
              v ? <Stone key={p} p={p} size={size} color={v} last={p === state.last && !scoring} dim={dead.has(p)} /> : null,
            )}
            {confirm.pending >= 0 && !scoring && <Stone p={confirm.pending} size={size} color={state.turn + 1} ghost />}
          </IntersectionBoard>

          {state.phase === 'play' && (
            <>
              <p className="hint">
                {canInput ? (confirm.pending >= 0 ? 'もう一度タップで確定' : '置きたい場所をタップ') : ' '}
                {state.passes === 1 && ' ― 相手がパスしました'}
              </p>
              <div className="inline-actions">
                <button onClick={() => play({ t: 'pass' })} disabled={!canInput}>
                  パス
                </button>
              </div>
            </>
          )}

          {state.phase === 'scoring' && sc && (
            <>
              <p className="hint">
                死石の確認：石をタップすると生き／死にを切り替えられます。
                <br />
                現在 黒 {sc.black}
                {unit}・白 {sc.white}
                {unit}
              </p>
              <div className="inline-actions">
                <button onClick={() => play({ t: 'resume' })} disabled={!canInput}>
                  対局に戻る
                </button>
                <button className="primary" onClick={() => play({ t: 'done' })} disabled={!canInput}>
                  終局する
                </button>
              </div>
            </>
          )}
        </>
      )}
    </GameShell>
  );
}
