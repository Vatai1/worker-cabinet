import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '@/shared/store/uiStore'
import { cn } from '@/shared/lib/utils'

export interface ReportChart {
  id: string
  type: 'hbar-stacked' | 'column' | 'area' | 'share'
  stacked?: boolean
  title: string
  unit: string
  categories: string[]
  series: { name: string; values: number[]; color: number }[]
}

const PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
}
const OTHER = { light: '#a3a29c', dark: '#6b6a65' }
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const GAP = 2
const fmt = (n: number) => n.toLocaleString('ru-RU')
const pct = (part: number, total: number) => {
  if (!total || !part) return '0%'
  const p = (part / total) * 100
  return p < 1 ? '<1%' : `${Math.round(p)}%`
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

function useColors() {
  const dark = useUIStore((s) => s.darkMode)
  return (color: number) => (color < 0 ? OTHER[dark ? 'dark' : 'light'] : PALETTE[dark ? 'dark' : 'light'][color % 5])
}

function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(Math.round(v * 100) / 100)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

const rightRounded = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, w, h / 2)
  return `M${x},${y}h${w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - 2 * rr}a${rr},${rr} 0 0 1 -${rr},${rr}h-${w - rr}z`
}
const topRounded = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}v-${h - rr}a${rr},${rr} 0 0 1 ${rr},-${rr}h${w - 2 * rr}a${rr},${rr} 0 0 1 ${rr},${rr}v${h - rr}z`
}

interface TipState { x: number; y: number; title: string; rows: { name: string; value: number; color: string }[]; total?: number }

function Tooltip({ tip, unit, width }: { tip: TipState | null; unit: string; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 200))
  return (
    <div className="pointer-events-none absolute z-10 min-w-[160px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg" style={{ left, top: Math.max(0, tip.y - 12) }}>
      <p className="mb-1 font-medium text-muted-foreground">{tip.title}</p>
      {tip.rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
            {r.name}
          </span>
          <span className="font-semibold tabular-nums text-foreground">{fmt(r.value)} {unit}</span>
        </div>
      ))}
      {tip.total !== undefined && tip.rows.length > 1 && (
        <div className="mt-1 flex justify-between gap-4 border-t border-border pt-1">
          <span className="text-muted-foreground">Всего</span>
          <span className="font-semibold tabular-nums text-foreground">{fmt(tip.total)} {unit}</span>
        </div>
      )}
    </div>
  )
}

function Legend({ chart, colorOf, withTotals }: { chart: ReportChart; colorOf: (c: number) => string; withTotals?: boolean }) {
  if (chart.series.length < 2) return null
  const grand = chart.series.reduce((t, s) => t + s.values.reduce((a, b) => a + b, 0), 0)
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {chart.series.map((s) => {
        const total = s.values.reduce((a, b) => a + b, 0)
        return (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(s.color) }} />
            {s.name}
            {withTotals && (
              <span className="font-semibold tabular-nums text-foreground">
                {fmt(total)}{grand > 0 && ` · ${pct(total, grand)}`}
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s)

function HBarStacked({ chart, width, colorOf }: { chart: ReportChart; width: number; colorOf: (c: number) => string }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const labelW = Math.min(190, Math.max(110, width * 0.3))
  const valueW = 64
  const plotW = Math.max(40, width - labelW - valueW)
  const rowH = 30
  const barH = 16
  const totals = chart.categories.map((_, i) => chart.series.reduce((t, s) => t + s.values[i], 0))
  const ticks = niceTicks(Math.max(...totals))
  const max = ticks[ticks.length - 1]
  const height = chart.categories.length * rowH + 22
  const x = (v: number) => labelW + (v / max) * plotW
  return (
    <div className="relative" onPointerLeave={() => { setTip(null); setHover(null) }}>
      <svg width={width} height={height} role="img" aria-label={chart.title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={height - 18} className="stroke-border" strokeWidth={1} />
            <text x={x(t)} y={height - 4} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">{fmt(t)}</text>
          </g>
        ))}
        {chart.categories.map((cat, i) => {
          const y = i * rowH + (rowH - barH) / 2
          let acc = 0
          const parts = chart.series.map((s) => ({ s, v: s.values[i] })).filter((p) => p.v > 0)
          return (
            <g key={cat} opacity={hover === null || hover === i ? 1 : 0.45}>
              <text x={labelW - 10} y={y + barH / 2 + 4} textAnchor="end" className="fill-foreground text-[11px]">
                <title>{cat}</title>
                {truncate(cat, Math.floor(labelW / 6.6))}
              </text>
              {parts.map((p, j) => {
                const x0 = x(acc) + (j > 0 ? GAP : 0)
                acc += p.v
                const w = Math.max(1, x(acc) - x0)
                const fill = colorOf(p.s.color)
                return j === parts.length - 1
                  ? <path key={p.s.name} d={rightRounded(x0, y, w, barH)} fill={fill} />
                  : <rect key={p.s.name} x={x0} y={y} width={w} height={barH} fill={fill} />
              })}
              <text x={x(totals[i]) + 6} y={y + barH / 2 + 4} className="fill-foreground text-[11px] font-semibold tabular-nums">{fmt(totals[i])}</text>
              <rect
                x={0} y={i * rowH} width={width} height={rowH} fill="transparent" tabIndex={0}
                aria-label={`${cat}: ${chart.series.map((s) => `${s.name} ${fmt(s.values[i])}`).join(', ')}`}
                onPointerMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setHover(i)
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: cat, total: totals[i], rows: chart.series.map((s) => ({ name: s.name, value: s.values[i], color: colorOf(s.color) })) })
                }}
                onFocus={() => { setHover(i); setTip({ x: x(totals[i]), y: i * rowH, title: cat, total: totals[i], rows: chart.series.map((s) => ({ name: s.name, value: s.values[i], color: colorOf(s.color) })) }) }}
                onBlur={() => { setHover(null); setTip(null) }}
                className="cursor-default outline-none"
              />
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} unit={chart.unit} width={width} />
    </div>
  )
}

function Columns({ chart, width, colorOf }: { chart: ReportChart; width: number; colorOf: (c: number) => string }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const axisW = 40
  const height = 220
  const top = 22
  const bottom = 26
  const plotH = height - top - bottom
  const band = (width - axisW) / chart.categories.length
  const barW = Math.min(24, band * 0.6)
  const totals = chart.categories.map((_, i) => chart.series.reduce((t, s) => t + s.values[i], 0))
  const ticks = niceTicks(Math.max(...totals))
  const max = ticks[ticks.length - 1]
  const y = (v: number) => top + plotH - (v / max) * plotH
  const peak = totals.indexOf(Math.max(...totals))
  return (
    <div className="relative" onPointerLeave={() => { setTip(null); setHover(null) }}>
      <svg width={width} height={height} role="img" aria-label={chart.title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={axisW} x2={width} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-muted-foreground/40' : 'stroke-border'} strokeWidth={1} />
            <text x={axisW - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{fmt(t)}</text>
          </g>
        ))}
        {chart.categories.map((cat, i) => {
          const cx = axisW + band * i + band / 2
          let acc = 0
          const parts = chart.series.map((s) => ({ s, v: s.values[i] })).filter((p) => p.v > 0)
          const rows = chart.series.map((s) => ({ name: s.name, value: s.values[i], color: colorOf(s.color) }))
          return (
            <g key={cat} opacity={hover === null || hover === i ? 1 : 0.45}>
              {parts.map((p, j) => {
                const y1 = y(acc)
                acc += p.v
                const y0 = y(acc)
                const h = Math.max(1, y1 - y0 - (j > 0 ? GAP : 0))
                const fill = colorOf(p.s.color)
                return j === parts.length - 1
                  ? <path key={p.s.name} d={topRounded(cx - barW / 2, y0, barW, h)} fill={fill} />
                  : <rect key={p.s.name} x={cx - barW / 2} y={y0} width={barW} height={h} fill={fill} />
              })}
              {(i === peak || hover === i || chart.categories.length <= 6) && totals[i] > 0 && (
                <text x={cx} y={y(totals[i]) - 6} textAnchor="middle" className="fill-foreground text-[11px] font-semibold tabular-nums">{fmt(totals[i])}</text>
              )}
              <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{cat}</text>
              <rect
                x={axisW + band * i} y={top} width={band} height={plotH} fill="transparent" tabIndex={0}
                aria-label={`${cat}: ${rows.map((r) => `${r.name} ${fmt(r.value)}`).join(', ')}`}
                onPointerMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setHover(i)
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title: cat, total: totals[i], rows })
                }}
                onFocus={() => { setHover(i); setTip({ x: cx, y: y(totals[i]), title: cat, total: totals[i], rows }) }}
                onBlur={() => { setHover(null); setTip(null) }}
                className="outline-none"
              />
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} unit={chart.unit} width={width} />
    </div>
  )
}

function Area({ chart, width, colorOf }: { chart: ReportChart; width: number; colorOf: (c: number) => string }) {
  const [idx, setIdx] = useState<number | null>(null)
  const s = chart.series[0]
  const color = colorOf(s.color)
  const axisW = 40
  const height = 220
  const top = 24
  const bottom = 26
  const plotH = height - top - bottom
  const n = chart.categories.length
  const ticks = niceTicks(Math.max(...s.values))
  const max = ticks[ticks.length - 1]
  const x = (i: number) => axisW + (n <= 1 ? 0 : (i / (n - 1)) * (width - axisW - 8))
  const y = (v: number) => top + plotH - (v / max) * plotH
  const line = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')
  const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}z`
  const peak = s.values.indexOf(Math.max(...s.values))
  const monthTicks = chart.categories
    .map((c, i) => ({ i, m: Number(c.slice(3, 5)) - 1 }))
    .filter((t, k, arr) => k === 0 || t.m !== arr[k - 1].m)
    .reduce<{ i: number; m: number }[]>((acc, t) => {
      if (acc.length && x(t.i) - x(acc[acc.length - 1].i) < 28) acc[acc.length - 1] = t
      else acc.push(t)
      return acc
    }, [])
  const range = (i: number) => {
    const [d, m] = chart.categories[i].split('.').map(Number)
    const end = new Date(2000, m - 1, d + 6)
    return `${chart.categories[i]} — ${String(end.getDate()).padStart(2, '0')}.${String(end.getMonth() + 1).padStart(2, '0')}`
  }
  const pick = (clientX: number, svg: SVGSVGElement) => {
    const rel = clientX - svg.getBoundingClientRect().left
    setIdx(Math.max(0, Math.min(n - 1, Math.round(((rel - axisW) / (width - axisW - 8)) * (n - 1)))))
  }
  return (
    <div className="relative">
      <svg
        width={width} height={height} role="img" aria-label={chart.title} tabIndex={0} className="outline-none"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setIdx(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setIdx((v) => Math.min(n - 1, (v ?? -1) + 1))
          if (e.key === 'ArrowLeft') setIdx((v) => Math.max(0, (v ?? n) - 1))
        }}
        onBlur={() => setIdx(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={axisW} x2={width} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-muted-foreground/40' : 'stroke-border'} strokeWidth={1} />
            <text x={axisW - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{fmt(t)}</text>
          </g>
        ))}
        {monthTicks.map((t) => (
          <text key={t.i} x={x(t.i)} y={height - 8} textAnchor="start" className="fill-muted-foreground text-[10px]">{MONTHS[t.m]}</text>
        ))}
        <path d={area} fill={color} fillOpacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(peak)} cy={y(s.values[peak])} r={4} fill={color} className="stroke-card" strokeWidth={2} />
        <text x={x(peak)} y={y(s.values[peak]) - 10} textAnchor={peak > n * 0.85 ? 'end' : 'middle'} className="fill-foreground text-[11px] font-semibold tabular-nums">
          пик {fmt(s.values[peak])} {chart.unit}
        </text>
        {idx !== null && (
          <g>
            <line x1={x(idx)} x2={x(idx)} y1={top} y2={y(0)} className="stroke-muted-foreground/50" strokeWidth={1} />
            <circle cx={x(idx)} cy={y(s.values[idx])} r={4} fill={color} className="stroke-card" strokeWidth={2} />
          </g>
        )}
      </svg>
      {idx !== null && (
        <Tooltip tip={{ x: x(idx), y: y(s.values[idx]), title: range(idx), rows: [{ name: s.name, value: s.values[idx], color }] }} unit={chart.unit} width={width} />
      )}
    </div>
  )
}

function Share({ chart, width, colorOf }: { chart: ReportChart; width: number; colorOf: (c: number) => string }) {
  const [tip, setTip] = useState<TipState | null>(null)
  const items = chart.series.map((s) => ({ ...s, v: s.values[0] })).filter((s) => s.v > 0)
  const total = items.reduce((t, s) => t + s.v, 0)
  const h = 24
  const usable = width - GAP * (items.length - 1)
  let acc = 0
  return (
    <div className="relative" onPointerLeave={() => setTip(null)}>
      <svg width={width} height={h} role="img" aria-label={`${chart.title}: ${items.map((s) => `${s.name} ${s.v}`).join(', ')}`}>
        <defs>
          <clipPath id={`share-${chart.id}`}><rect x={0} y={0} width={width} height={h} rx={4} /></clipPath>
        </defs>
        <g clipPath={`url(#share-${chart.id})`}>
          {items.map((s, i) => {
            const w = (s.v / total) * usable
            const x0 = acc + i * GAP
            acc += w
            return (
              <rect
                key={s.name} x={x0} y={0} width={Math.max(1, w)} height={h} fill={colorOf(s.color)} tabIndex={0} className="outline-none"
                onPointerMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                  setTip({ x: e.clientX - box.left, y: h + 6, title: `${pct(s.v, total)} сотрудников`, rows: [{ name: s.name, value: s.v, color: colorOf(s.color) }] })
                }}
                onFocus={() => setTip({ x: x0, y: h + 6, title: `${pct(s.v, total)} сотрудников`, rows: [{ name: s.name, value: s.v, color: colorOf(s.color) }] })}
                onBlur={() => setTip(null)}
              />
            )
          })}
        </g>
      </svg>
      <Tooltip tip={tip} unit={chart.unit} width={width} />
    </div>
  )
}

function ChartCard({ chart }: { chart: ReportChart }) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const colorOf = useColors()
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{chart.title}</p>
        <Legend chart={chart} colorOf={colorOf} withTotals={chart.type === 'share'} />
      </div>
      <div ref={ref} className="w-full">
        {width > 0 && (
          chart.type === 'hbar-stacked' ? <HBarStacked chart={chart} width={width} colorOf={colorOf} />
            : chart.type === 'column' ? <Columns chart={chart} width={width} colorOf={colorOf} />
              : chart.type === 'area' ? <Area chart={chart} width={width} colorOf={colorOf} />
                : <Share chart={chart} width={width} colorOf={colorOf} />
        )}
      </div>
    </div>
  )
}

export function ReportCharts({ charts, className }: { charts: ReportChart[]; className?: string }) {
  if (!charts.length) return null
  return (
    <div className={cn('grid gap-3', charts.length > 1 && 'lg:grid-cols-2', className)}>
      {charts.map((c) => <ChartCard key={c.id} chart={c} />)}
    </div>
  )
}
