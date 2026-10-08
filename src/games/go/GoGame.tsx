import { GameShell, Segmented, useConfirmTap } from '../../components/GameShell';
import { IntersectionBoard, Stone } from '../../components/IntersectionBoard';
import { useGameSession } from '../../core/useGameSession';
import { go, isLegalPlay, score, type GoMove, type GoOptions, type GoState } from './engine';

function starPoints(size: number): number[] {
  const at = (r: number, c: number) => r * size + c;
  if (size === 9) return [at(2, 2), at(2, 6), at(4, 4), at(6, 2), at(6, 6)];
  if (size === 13) return [at(3, 3), at(3, 9), at(6, 6), at(9, 3), at(9, 9)];
  const out: number[] = [];
  for (const r of [3, 9, 15]) for (const c of [3, 9, 15]) out.push(at(r, c));
  return out;
}

export function GoGame({ onBack }: { onBack(): void }) {
  const session = useGameSession<GoState, GoMove, GoOptions>('go', go, {
    mode: 'cpu',
    humanSide: 0,
    level: 2,
    options: { size: 9 },
  });
  const { state, canInput, play } = session;
  const { size } = state;
  const confirm = useConfirmTap(state);
  const scoring = state.phase !== 'play';
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
      title="囲碁"
      sideNames={['黒', '白']}
      turn={state.turn}
      session={session}
      onBack={onBack}
      renderOptions={(o, set) => (
        <fieldset>
          <legend>盤の大きさ</legend>
          <Segmented
            value={String(o.size)}
            options={[
              ['9', '9路'],
              ['13', '13路'],
              ['19', '19路'],
            ]}
            onChange={(v) => set({ ...o, size: Number(v) })}
          />
        </fieldset>
      )}
    >
      {() => (
        <>
          <div className="scoreline">
            <span>黒アゲハマ {state.captures[0]}</span>
            <span>白アゲハマ {state.captures[1]}</span>
            <span>コミ {state.komi}</span>
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
                現在 黒 {sc.black}目・白 {sc.white}目
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
