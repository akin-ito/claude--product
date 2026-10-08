import type { ReactNode } from 'react';

/** 囲碁・五目並べ用の、線の交点に石を置く盤 */
export function IntersectionBoard({
  size,
  stars,
  onTap,
  children,
  label,
}: {
  size: number;
  stars: number[];
  onTap?: (p: number) => void;
  children: ReactNode;
  label: string;
}) {
  const lines = [];
  for (let k = 0; k < size; k++) {
    const x = k + 0.5;
    lines.push(<line key={`h${k}`} x1={0.5} y1={x} x2={size - 0.5} y2={x} />);
    lines.push(<line key={`v${k}`} x1={x} y1={0.5} x2={x} y2={size - 0.5} />);
  }
  const hits = [];
  if (onTap) {
    for (let p = 0; p < size * size; p++) {
      hits.push(
        <rect
          key={p}
          x={p % size}
          y={Math.floor(p / size)}
          width={1}
          height={1}
          fill="transparent"
          onClick={() => onTap(p)}
        />,
      );
    }
  }
  return (
    <svg className="ix-board" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <rect x={0} y={0} width={size} height={size} className="ix-bg" />
      <g className="ix-lines" strokeWidth={size > 13 ? 0.04 : 0.05}>
        {lines}
      </g>
      {stars.map((p) => (
        <circle key={p} cx={(p % size) + 0.5} cy={Math.floor(p / size) + 0.5} r={0.1} className="ix-star" />
      ))}
      {children}
      <g>{hits}</g>
    </svg>
  );
}

export function Stone({ p, size, color, ghost, last, dim }: { p: number; size: number; color: number; ghost?: boolean; last?: boolean; dim?: boolean }) {
  const cx = (p % size) + 0.5;
  const cy = Math.floor(p / size) + 0.5;
  const cls = `stone stone-${color === 1 ? 'b' : 'w'}${ghost ? ' ghost' : ''}${dim ? ' dim' : ''}`;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={0.46} className={cls} />
      {last && <circle cx={cx} cy={cy} r={0.14} className={`last-mark on-${color === 1 ? 'b' : 'w'}`} />}
    </g>
  );
}
