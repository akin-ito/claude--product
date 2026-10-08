import { GameShell } from '../../components/GameShell';
import { TIME_PRESETS } from '../../core/timePresets';
import { useGameSession } from '../../core/useGameSession';
import { count, legalMoves, reversi } from './engine';

export function ReversiGame({ onBack, onRules }: { onBack(): void; onRules(): void }) {
  const session = useGameSession('reversi', reversi, { mode: 'cpu', humanSide: 0, level: 2, time: { kind: 'none' }, options: {} });
  const { state, canInput, play, outcome } = session;
  const hints = new Set(canInput ? legalMoves(state) : []);
  const [b, w] = count(state.board);
  const sideNames: [string, string] = ['黒', '白'];

  return (
    <GameShell
      timePresets={TIME_PRESETS.reversi} title="リバーシ" sideNames={sideNames} turn={state.turn} session={session} onBack={onBack} onRules={onRules}>
      {() => (
        <>
          <div className="scoreline">
            <span className="disc-count">
              <i className="disc disc-b" /> {b}
            </span>
            <span className="disc-count">
              <i className="disc disc-w" /> {w}
            </span>
          </div>
          <div className="grid-board reversi" role="grid" aria-label="リバーシの盤">
            {state.board.map((v, i) => (
              <button
                key={i}
                className={`cell${i === state.last ? ' last' : ''}`}
                onClick={() => hints.has(i) && play(i)}
                disabled={!hints.has(i)}
                aria-label={`${String.fromCharCode(97 + (i % 8))}${Math.floor(i / 8) + 1}`}
              >
                {v !== 0 && <i className={`disc disc-${v === 1 ? 'b' : 'w'}`} />}
                {v === 0 && hints.has(i) && <i className="hint-dot" />}
              </button>
            ))}
          </div>
          <p className="hint">{!outcome && state.passed !== null ? `${sideNames[state.passed]}は打てる場所がないのでパスしました` : ' '}</p>
        </>
      )}
    </GameShell>
  );
}
