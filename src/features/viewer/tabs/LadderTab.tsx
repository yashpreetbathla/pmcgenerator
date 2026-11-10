import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Filter, ListTree, Maximize2, Minus, Monitor, Plus } from 'lucide-react'
import { Button, Empty } from '@/components/ui'
import { NetView, VirtualStack, type NetItem } from '@/components/ladder/LadderCanvas'
import { boxRows, fitZoom, LIGHT_VARS, makeGeo, netHeight, netNo, PMC_VARS, type Display } from '@/components/ladder/geometry'
import { layoutNet, primAddresses } from '@/components/ladder/layout'
import { MNEMONIC_LINE, MnemonicList, mnemonicLineCount } from '@/components/ladder/MnemonicList'
import { findRefs } from '@/core/crossref'
import { parseAddress, type AlarmMessage } from '@/core/types'
import { cn } from '@/lib/utils'
import { SearchBox } from '../shared'
import { levelLabel, type LevelKey, type ProjectIndex } from '../useProjectIndex'

type Mode = 'diagram' | 'mnemonic'
interface ViewPrefs { display: Display; zoom: number | 'fit'; pmc: boolean }

const PREFS_KEY = 'pmc.ladder.view'
const ZOOMS = [0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75]
/** sticky app header + tab bar */
const SCROLL_OFFSET = 124
const MN_HEAD = 30

function loadPrefs(): ViewPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<ViewPrefs>
    return { display: p.display ?? 'both', zoom: p.zoom ?? 'fit', pmc: !!p.pmc }
  } catch { return { display: 'both', zoom: 'fit', pmc: false } }
}

/** Returns the set of net indexes matching a query (address, symbol/comment text, SUB name, or net number). */
function matchNets(idx: ProjectIndex, raw: string): Set<number> | null {
  const q = raw.trim().toUpperCase()
  if (!q) return null
  const out = new Set<number>()
  const netNum = /^N?(\d{1,5})$/.exec(q)
  if (netNum) { const i = idx.netById.get(Number(netNum[1])); if (i !== undefined) out.add(i) }
  if (parseAddress(q)) { for (const r of findRefs(idx.xref, q)) out.add(r.netIndex); return out }
  const addrs = new Set<string>()
  for (const s of idx.symbols.values()) if (s.symbol.toUpperCase().includes(q) || s.comment.toUpperCase().includes(q)) addrs.add(s.address)
  for (const a of addrs) for (const r of findRefs(idx.xref, a)) out.add(r.netIndex)
  idx.nets.forEach((n, i) => { if (n.instructions.some((ins) => ins.kind === 'sub' && ins.name === q)) out.add(i) })
  return out
}

/** Width of an element, tracked with ResizeObserver. */
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth - 2)
    const ro = new ResizeObserver(() => setW(el.clientWidth - 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export function LadderTab({ idx, focus, messages = [] }: { idx: ProjectIndex; focus?: { netId: number; nonce: number }; messages?: AlarmMessage[] }) {
  const [params] = useSearchParams()
  const [level, setLevel] = useState<'all' | LevelKey>('all')
  const [query, setQuery] = useState('')
  const [onlyHits, setOnlyHits] = useState(false)
  const [mode, setMode] = useState<Mode>('diagram')
  const [prefs, setPrefs] = useState(loadPrefs)
  const [selected, setSelected] = useState<number>()
  const [flash, setFlash] = useState<number>()
  const [cursor, setCursor] = useState(0)
  const [jump, setJump] = useState<{ netId: number; nonce: number }>()
  const dq = useDeferredValue(query)

  useEffect(() => { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) }, [prefs])

  const rootRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const width = useWidth(rootRef)

  const msgByAddr = useMemo(() => new Map(messages.map((m) => [m.address, m])), [messages])
  const msg = useCallback((a: string) => msgByAddr.get(a), [msgByAddr])

  /* ----- search ----- */
  const q = dq.trim().toUpperCase()
  const hits = useMemo(() => matchNets(idx, dq), [idx, dq])
  const hitSyms = useMemo(() => {
    if (!q || parseAddress(q)) return null
    const s = new Set<string>()
    for (const e of idx.symbols.values()) if (e.symbol.toUpperCase().includes(q) || e.comment.toUpperCase().includes(q)) s.add(e.address)
    return s
  }, [q, idx])
  const isHit = useMemo(() => {
    if (!q) return undefined
    const p = parseAddress(q)
    if (p) {
      const byte = `${p.area}${p.byte}`
      return (a: string) => a === q || (p.bit === undefined ? a.startsWith(byte + '.') : a === byte)
    }
    return (a: string) => !!hitSyms?.has(a)
  }, [q, hitSyms])

  /* ----- visible nets ----- */
  const filtered = useMemo(() => {
    const out: number[] = []
    idx.nets.forEach((n, i) => { if ((level === 'all' || n.levelKey === level) && (!onlyHits || !hits || hits.has(i))) out.push(i) })
    return out
  }, [idx, level, onlyHits, hits])
  const hitPositions = useMemo(() => (hits ? filtered.flatMap((ni, pos) => (hits.has(ni) ? [pos] : [])) : []), [filtered, hits])

  /* ----- geometry + layout ----- */
  const z = prefs.zoom === 'fit' ? fitZoom(width || 360) : prefs.zoom
  const g = useMemo(() => makeGeo(width || 360, z, prefs.display), [width, z, prefs.display])
  const opts = useMemo(() => ({ cols: g.cols, boxCols: g.boxCols, boxRows: (ins: Parameters<typeof boxRows>[1]) => boxRows(g, ins) }), [g])
  const items = useMemo<NetItem[]>(() => idx.nets.map((n) => {
    const layout = layoutNet(n.instructions, opts)
    const msgs = primAddresses(layout).flatMap((a) => (a.startsWith('A') && msgByAddr.has(a) ? [msgByAddr.get(a)!] : []))
    return { id: n.id, comment: n.comment, program: n.program, layout, msgs }
  }), [idx, opts, msgByAddr])

  const { tops, total, maxW } = useMemo(() => {
    const tops: number[] = []
    let y = 0, maxW = 0
    for (const ni of filtered) {
      tops.push(y)
      const it = items[ni]
      if (mode === 'diagram') { y += netHeight(g, it.layout, !!it.comment, it.msgs.length); maxW = Math.max(maxW, it.layout.w) }
      else y += MN_HEAD + mnemonicLineCount(idx.nets[ni].instructions) * MNEMONIC_LINE + 8
    }
    tops.push(y)
    return { tops, total: y, maxW }
  }, [filtered, items, g, mode, idx])
  const canvasW = mode === 'diagram' ? Math.max(width, g.margin + maxW * g.cellW + 12) : undefined

  /* ----- jumping ----- */
  const scrollToPos = useCallback((pos: number, smooth = true) => {
    const el = stackRef.current
    if (!el) return
    const y = el.getBoundingClientRect().top + scrollY + tops[pos] - SCROLL_OFFSET
    scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' })
  }, [tops])

  // External jumps (cross reference / address sheet / ?net= deep link)
  useEffect(() => { if (focus) setJump(focus) }, [focus])
  const netParam = Number(params.get('net'))
  useEffect(() => { if (netParam) setJump({ netId: netParam, nonce: -1 }) }, [netParam])
  // Switching Ladder ↔ Mnemonic keeps the selected net in view.
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const firstMode = useRef(true)
  useEffect(() => {
    if (firstMode.current) { firstMode.current = false; return }
    if (selectedRef.current) setJump({ netId: selectedRef.current, nonce: Date.now() })
  }, [mode])
  useEffect(() => {
    if (!jump || !width) return
    const ni = idx.netById.get(jump.netId)
    if (ni === undefined) { setJump(undefined); return }
    const pos = filtered.indexOf(ni)
    if (pos < 0) { setLevel('all'); setOnlyHits(false); return } // re-runs once the filter is cleared
    setJump(undefined)
    setFlash(jump.netId)
    setSelected(jump.netId)
    requestAnimationFrame(() => scrollToPos(pos, false))
    const t = setTimeout(() => setFlash(undefined), 2200)
    return () => clearTimeout(t)
  }, [jump, filtered, idx, width, scrollToPos])

  // New search → go to the first hit.
  useEffect(() => {
    setCursor(0)
    if (q && hitPositions.length) scrollToPos(hitPositions[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, onlyHits, level])
  const step = (d: number) => {
    if (!hitPositions.length) return
    const c = (cursor + d + hitPositions.length) % hitPositions.length
    setCursor(c)
    scrollToPos(hitPositions[c])
  }
  const currentHitNet = hitPositions.length ? idx.nets[filtered[hitPositions[Math.min(cursor, hitPositions.length - 1)]]]?.id : undefined

  const zoomStep = (d: number) => {
    const i = ZOOMS.findIndex((v) => v >= z - 0.001)
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? ZOOMS.length - 1 : i) + d))]
    setPrefs({ ...prefs, zoom: next })
  }

  if (!idx.nets.length) return <Empty icon={<ListTree />} title="No ladder program" text="This project has no nets." />

  const levels = [{ value: 'all' as const, label: 'All levels', count: idx.nets.length }, ...idx.levels.map((l) => ({ value: l.key, label: levelLabel(l.key).replace('Subprograms', 'Subprogram'), count: l.count }))]
  const searching = !!q

  return (
    <div ref={rootRef} className="space-y-2">
      {/* ---- screen options ---- */}
      <div className="space-y-2 rounded-xl border border-border bg-surface p-2">
        <div className="flex gap-2">
          <SearchBox value={query} onChange={setQuery} placeholder="Address, symbol, SUB or net no."
            className="[&_input]:h-11" />
          {searching && (
            <div className="flex shrink-0 items-center gap-1">
              <span className="hidden min-w-14 text-center text-xs text-muted tabular sm:inline">{hitPositions.length ? `${Math.min(cursor, hitPositions.length - 1) + 1}/${hitPositions.length}` : '0'}</span>
              <IconBtn label="Previous match" onClick={() => step(-1)} disabled={!hitPositions.length}><ChevronUp /></IconBtn>
              <IconBtn label="Next match" onClick={() => step(1)} disabled={!hitPositions.length}><ChevronDown /></IconBtn>
            </div>
          )}
        </div>
        <div className="-mx-2 flex items-center gap-2 overflow-x-auto px-2 pb-0.5 [scrollbar-width:none]">
          <select value={level} onChange={(e) => setLevel(e.target.value as 'all' | LevelKey)} aria-label="Level"
            className="h-11 shrink-0 rounded-lg border border-border bg-surface px-2 text-sm font-medium">
            {levels.map((l) => <option key={l.value} value={l.value}>{l.label} ({l.count})</option>)}
          </select>
          <Segmented label="View" value={mode} onChange={setMode} items={[{ value: 'diagram', label: 'Ladder' }, { value: 'mnemonic', label: 'Mnemonic' }]} />
          {mode === 'diagram' && (
            <>
              <Segmented label="Labels" value={prefs.display} onChange={(display) => setPrefs({ ...prefs, display })}
                items={[{ value: 'both', label: 'Both' }, { value: 'symbol', label: 'Symbol' }, { value: 'address', label: 'Addr' }]} />
              <div className="flex h-11 shrink-0 items-center rounded-lg border border-border" role="group" aria-label="Zoom">
                <IconBtn bare label="Zoom out" onClick={() => zoomStep(-1)} disabled={z <= ZOOMS[0]}><Minus /></IconBtn>
                <span className="w-10 text-center text-xs text-muted tabular">{Math.round(z * 100)}%</span>
                <IconBtn bare label="Zoom in" onClick={() => zoomStep(1)} disabled={z >= ZOOMS[ZOOMS.length - 1]}><Plus /></IconBtn>
                <IconBtn bare label="Fit to width" pressed={prefs.zoom === 'fit'} onClick={() => setPrefs({ ...prefs, zoom: 'fit' })}><Maximize2 /></IconBtn>
              </div>
              <IconBtn label="PMC screen colours" pressed={prefs.pmc} onClick={() => setPrefs({ ...prefs, pmc: !prefs.pmc })}><Monitor /></IconBtn>
            </>
          )}
          {searching && <IconBtn label="Show matching nets only" pressed={onlyHits} onClick={() => setOnlyHits(!onlyHits)}><Filter /></IconBtn>}
        </div>
      </div>
      <p className="px-1 text-xs text-muted tabular">
        {filtered.length === idx.nets.length ? `${idx.nets.length} nets` : `${filtered.length} of ${idx.nets.length} nets`}
        {searching && ` · ${hits?.size ?? 0} matching`}
        {mode === 'diagram' && <span className="hidden sm:inline"> · hover for comments, click an address for where-used</span>}
        {mode === 'diagram' && <span className="sm:hidden"> · tap an address for comment &amp; where-used</span>}
      </p>

      {!filtered.length ? (
        <Empty icon={<ListTree />} title="No nets match" text="Try an address like X8.4, a symbol, or a SUB name like TMRB."
          action={<Button onClick={() => { setQuery(''); setLevel('all'); setOnlyHits(false) }}>Clear filters</Button>} />
      ) : (
        <div className={cn('overflow-x-auto overscroll-x-contain rounded-xl border', prefs.pmc && mode === 'diagram' ? 'border-black' : 'border-border')}
          style={{ ...(prefs.pmc && mode === 'diagram' ? PMC_VARS : LIGHT_VARS), background: 'var(--lad-bg)' }}>
          {width > 0 && (
            <VirtualStack containerRef={stackRef} tops={tops} total={total} width={canvasW}
              render={(pos) => {
                const ni = filtered[pos]
                const it = items[ni]
                const top = tops[pos], height = tops[pos + 1] - top
                const mark = flash === it.id ? 'flash' : currentHitNet === it.id ? 'hit' : selected === it.id ? 'selected' : hits?.has(ni) ? 'match' : undefined
                if (mode === 'mnemonic') return <MnemonicNet key={it.id} id={it.id} top={top} height={height} comment={it.comment} program={it.program} mark={mark}>
                  <MnemonicList instructions={idx.nets[ni].instructions} isHit={isHit} />
                </MnemonicNet>
                return <NetView key={it.id} item={it} top={top} height={height} g={g} isHit={isHit} msg={msg} msgTotal={messages.length} mark={mark} onSelect={setSelected} />
              }} />
          )}
        </div>
      )}

      {/* Floating match navigation for phones (toolbar scrolls away) */}
      {searching && hitPositions.length > 0 && (
        <div className="fixed bottom-20 right-4 z-30 flex items-center gap-1 rounded-full border border-border bg-surface/95 p-1 shadow-lg backdrop-blur md:hidden">
          <span className="px-2 text-xs text-muted tabular">{Math.min(cursor, hitPositions.length - 1) + 1}/{hitPositions.length}</span>
          <IconBtn bare label="Previous match" onClick={() => step(-1)}><ChevronUp /></IconBtn>
          <IconBtn bare label="Next match" onClick={() => step(1)}><ChevronDown /></IconBtn>
        </div>
      )}
    </div>
  )
}

function MnemonicNet({ id, top, height, comment, program, mark, children }: { id: number; top: number; height: number; comment?: string; program?: string; mark?: string; children: ReactNode }) {
  return (
    <div id={`net-${id}`} className={cn('absolute inset-x-0 border-b border-border px-2', mark && mark !== 'match' && 'bg-accent-soft/60')} style={{ top, height }}>
      <div className="flex items-center gap-2 whitespace-nowrap" style={{ height: MN_HEAD }}>
        <span className={cn('font-mono text-sm font-semibold', mark === 'match' && 'rounded-sm bg-fanuc/50 px-1')}>{netNo(id)}</span>
        {program && <span className="text-xs text-muted">{program}</span>}
        {comment && <span className="min-w-0 truncate font-mono text-xs italic text-muted">{comment}</span>}
      </div>
      {children}
    </div>
  )
}

function IconBtn({ label, onClick, children, disabled, pressed, bare }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; pressed?: boolean; bare?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:text-fg disabled:opacity-35 [&_svg]:size-4',
        !bare && 'border border-border', pressed && 'bg-bezel text-fanuc! hover:text-fanuc')}>
      {children}
    </button>
  )
}

function Segmented<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="flex h-11 shrink-0 rounded-lg border border-border p-1" role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.value} type="button" onClick={() => onChange(it.value)} aria-pressed={value === it.value}
          className={cn('rounded-md px-2.5 text-sm font-medium text-muted hover:text-fg', value === it.value && 'bg-bezel text-bezel-fg hover:text-bezel-fg')}>
          {it.label}
        </button>
      ))}
    </div>
  )
}
