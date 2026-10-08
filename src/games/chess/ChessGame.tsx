import { useState } from 'react';
import { GameShell } from '../../components/GameShell';
import { useGameSession } from '../../core/useGameSession';
import { chess, inCheck, legalMoves, type ChessMove, type Promo } from './engine';

// 白も黒も塗りつぶしの字形を使い、色は CSS で付ける（︎ で絵文字表示を防ぐ）
const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyph = (p: string) => GLYPH[p.toUpperCase()] + '︎';
const PROMOS: Promo[] = ['q', 'r', 'b', 'n'];

export function ChessGame({ onBack }: { onBack(): void }) {
  const session = useGameSession('chess', chess, { mode: 'cpu', humanSide: 0, level: 2, options: {} });
  const { state, canInput, play, outcome } = session;
  const [sel, setSel] = useState<{ key: unknown; sq: number } | null>(null);
  const [promo, setPromo] = useState<{ key: unknown; moves: ChessMove[] } | null>(null);
  const selected = sel && sel.key === state ? sel.sq : -1;
  const promoMoves = promo && promo.key === state ? promo.moves : null;

  const moves = canInput ? legalMoves(state) : [];
  const targets = new Map<number, ChessMove[]>();
  for (const m of moves) if (m.from === selected) targets.set(m.to, [...(targets.get(m.to) ?? []), m]);
  const movable = new Set(moves.map((m) => m.from));
  const checkSq = inCheck(state) ? state.board.indexOf(state.turn === 0 ? 'K' : 'k') : -1;

  const tap = (sq: number) => {
    if (!canInput) return;
    const here = targets.get(sq);
    if (here) {
      if (here.length > 1) setPromo({ key: state, moves: here });
      else play(here[0]);
      setSel(null);
      return;
    }
    setSel(movable.has(sq) && sq !== selected ? { key: state, sq } : null);
  };

  return (
    <GameShell title="チェス" sideNames={['白', '黒']} turn={state.turn} session={session} flippable whiteFirst onBack={onBack}>
      {({ flipped }) => {
        const order = [...Array(64).keys()];
        if (flipped) order.reverse();
        return (
          <>
            <div className="grid-board chess" role="grid" aria-label="チェス盤">
              {order.map((sq) => {
                const piece = state.board[sq];
                const dark = ((sq >> 3) + (sq & 7)) % 2 === 1;
                const last = state.lastMove && (state.lastMove.from === sq || state.lastMove.to === sq);
                const cls = [
                  'cell',
                  dark ? 'dark' : 'light',
                  last ? 'last' : '',
                  sq === selected ? 'selected' : '',
                  sq === checkSq ? 'check' : '',
                ].join(' ');
                return (
                  <button key={sq} className={cls} onClick={() => tap(sq)} aria-label={`${'abcdefgh'[sq & 7]}${8 - (sq >> 3)}`}>
                    {piece && <span className={`chess-piece ${piece <= 'Z' ? 'white' : 'black'}`}>{glyph(piece)}</span>}
                    {targets.has(sq) && <i className={piece ? 'capture-ring' : 'hint-dot'} />}
                  </button>
                );
              })}
            </div>
            <p className="hint">{!outcome && inCheck(state) ? 'チェック！' : ' '}</p>
            {promoMoves && (
              <div className="sheet-backdrop" onClick={() => setPromo(null)}>
                <div className="sheet compact" role="dialog" aria-label="昇格する駒" onClick={(e) => e.stopPropagation()}>
                  <h2>昇格する駒を選んでください</h2>
                  <div className="promo-row">
                    {PROMOS.map((p) => (
                      <button
                        key={p}
                        className="promo-btn"
                        onClick={() => {
                          play(promoMoves.find((m) => m.promo === p)!);
                          setPromo(null);
                        }}
                      >
                        <span className={`chess-piece ${state.turn === 0 ? 'white' : 'black'}`}>{glyph(p)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }}
    </GameShell>
  );
}
