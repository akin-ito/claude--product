import { useState } from 'react';
import { GameShell } from '../../components/GameShell';
import type { Player } from '../../core/types';
import { useGameSession } from '../../core/useGameSession';
import { HI, inCheck, legalMoves, shogi, type ShogiMove, type ShogiState } from './engine';

const NAMES: Record<number, string> = {
  1: '歩', 2: '香', 3: '桂', 4: '銀', 5: '金', 6: '角', 7: '飛', 8: '玉',
  9: 'と', 10: '杏', 11: '圭', 12: '全', 14: '馬', 15: '龍',
};
const pieceName = (v: number) => (v === -8 ? '王' : NAMES[Math.abs(v)]);
const HAND_ORDER = [HI, 6, 5, 4, 3, 2, 1];
const KANJI_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

type Selection = { kind: 'board'; sq: number } | { kind: 'hand'; type: number };

export function ShogiGame({ onBack }: { onBack(): void }) {
  const session = useGameSession('shogi', shogi, { mode: 'cpu', humanSide: 0, level: 2, options: {} });
  const { state, canInput, play, outcome } = session;
  const [sel, setSel] = useState<{ key: unknown; s: Selection } | null>(null);
  const [choice, setChoice] = useState<{ key: unknown; moves: ShogiMove[] } | null>(null);
  const selected = sel && sel.key === state ? sel.s : null;
  const promoChoice = choice && choice.key === state ? choice.moves : null;

  const moves = canInput ? legalMoves(state) : [];
  const matches = (m: ShogiMove) =>
    selected?.kind === 'board' ? m.from === selected.sq : selected?.kind === 'hand' ? m.drop === selected.type : false;
  const targets = new Map<number, ShogiMove[]>();
  for (const m of moves) if (matches(m)) targets.set(m.to, [...(targets.get(m.to) ?? []), m]);
  const movableSq = new Set(moves.filter((m) => m.from >= 0).map((m) => m.from));
  const droppable = new Set(moves.filter((m) => m.drop).map((m) => m.drop!));

  const tapSquare = (sq: number) => {
    if (!canInput) return;
    const here = targets.get(sq);
    if (here) {
      if (here.length > 1) setChoice({ key: state, moves: here });
      else play(here[0]);
      setSel(null);
      return;
    }
    const same = selected?.kind === 'board' && selected.sq === sq;
    setSel(movableSq.has(sq) && !same ? { key: state, s: { kind: 'board', sq } } : null);
  };

  const tapHand = (player: Player, type: number) => {
    if (!canInput || player !== state.turn || !droppable.has(type)) return;
    const same = selected?.kind === 'hand' && selected.type === type;
    setSel(same ? null : { key: state, s: { kind: 'hand', type } });
  };

  const last = state.lastMove;

  return (
    <GameShell title="将棋" sideNames={['先手', '後手']} turn={state.turn} session={session} flippable onBack={onBack}>
      {({ flipped }) => {
        const top: Player = flipped ? 0 : 1;
        const bottom: Player = flipped ? 1 : 0;
        const order = [...Array(81).keys()];
        if (flipped) order.reverse();
        const cols = flipped ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [9, 8, 7, 6, 5, 4, 3, 2, 1];
        const rows = flipped ? [...KANJI_NUM].reverse() : KANJI_NUM;
        return (
          <>
            <Hand state={state} player={top} flipped={flipped} selected={selected} onTap={tapHand} />
            <div className="shogi-wrap">
              <div className="shogi-cols">
                {cols.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <div className="shogi-main">
                <div className="grid-board shogi" role="grid" aria-label="将棋盤">
                  {order.map((sq) => {
                    const v = state.board[sq];
                    const isLast = last && last.to === sq;
                    const cls = [
                      'cell',
                      isLast ? 'last' : '',
                      selected?.kind === 'board' && selected.sq === sq ? 'selected' : '',
                    ].join(' ');
                    // 自分側（下）の駒は正立、相手側の駒は逆さに表示
                    const upsideDown = v !== 0 && (v > 0) === flipped;
                    return (
                      <button key={sq} className={cls} onClick={() => tapSquare(sq)}>
                        {v !== 0 && (
                          <span className={`koma${upsideDown ? ' gote' : ''}${Math.abs(v) > 8 ? ' promoted' : ''}`}>
                            {pieceName(v)}
                          </span>
                        )}
                        {targets.has(sq) && <i className={v ? 'capture-ring' : 'hint-dot'} />}
                      </button>
                    );
                  })}
                </div>
                <div className="shogi-rows">
                  {rows.map((r) => (
                    <span key={r}>{r}</span>
                  ))}
                </div>
              </div>
            </div>
            <Hand state={state} player={bottom} flipped={flipped} selected={selected} onTap={tapHand} />
            <p className="hint">{!outcome && inCheck(state) ? '王手！' : ' '}</p>
            {promoChoice && (
              <div className="sheet-backdrop" onClick={() => setChoice(null)}>
                <div className="sheet compact" role="dialog" aria-label="成りますか" onClick={(e) => e.stopPropagation()}>
                  <h2>成りますか？</h2>
                  <div className="sheet-actions">
                    <button
                      onClick={() => {
                        play(promoChoice.find((m) => !m.promote)!);
                        setChoice(null);
                      }}
                    >
                      成らない
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        play(promoChoice.find((m) => m.promote)!);
                        setChoice(null);
                      }}
                    >
                      成る
                    </button>
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

function Hand({
  state,
  player,
  flipped,
  selected,
  onTap,
}: {
  state: ShogiState;
  player: Player;
  flipped: boolean;
  selected: Selection | null;
  onTap(player: Player, type: number): void;
}) {
  const pieces = HAND_ORDER.filter((t) => state.hands[player][t] > 0);
  const upsideDown = (player === 1) !== flipped;
  return (
    <div className={`hand${upsideDown ? ' hand-top' : ''}${state.turn === player ? ' active' : ''}`}>
      <span className="hand-label">{player === 0 ? '☗先手' : '☖後手'}</span>
      {pieces.length === 0 && <span className="hand-empty">持ち駒なし</span>}
      {pieces.map((t) => (
        <button
          key={t}
          className={`hand-piece${state.turn === player && selected?.kind === 'hand' && selected.type === t ? ' selected' : ''}`}
          onClick={() => onTap(player, t)}
        >
          <span className={`koma${upsideDown ? ' gote' : ''}`}>{NAMES[t]}</span>
          {state.hands[player][t] > 1 && <span className="hand-count">{state.hands[player][t]}</span>}
        </button>
      ))}
    </div>
  );
}
