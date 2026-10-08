import type { ReactNode } from 'react';

/**
 * ルール説明用の小さな盤の図。
 * 行ごとの文字列で盤面を書く。
 */

function Figure({ caption, children, wide }: { caption?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`diagram${wide ? ' wide' : ''}`}>
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

// ---------------------------------------------------------------- マス目の盤

/** 1 マスの大きさを cell px 程度にして、小さな図が大きくなりすぎないようにする */
const gridStyle = (cols: number, cell: number) => ({
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  width: `${cols * cell}px`,
  maxWidth: '100%',
});

const CHESS_GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

/**
 * チェスの図。各行は空白区切りのトークン。
 *   K Q R B N P = 白, k q r b n p = 黒, . = 空, * = 動ける先
 *   先頭に ! を付けると赤く強調（取れる駒・攻撃されているマスなど）
 */
export function ChessDiagram({ rows, caption }: { rows: string[]; caption?: ReactNode }) {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const cols = grid[0].length;
  return (
    <Figure caption={caption}>
      <div className="dg-grid dg-chess" style={gridStyle(cols, 32)}>
        {grid.flatMap((row, r) =>
          row.map((tok, c) => {
            const mark = tok.startsWith('!');
            const t = mark ? tok.slice(1) : tok;
            const dark = (r + c) % 2 === 1;
            return (
              <div key={`${r}-${c}`} className={`dg-cell ${dark ? 'dark' : 'light'}${mark ? ' mark' : ''}`}>
                {t === '*' && <i className="dg-dot" />}
                {CHESS_GLYPH[t.toUpperCase()] && (
                  <span className={`chess-piece ${t <= 'Z' ? 'white' : 'black'}`}>{CHESS_GLYPH[t.toUpperCase()] + '︎'}</span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </Figure>
  );
}

/**
 * 将棋の図。各行は空白区切りのトークン。
 *   歩 銀 など = 先手の駒, v歩 = 後手の駒（逆さ）, . = 空, * = 動ける先, ○ = 走って動ける先
 *   先頭に ! を付けると赤く強調
 */
export function ShogiDiagram({ rows, caption }: { rows: string[]; caption?: ReactNode }) {
  const grid = rows.map((r) => r.trim().split(/\s+/));
  const cols = grid[0].length;
  return (
    <Figure caption={caption}>
      <div className="dg-grid dg-shogi" style={gridStyle(cols, 36)}>
        {grid.flatMap((row, r) =>
          row.map((tok, c) => {
            const mark = tok.startsWith('!');
            let t = mark ? tok.slice(1) : tok;
            const gote = t.startsWith('v');
            if (gote) t = t.slice(1);
            const promoted = 'と杏圭全馬龍'.includes(t) && t.length === 1;
            return (
              <div key={`${r}-${c}`} className={`dg-cell${mark ? ' mark' : ''}`}>
                {t === '*' && <i className="dg-dot" />}
                {t === '○' && <i className="dg-dot slide" />}
                {t !== '.' && t !== '*' && t !== '○' && (
                  <span className={`koma${gote ? ' gote' : ''}${promoted ? ' promoted' : ''}`}>{t}</span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </Figure>
  );
}

/**
 * オセロの図。各行は文字の並び。
 *   B = 黒, W = 白, . = 空, * = 置ける場所, b / w = 今ひっくり返った石（強調）
 */
export function OthelloDiagram({ rows, caption }: { rows: string[]; caption?: ReactNode }) {
  const cols = rows[0].length;
  return (
    <Figure caption={caption}>
      <div className="dg-grid dg-othello" style={gridStyle(cols, 34)}>
        {rows.flatMap((row, r) =>
          [...row].map((ch, c) => (
            <div key={`${r}-${c}`} className="dg-cell">
              {(ch === 'B' || ch === 'b') && <i className={`disc disc-b${ch === 'b' ? ' flipped' : ''}`} />}
              {(ch === 'W' || ch === 'w') && <i className={`disc disc-w${ch === 'w' ? ' flipped' : ''}`} />}
              {ch === '*' && <i className="dg-dot" />}
            </div>
          )),
        )}
      </div>
    </Figure>
  );
}

// ---------------------------------------------------------------- 交点の盤

/**
 * 囲碁・五目並べの図。各行は文字の並び（1 文字 = 1 交点）。
 *   X = 黒, O = 白, . = 空, * = 打つ場所（赤い点）, # = 打てない場所（赤い ×）
 *   x / o = 印の付いた黒石・白石（取られる石など）
 *   b / w = 黒の地・白の地（小さな四角）
 *   1〜9, A〜E = 空点に表示する文字（手順や記号）
 */
export function PointDiagram({ rows, caption, stars = [] }: { rows: string[]; caption?: ReactNode; stars?: [number, number][] }) {
  const h = rows.length;
  const w = rows[0].length;
  const items: ReactNode[] = [];
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const x = c + 0.5;
      const y = r + 0.5;
      const key = `${r}-${c}`;
      if (ch === 'X' || ch === 'x' || ch === 'O' || ch === 'o') {
        const black = ch === 'X' || ch === 'x';
        items.push(<circle key={key} cx={x} cy={y} r={0.46} className={`stone stone-${black ? 'b' : 'w'}`} />);
        if (ch === 'x' || ch === 'o')
          items.push(<polygon key={key + 'm'} points={`${x},${y - 0.22} ${x + 0.2},${y + 0.14} ${x - 0.2},${y + 0.14}`} className={`dg-tri on-${black ? 'b' : 'w'}`} />);
      } else if (ch === '*') {
        items.push(<circle key={key} cx={x} cy={y} r={0.16} className="dg-pt" />);
      } else if (ch === '#') {
        items.push(
          <g key={key} className="forbid">
            <line x1={x - 0.22} y1={y - 0.22} x2={x + 0.22} y2={y + 0.22} />
            <line x1={x - 0.22} y1={y + 0.22} x2={x + 0.22} y2={y - 0.22} />
          </g>,
        );
      } else if (ch === 'b' || ch === 'w') {
        items.push(<rect key={key} x={x - 0.18} y={y - 0.18} width={0.36} height={0.36} className={`terr terr-${ch}`} />);
      } else if (/[1-9A-E]/.test(ch)) {
        items.push(<circle key={key + 'bg'} cx={x} cy={y} r={0.36} className="dg-label-bg" />);
        items.push(
          <text key={key} x={x} y={y + 0.02} className="dg-label">
            {ch}
          </text>,
        );
      }
    }),
  );
  const lines: ReactNode[] = [];
  for (let r = 0; r < h; r++) lines.push(<line key={`h${r}`} x1={0.5} y1={r + 0.5} x2={w - 0.5} y2={r + 0.5} />);
  for (let c = 0; c < w; c++) lines.push(<line key={`v${c}`} x1={c + 0.5} y1={0.5} x2={c + 0.5} y2={h - 0.5} />);
  return (
    <Figure caption={caption}>
      <svg className="dg-points" viewBox={`0 0 ${w} ${h}`} style={{ aspectRatio: `${w} / ${h}`, width: `${Math.min(w * 30, 300)}px`, maxWidth: '100%' }}>
        <rect x={0} y={0} width={w} height={h} className="ix-bg" />
        <g className="ix-lines" strokeWidth={0.05}>
          {lines}
        </g>
        {stars.map(([r, c]) => (
          <circle key={`s${r}-${c}`} cx={c + 0.5} cy={r + 0.5} r={0.1} className="ix-star" />
        ))}
        {items}
      </svg>
    </Figure>
  );
}

/** 図を横に並べる */
export function Row({ children }: { children: ReactNode }) {
  return <div className="dg-row">{children}</div>;
}
