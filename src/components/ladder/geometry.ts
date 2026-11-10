/** Pixel geometry and colour palettes for the ladder canvas (derived from container width, zoom and label mode). */
import type { CSSProperties } from 'react'
import type { FunctionalInstruction } from '@/core/types'
import type { NetLayout } from './layout'

export type Display = 'both' | 'symbol' | 'address'

/* ---------------- geometry ---------------- */

export interface Geo {
  z: number
  cols: number
  cellW: number
  rowH: number
  wireY: number
  margin: number
  fs: number
  display: Display
  boxCols: number
  commentH: number
  msgH: number
  issueH: number
  padY: number
}

const CELL = 64
const MIN_COLS = 6
const MAX_COLS = 11
const PAD_R = 10

/** Zoom that shows a full minimum-width row (6 columns) on the current container. */
export function fitZoom(width: number) {
  return Math.min(1, Math.max(0.7, Math.floor((width / (46 + MIN_COLS * CELL + PAD_R)) * 20) / 20))
}

export function makeGeo(width: number, z: number, display: Display): Geo {
  const margin = Math.round(46 * z)
  const avail = Math.max(0, width - margin - PAD_R)
  const target = CELL * z
  const fitCols = Math.floor(avail / target)
  const cols = Math.min(MAX_COLS, Math.max(MIN_COLS, fitCols))
  const cellW = Math.floor(fitCols >= MIN_COLS ? Math.min(avail / cols, 140 * z) : target)
  const rowH = Math.round((display === 'both' ? 50 : 40) * z)
  return {
    z, cols, cellW, rowH, wireY: Math.round(24 * z), margin, fs: 10.5 * z, display,
    boxCols: Math.min(4, Math.max(2, Math.ceil((150 * z) / cellW))),
    commentH: Math.round(20 * z), msgH: Math.round(22 * z), issueH: Math.round(18 * z), padY: Math.round(4 * z),
  }
}

export const isDispb = (ins: FunctionalInstruction) => ins.name === 'DISPB'

/** Pixel lines inside a box: header to the ACT wire, then one per parameter (+ table / message summary). */
export function boxRows(g: Geo, ins: FunctionalInstruction) {
  const lines = ins.params.length + (ins.table?.length ? 1 : 0) + (isDispb(ins) ? 1 : 0)
  return Math.max(1, Math.ceil((g.wireY + 2 * g.z + lines * 14 * g.z + 6 * g.z) / g.rowH))
}

export function netHeight(g: Geo, l: NetLayout, hasComment: boolean, msgCount: number) {
  return g.padY * 2 + (hasComment ? g.commentH : 0) + l.h * g.rowH + msgCount * g.msgH + (l.issues.length ? g.issueH : 0)
}

export const netNo = (id: number) => `N${String(id).padStart(5, '0')}`

/* ---------------- palettes ---------------- */

export const LIGHT_VARS = {
  '--lad-bg': 'var(--color-surface)', '--lad-wire': 'var(--color-rung)', '--lad-fg': 'var(--color-fg)',
  '--lad-muted': 'var(--color-muted)', '--lad-sep': 'var(--color-border)', '--lad-box': 'var(--color-surface)',
  '--lad-num': 'var(--color-muted)', '--lad-margin': 'var(--color-surface-2)',
} as CSSProperties
export const PMC_VARS = {
  '--lad-bg': '#050806', '--lad-wire': '#3ee27a', '--lad-fg': '#f1f5f2', '--lad-muted': '#8fa69a',
  '--lad-sep': '#1c2a22', '--lad-box': '#050806', '--lad-num': '#c9f2d7', '--lad-margin': '#0d1510',
} as CSSProperties
