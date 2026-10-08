import { useState } from 'react';
import { GameShell, Segmented } from '../../components/GameShell';
import { TIME_PRESETS } from '../../core/timePresets';
import { useGameSession } from '../../core/useGameSession';
import {
  chess,
  claimableDraw,
  inCheck,
  legalMoves,
  offerPending,
  type ChessAction,
  type ChessMove,
  type ChessOptions,
  type ChessState,
  type DrawRule,
  type Promo,
} from './engine';

// 白も黒も塗りつぶしの字形を使い、色は CSS で付ける（︎ で絵文字表示を防ぐ）
const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const glyph = (p: string) => GLYPH[p.toUpperCase()] + '︎';
const PROMOS: Promo[] = ['q', 'r', 'b', 'n'];

export function ChessGame({ onBack, onRules }: { onBack(): void; onRules(): void }) {
  const session = useGameSession<ChessState, ChessAction, ChessOptions>('chess', chess, { mode: 'cpu', humanSide: 0, level: 2, time: { kind: 'none' }, options: { drawRule: 'fide' } });
  const { state, canInput, play, outcome } = session;
  const [sel, setSel] = useState<{ key: unknown; sq: number } | null>(null);
  const [promo, setPromo] = useState<{ key: unknown; moves: ChessMove[] } | null>(null);
  const selected = sel && sel.key === state ? sel.sq : -1;
  const promoMoves = promo && promo.key === state ? promo.moves : null;

  const moves = canInput ? legalMoves(state) : [];
  const claim = claimableDraw(state);
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
    <GameShell
      timePresets={TIME_PRESETS.chess}
      title="チェス"
      sideNames={['白', '黒']}
      turn={state.turn}
      session={session}
      flippable
      whiteFirst
      onBack={onBack}
      onRules={onRules}
      renderOptions={(o, set) => (
        <fieldset>
          <legend>3回同形・50手ルール</legend>
          <Segmented<DrawRule>
            value={o.drawRule}
            options={[
              ['fide', '申請で引き分け（FIDE）'],
              ['auto', '自動で引き分け'],
            ]}
            onChange={(drawRule) => set({ ...o, drawRule })}
          />
        </fieldset>
      )}
    >
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
            {canInput && offerPending(state) && (
              <div className="offer-banner" role="alert">
                <span>相手から引き分けの提案があります</span>
                <div className="inline-actions">
                  <button onClick={() => play({ decline: true })}>断る</button>
                  <button className="primary" onClick={() => play({ accept: true })}>
                    受ける
                  </button>
                </div>
              </div>
            )}
            {canInput && !offerPending(state) && (
              <div className="inline-actions">
                {claim && state.drawRule === 'fide' && (
                  <button onClick={() => play({ claim: true })}>引き分けを申請（{claim}）</button>
                )}
                <button onClick={() => play({ offer: true })} disabled={state.offer === state.turn}>
                  {state.offer === state.turn ? '提案済み（次の手と一緒に伝わります）' : '引き分けを提案'}
                </button>
              </div>
            )}
            {!outcome && state.declined !== null && state.declined !== state.turn && (
              <p className="hint">引き分けの提案は断られました</p>
            )}
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
