"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { TREND_COLOR, TREND_FILL, type Trend } from "./ui"

// SVG charts: the card sparkline and the 380px detail chart. Both draw a series that is
// computed, never fetched (`pricePath` / `accretion` in market.ts).

type XY = { x: number; y: number }

const linePath = (pts: XY[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join("")

function areaPath(pts: XY[], height: number): string {
  const last = pts.at(-1)
  return last ? `${linePath(pts)}L${last.x},${height}L${pts[0].x},${height}Z` : ""
}

/* -------------------------------- sparkline -------------------------------- */

const W = 346
const H = 110
const PAD_TOP = 8

/** Card sparkline; the viewBox stretches to the container, the stroke stays 1.5px. */
export function Sparkline({ values, trend }: { values: number[]; trend: Trend }) {
  const id = useId()
  if (values.length < 2) return null
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const step = W / (values.length - 1)
  const pts = values.map((v, i) => ({
    x: +(i * step).toFixed(2),
    y: +(PAD_TOP + (1 - (v - min) / span) * (H - PAD_TOP)).toFixed(2),
  }))
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      preserveAspectRatio="none"
      className="chart-reveal block h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={TREND_FILL[trend]} stopOpacity="0.24" />
          <stop offset="1" stopColor={TREND_FILL[trend]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(pts, H)} fill={`url(#${id})`} />
      <path
        d={linePath(pts)}
        fill="none"
        style={{ stroke: TREND_COLOR[trend] }}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/* ------------------------------- price chart ------------------------------- */

export type Point = { timestamp: number; value: number }

const HEIGHT = 380
const MARGIN = { top: 16, right: 64, bottom: 28, left: 8 }
const PX_PER_X_LABEL = 110
const TOOLTIP_HALF_WIDTH = 70
const BG: Record<Trend, string> = {
  up: "bg-[#f3f8f4]",
  down: "bg-[#fbf5f4]",
  flat: "bg-[#f6f6f5]",
}

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const tickLabel = (t: number) => `$${money.format(t)}`
const dateLabel = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const tooltipLabel = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

/** Round a step size to a nice value (1/2/2.5/5 × 10^k) for axis ticks. */
function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min]
  const rough = (max - min) / (count - 1)
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].find((b) => rough / pow <= b) ?? 10) * pow
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6))
  return ticks
}

export function PriceChart({ points, trend }: { points: Point[]; trend: Trend }) {
  const id = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotLeft = MARGIN.left // constant, so not a memo dependency
  const plotW = Math.max(0, width - plotLeft - MARGIN.right)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom

  const { pts, ticks, min, span } = useMemo(() => {
    if (points.length < 2 || plotW <= 0) return { pts: [] as XY[], ticks: [], min: 0, span: 1 }
    const values = points.map((p) => p.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (min === max) {
      // A flat series still gets symmetric ticks around the line.
      min -= 0.06
      max += 0.06
    }
    const span = max - min
    const step = plotW / (points.length - 1)
    const pts = values.map((v, i) => ({
      x: +(plotLeft + i * step).toFixed(2),
      y: +(MARGIN.top + (1 - (v - min) / span) * plotH).toFixed(2),
    }))
    return { pts, ticks: niceTicks(min, max, 5), min, span }
  }, [points, plotW, plotH])

  const xTickIdx = useMemo(() => {
    if (pts.length === 0) return []
    const count = Math.max(2, Math.min(7, Math.floor(plotW / PX_PER_X_LABEL)))
    const idx = Array.from({ length: count }, (_, i) =>
      Math.round((i * (pts.length - 1)) / (count - 1)),
    )
    return [...new Set(idx)]
  }, [pts.length, plotW])

  const onMove = (e: React.PointerEvent) => {
    const el = containerRef.current
    if (pts.length === 0 || !el) return
    const x = e.clientX - el.getBoundingClientRect().left - plotLeft
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round((x / plotW) * (pts.length - 1)))))
  }

  const h = hover != null && pts[hover] ? hover : null

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-2xl ${BG[trend]}`}
      style={{ height: HEIGHT }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      {pts.length > 0 && (
        <svg width={width} height={HEIGHT} aria-hidden className="block max-w-full">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor={TREND_FILL[trend]} stopOpacity="0.22" />
              <stop offset="1" stopColor={TREND_FILL[trend]} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => {
            const y = MARGIN.top + (1 - (t - min) / span) * plotH
            return (
              <g key={t}>
                <line
                  x1={plotLeft}
                  x2={plotLeft + plotW}
                  y1={y}
                  y2={y}
                  stroke="#111827"
                  strokeOpacity="0.08"
                  strokeDasharray="3 4"
                />
                <text
                  x={width - MARGIN.right + 10}
                  y={y + 4}
                  fontSize="11"
                  fill="#83878b"
                  className="tabular"
                >
                  {tickLabel(t)}
                </text>
              </g>
            )
          })}
          {xTickIdx.map((i, n) => (
            <text
              key={points[i].timestamp}
              x={pts[i].x}
              y={HEIGHT - 8}
              fontSize="11"
              fill="#83878b"
              textAnchor={n === 0 ? "start" : n === xTickIdx.length - 1 ? "end" : "middle"}
            >
              {dateLabel(points[i].timestamp)}
            </text>
          ))}
          <path d={areaPath(pts, MARGIN.top + plotH)} fill={`url(#${id})`} className="chart-area" />
          <path
            d={linePath(pts)}
            fill="none"
            style={{ stroke: TREND_COLOR[trend] }}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="chart-line"
          />
          {h != null && (
            <g>
              <line
                x1={pts[h].x}
                x2={pts[h].x}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
                stroke="#6f7377"
                strokeDasharray="3 3"
              />
              <circle
                cx={pts[h].x}
                cy={pts[h].y}
                r="4.5"
                style={{ fill: TREND_COLOR[trend] }}
                stroke="#fff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      )}
      {h != null && (
        <div
          className="-translate-x-1/2 pointer-events-none absolute top-3 z-10 rounded-lg border border-line bg-white px-3 py-1.5 shadow-sm"
          style={{
            left: Math.max(TOOLTIP_HALF_WIDTH, Math.min(width - TOOLTIP_HALF_WIDTH, pts[h].x)),
          }}
        >
          <div className="tabular font-medium text-sm">{tickLabel(points[h].value)}</div>
          <div className="whitespace-nowrap text-[11px] text-soft">
            {tooltipLabel(points[h].timestamp)}
          </div>
        </div>
      )}
    </div>
  )
}
