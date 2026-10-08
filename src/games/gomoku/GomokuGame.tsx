import { GameShell, useConfirmTap } from '../../components/GameShell';
import { IntersectionBoard, Stone } from '../../components/IntersectionBoard';
import { useGameSession } from '../../core/useGameSession';
import { gomoku, isLegal, SIZE } from './engine';

const STARS = [3 * SIZE + 3, 3 * SIZE + 11, 7 * SIZE + 7, 11 * SIZE + 3, 11 * SIZE + 11];

export function GomokuGame({ onBack }: { onBack(): void }) {
  const session = useGameSession('gomoku', gomoku, { mode: 'cpu', humanSide: 0, level: 2, options: {} });
  const { state, canInput, play } = session;
  const confirm = useConfirmTap(state);
  const win = new Set(state.winLine ?? []);

  return (
    <GameShell title="五目並べ" sideNames={['黒', '白']} turn={state.turn} session={session} onBack={onBack}>
      {() => (
        <>
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
            {confirm.pending >= 0 && <Stone p={confirm.pending} size={SIZE} color={state.turn + 1} ghost />}
          </IntersectionBoard>
          <p className="hint">{canInput ? (confirm.pending >= 0 ? 'もう一度タップで確定' : '置きたい場所をタップ') : ' '}</p>
        </>
      )}
    </GameShell>
  );
}
