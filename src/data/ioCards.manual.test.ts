/**
 * Independent verification of I/O card pin maps against FANUC connection manual B-64113EN/03 §9.1.4
 * (connector panel I/O module, HIROSE 50-pin, rows 01–25 × A/B) and the operator panel module CE56 / CE57.
 */
import { describe, expect, it } from 'vitest'
import { CARD_TEMPLATES, cardConnectors, makeCard, pinAddress, type PinDef } from './ioCards'
import type { IoModuleInst } from './ioModules'

const pinOf = (m: IoModuleInst, conn: string, sno: number): PinDef => {
  const c = cardConnectors(m).find((k) => k.name === conn)
  if (!c) throw new Error(`connector ${conn} missing`)
  const p = c.pins.find((x) => x.sno === sno)
  if (!p) throw new Error(`${conn}/${sno} missing`)
  return p
}
const addr = (m: IoModuleInst, conn: string, sno: number) => pinAddress(m, pinOf(m, conn, sno))

/** Expected HIROSE row label for S.No (S.No 2k+1 = A(k+1), 2k+2 = B(k+1)). */
const rowName = (sno: number) => `${sno % 2 ? 'A' : 'B'}${String(Math.ceil(sno / 2)).padStart(2, '0')}`

/** Ground truth per manual: input bytes (rows 02–05, 06–09, 10–13) and output bytes (rows 16–19, 20–23). */
const CB_TRUTH: Record<string, { inB: [number, number, number]; outB: [number, number] }> = {
  CB104: { inB: [0, 1, 2], outB: [0, 1] },
  CB105: { inB: [3, 8, 9], outB: [2, 3] },
  CB106: { inB: [4, 5, 6], outB: [4, 5] },
  CB107: { inB: [7, 10, 11], outB: [6, 7] },
}

/** Expected address of a pin from the manual tables (undefined for non-I/O pins). */
function expectedCb(conn: string, sno: number, xm: number, yn: number): string | undefined {
  const t = CB_TRUTH[conn]
  const row = Math.ceil(sno / 2), b = sno % 2 === 0 ? 1 : 0
  if (row >= 2 && row <= 13) { const i = (row - 2) * 2 + b; return `X${xm + t.inB[Math.floor(i / 8)]}.${i % 8}` }
  if (row >= 16 && row <= 23) { const i = (row - 16) * 2 + b; return `Y${yn + t.outB[Math.floor(i / 8)]}.${i % 8}` }
  return undefined
}
function expectedCbKind(conn: string, sno: number): string {
  const row = Math.ceil(sno / 2)
  if (row === 1) return sno === 1 ? '0V' : '24V'
  if (row <= 13) return 'DI'
  if (row <= 15) return conn === 'CB106' && sno === 27 ? 'COM' : 'NC'
  if (row <= 23) return 'DO'
  return '24E'
}

describe('connector panel I/O module (CB104–CB107) per B-64113EN/03 §9.1.4', () => {
  const card = makeCard('conn-cb', 'c1', { xStart: 0, yStart: 0 })

  it('has the four connectors with 50 pins each, labelled A01…B25', () => {
    const conns = cardConnectors(card)
    expect(conns.map((c) => c.name)).toEqual(['CB104', 'CB105', 'CB106', 'CB107'])
    for (const c of conns) {
      expect(c.pins.map((p) => p.sno)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
      for (const p of c.pins) expect(p.name, `${c.name}/${p.sno}`).toBe(rowName(p.sno))
    }
  })

  it('power / DOCOM / COM4 / empty pins match the manual', () => {
    for (const conn of Object.keys(CB_TRUTH)) {
      for (let sno = 1; sno <= 50; sno++) {
        const p = pinOf(card, conn, sno)
        expect(p.kind, `${conn}/${sno} (${rowName(sno)})`).toBe(expectedCbKind(conn, sno))
      }
      expect(addr(card, conn, 1)).toBeUndefined()
      expect(addr(card, conn, 2)).toBeUndefined()
      for (const s of [47, 48, 49, 50]) expect(pinOf(card, conn, s).kind).toBe('24E')
    }
    expect(pinOf(card, 'CB106', 27)).toMatchObject({ kind: 'COM', name: 'A14' })
  })

  it.each([[0, 0], [20, 8]])('every DI / DO pin address matches the manual (Xm = X%i, Yn = Y%i)', (xm, yn) => {
    const m = makeCard('conn-cb', 'c1', { xStart: xm, yStart: yn })
    for (const conn of Object.keys(CB_TRUTH)) for (let sno = 1; sno <= 50; sno++) expect(addr(m, conn, sno), `${conn}/${sno} (${rowName(sno)})`).toBe(expectedCb(conn, sno, xm, yn))
  })

  it('spot checks at Xm = X0, Yn = Y0', () => {
    expect(addr(card, 'CB104', 3)).toBe('X0.0')
    expect(addr(card, 'CB104', 4)).toBe('X0.1')
    expect(addr(card, 'CB104', 5)).toBe('X0.2')
    expect(addr(card, 'CB104', 26)).toBe('X2.7')
    expect(addr(card, 'CB104', 25)).toBe('X2.6')
    expect(addr(card, 'CB104', 31)).toBe('Y0.0')
    expect(addr(card, 'CB104', 46)).toBe('Y1.7')
    expect(addr(card, 'CB105', 3)).toBe('X3.0')
    expect(addr(card, 'CB105', 10)).toBe('X3.7')
    expect(addr(card, 'CB105', 11)).toBe('X8.0')
    expect(addr(card, 'CB105', 26)).toBe('X9.7')
    expect(addr(card, 'CB105', 31)).toBe('Y2.0')
    expect(addr(card, 'CB105', 46)).toBe('Y3.7')
    expect(addr(card, 'CB106', 3)).toBe('X4.0')
    expect(addr(card, 'CB106', 11)).toBe('X5.0')
    expect(addr(card, 'CB106', 26)).toBe('X6.7')
    expect(addr(card, 'CB106', 31)).toBe('Y4.0')
    expect(addr(card, 'CB106', 46)).toBe('Y5.7')
    expect(addr(card, 'CB106', 27)).toBeUndefined()
    expect(addr(card, 'CB107', 3)).toBe('X7.0')
    expect(addr(card, 'CB107', 11)).toBe('X10.0')
    expect(addr(card, 'CB107', 26)).toBe('X11.7')
    expect(addr(card, 'CB107', 31)).toBe('Y6.0')
    expect(addr(card, 'CB107', 46)).toBe('Y7.7')
  })

  it('spot checks at Xm = X20, Yn = Y8', () => {
    const m = makeCard('conn-cb', 'c2', { xStart: 20, yStart: 8 })
    expect(addr(m, 'CB104', 3)).toBe('X20.0')
    expect(addr(m, 'CB104', 26)).toBe('X22.7')
    expect(addr(m, 'CB104', 31)).toBe('Y8.0')
    expect(addr(m, 'CB104', 46)).toBe('Y9.7')
    expect(addr(m, 'CB105', 11)).toBe('X28.0')
    expect(addr(m, 'CB105', 31)).toBe('Y10.0')
    expect(addr(m, 'CB106', 11)).toBe('X25.0')
    expect(addr(m, 'CB107', 3)).toBe('X27.0')
    expect(addr(m, 'CB107', 11)).toBe('X30.0')
    expect(addr(m, 'CB107', 26)).toBe('X31.7')
    expect(addr(m, 'CB107', 46)).toBe('Y15.7')
  })

  it('96 DI / 64 DO, all addresses unique, X12–X15 not used by pins', () => {
    const seen = new Set<string>()
    let di = 0, dO = 0
    for (const c of cardConnectors(card)) for (const p of c.pins) {
      const a = pinAddress(card, p)
      if (!a) continue
      expect(seen.has(a), a).toBe(false)
      seen.add(a)
      if (p.kind === 'DI') di++; else dO++
    }
    expect([di, dO]).toEqual([96, 64])
    for (const b of [12, 13, 14, 15]) expect([...seen].some((a) => a.startsWith(`X${b}.`))).toBe(false)
    const t = CARD_TEMPLATES.find((x) => x.id === 'conn-cb')!
    expect([t.xBytes, t.yBytes]).toEqual([16, 8])
  })
})

describe('operator panel I/O module (CE56 / CE57)', () => {
  const xm = 16, yn = 8
  const card = makeCard('op-ce56', 'p1', { xStart: xm, yStart: yn })

  it('same row layout: CE56 = Xm+0.0–2.7 / Yn+0.0–1.7, CE57 = Xm+3.0–5.7 / Yn+2.0–3.7', () => {
    const truth: Record<string, { inB: number[]; outB: number[] }> = { CE56: { inB: [0, 1, 2], outB: [0, 1] }, CE57: { inB: [3, 4, 5], outB: [2, 3] } }
    expect(cardConnectors(card).map((c) => c.name)).toEqual(['CE56', 'CE57'])
    for (const conn of ['CE56', 'CE57']) for (let sno = 1; sno <= 50; sno++) {
      const row = Math.ceil(sno / 2), b = sno % 2 === 0 ? 1 : 0
      let exp: string | undefined
      if (row >= 2 && row <= 13) { const i = (row - 2) * 2 + b; exp = `X${xm + truth[conn].inB[Math.floor(i / 8)]}.${i % 8}` }
      else if (row >= 16 && row <= 23) { const i = (row - 16) * 2 + b; exp = `Y${yn + truth[conn].outB[Math.floor(i / 8)]}.${i % 8}` }
      expect(addr(card, conn, sno), `${conn}/${sno}`).toBe(exp)
      expect(pinOf(card, conn, sno).name).toBe(rowName(sno))
    }
  })

  it('spot checks', () => {
    expect(addr(card, 'CE56', 3)).toBe('X16.0')
    expect(addr(card, 'CE57', 3)).toBe('X19.0')
    expect(addr(card, 'CE57', 26)).toBe('X21.7')
    expect(addr(card, 'CE57', 31)).toBe('Y10.0')
    expect(addr(card, 'CE56', 31)).toBe('Y8.0')
    expect(addr(card, 'CE56', 46)).toBe('Y9.7')
    for (const conn of ['CE56', 'CE57']) {
      expect(pinOf(card, conn, 1).kind).toBe('0V')
      expect(pinOf(card, conn, 2).kind).toBe('24V')
      for (const s of [47, 48, 49, 50]) expect(pinOf(card, conn, s).kind).toBe('24E')
      for (const s of [27, 28, 29, 30]) expect(addr(card, conn, s)).toBeUndefined()
    }
  })
})
