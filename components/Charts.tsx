import { jst } from "@/lib/time";

export function CompletionRing({ rate, empty }: { rate: number; empty?: boolean }) {
  const C = 2 * Math.PI * 50;
  return (
    <div className="ring" aria-label={`完了率 ${rate}%`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--sunk)" strokeWidth="12" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--done)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(rate / 100) * C} ${C}`} />
      </svg>
      <div className="num">
        <b className="mono">{empty ? "–" : `${rate}%`}</b>
        <span>完了率</span>
      </div>
    </div>
  );
}

export function WeeklyBars({ rows }: { rows: { week: string; start: number; done: number; rest: number }[] }) {
  const max = Math.max(4, ...rows.map((r) => r.done + r.rest));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const w = 320, h = 160, pl = 26, pb = 22, pt = 8;
  const bw = (w - pl - 4) / rows.length;
  const y = (v: number) => pt + (h - pt - pb) * (1 - v / top);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="週ごとの追加タスク数">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={w} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={v ? 0.5 : 1} />
          <text x={pl - 5} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const x = pl + i * bw + bw * 0.18, bwi = bw * 0.64;
        const p = jst(r.start);
        return (
          <g key={r.week}>
            <rect x={x} y={y(r.done)} width={bwi} height={y(0) - y(r.done)} fill="var(--done)">
              <title>{`${r.week}週: 完了 ${r.done}・残り ${r.rest}`}</title>
            </rect>
            <rect x={x} y={y(r.done + r.rest)} width={bwi} height={y(r.done) - y(r.done + r.rest)} fill="var(--todo)" />
            {(i % 2 === 1 || i === rows.length - 1) && (
              <text x={x + bwi / 2} y={h - 6} textAnchor="middle">{`${p.m}/${p.d}`}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function GroupBars({ rows }: { rows: { name: string; doing: number; todo: number; total: number }[] }) {
  if (!rows.length) return <p className="empty">残タスクはありません。</p>;
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.name}>
          <span className="name" title={r.name}>{r.name}</span>
          <span className="bar-track">
            <i style={{ width: `${(r.doing / max) * 100}%`, background: "var(--doing)" }} />
            <i style={{ width: `${(r.todo / max) * 100}%`, background: "var(--todo)" }} />
          </span>
          <span className="v">{r.total}</span>
        </div>
      ))}
    </div>
  );
}
