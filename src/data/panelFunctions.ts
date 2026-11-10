/**
 * Operator-panel functions that only exist when a MOP pin uses them: extra lamps (alarm, program end, reset…),
 * lamps that follow another option's output, optional stop key, tool number display.
 * Same shape as an Accessory; included by the generator only when the pin map references one of their signals
 * and every option in `requires` is selected.
 */
import { stdAddr as g } from './controls'
import { OFF, and, andn, anyOf, fn, or, rd, rdn, wrt, type AccDef, type Accessory, type Ctx, type NetDef, type SigDef } from './accessories'

const N = (comment: string, ins: NetDef['ins']): NetDef => ({ comment, ins })
const lamp = (key: string, comment: string): SigDef => ({ key, comment, side: 'panel' })
const def = (d: Partial<AccDef>): AccDef => ({ inputs: d.inputs ?? [], outputs: d.outputs ?? [], alarms: d.alarms ?? [], mcodes: d.mcodes ?? [] })
const ref = (c: Ctx, id: string) => c.ref?.(id) ?? OFF

/** Lamp that follows the output / input of another option. */
const follow = (id: string, name: string, key: string, comment: string, requires: string, src: string, neg = false): Accessory => ({
  id, group: 'Operator panel', name, desc: comment, requires: [requires],
  define: () => def({ outputs: [lamp(key, comment)] }),
  nets: (c) => [N(comment, [neg ? rdn(ref(c, src)) : rd(ref(c, src)), wrt(c.y(key))])],
})
/** Lamp that follows a CNC status (F / G) signal. */
const status = (id: string, name: string, key: string, comment: string, sym: string): Accessory => ({
  id, group: 'Operator panel', name, desc: comment,
  define: () => def({ outputs: [lamp(key, comment)] }),
  nets: (c) => [N(`${comment} (${sym})`, [rd(g(sym)), wrt(c.y(key))])],
})

export const PANEL_FUNCS: Accessory[] = [
  { id: 'pf-alarm', group: 'Operator panel', name: 'Alarm lamp', desc: 'ON while the CNC (AL F1.0) or any PMC alarm is active.',
    define: () => def({ outputs: [lamp('ALARML', 'Alarm lamp (CNC or PMC alarm)')] }),
    nets: (c) => [N('Alarm lamp: CNC alarm AL or any PMC alarm', [rd(g('AL')), or(c.alm()), wrt(c.y('ALARML'))])] },
  { id: 'pf-progend', group: 'Operator panel', name: 'Program end lamp', desc: 'ON after M02 / M30 until the next cycle start or reset.',
    define: () => def({ outputs: [lamp('PRGENDL', 'Program end lamp (M02 / M30)')] }),
    nets: (c) => [N('Program end lamp: M02 / M30, cleared by cycle start or reset', [rd(g('DM30')), or(g('DM02')), or(c.y('PRGENDL')), andn(g('STL')), andn(g('RST')), wrt(c.y('PRGENDL'))])] },
  status('pf-resetl', 'Reset lamp', 'RSTL', 'Reset lamp', 'RST'),
  status('pf-stl', 'Cycle start lamp (extra)', 'STLL', 'Cycle start lamp — automatic operation running', 'STL'),
  status('pf-spl', 'Feed hold lamp (extra)', 'SPLL', 'Feed hold lamp', 'SPL'),
  status('pf-rapidl', 'Rapid traverse lamp', 'RPDL', 'Manual rapid traverse lamp', 'RT'),
  status('pf-refl', 'Reference return mode lamp', 'REFML', 'Reference return mode lamp', 'MREF'),
  { id: 'pf-zpall', group: 'Operator panel', name: 'All axes referenced lamp', desc: 'ON when every axis has completed reference return (ZPn F94).',
    define: () => def({ outputs: [lamp('ZPALLL', 'All axes reference return complete lamp')] }),
    nets: (c) => { const axs = c.axes.slice(0, 8); return [N('All axes referenced lamp (ZP1–ZPn)', [...(axs.length ? [rd('F94.0'), ...axs.slice(1).map((_, i) => and(`F94.${i + 1}`))] : [rd(OFF)]), wrt(c.y('ZPALLL'))])] } },
  { id: 'pf-optstop', group: 'Operator panel', name: 'Optional stop key (M01)', desc: 'Key toggles optional stop; M01 with optional stop ON holds the feed until cycle start is pressed. LED follows. Verify against your M01 handling.',
    define: () => def({ inputs: [{ key: 'OPTPBI', comment: 'Optional stop push button', side: 'panel' }], outputs: [lamp('OPTL', 'Optional stop LED')] }),
    nets: (c) => {
      const P = c.r('OPTP', 'Optional stop push button pulse'), ST = c.r('OPTR', 'Optional stop ON'), H = c.r('OPTH', 'Optional stop (M01) feed hold')
      const start = c.ref?.('cycle.CYSTPBI')
      c.hold(H)
      return [
        N('Optional stop: push button edge (DIFU)', [rd(c.x('OPTPBI')), fn('DIFU', [c.edge()]), wrt(P)]),
        N('Optional stop: ON/OFF toggle', [...anyOf([[rd(P), andn(ST)], [rd(ST), andn(P)]]), wrt(ST)]),
        N('Optional stop LED', [rd(ST), wrt(c.y('OPTL'))]),
        N('M01 with optional stop ON → feed hold until cycle start / reset', [rd(g('DM01')), and(ST), or(H), ...(start ? [andn(start)] : []), andn(g('RST')), wrt(H)]),
      ]
    } },
  { id: 'pf-tooldisp', group: 'Operator panel', name: 'Tool number display (BCD 1/2/4/8)', desc: 'Turret position code bits copied to the display outputs.', requires: ['turret'],
    define: () => def({ outputs: [1, 2, 4, 8].map((n) => lamp(`TDSP${n}O`, `Tool number display bit ${n}`)) }),
    nets: (c) => [1, 2, 4, 8].map((n) => N(`Tool number display bit ${n} (turret position code)`, [rd(ref(c, `turret.TPOS${n}I`)), wrt(c.y(`TDSP${n}O`))])) },
  follow('pf-lubl', 'Lube LED', 'LUBL', 'Lube pump running LED', 'lube', 'lube.LUBO'),
  follow('pf-lubflt', 'Lube fault lamp', 'LUBFLTL', 'Lube fault lamp (oil level low)', 'lube', 'lube.LUBLVLI', true),
  follow('pf-turl', 'Turret LED', 'TURL', 'Turret indexing LED (unclamped)', 'turret', 'turret.TUCLO'),
  follow('pf-tsl', 'Tailstock LED', 'TSL', 'Tailstock advanced LED', 'tailstock', 'tailstock.TSFWO'),
  follow('pf-chpfwl', 'Conveyor forward LED', 'CHPFWL', 'Chip conveyor forward LED', 'chipconv', 'chipconv.CHPFWO'),
  follow('pf-chprvl', 'Conveyor reverse LED', 'CHPRVL', 'Chip conveyor reverse LED', 'chipconv', 'chipconv.CHPRVO'),
  follow('pf-chkidl', 'Chuck ID LED', 'CHKIDL', 'Chuck ID clamp selected LED', 'chuck', 'chuck.CHKIDSWI'),
]

export const panelFuncById = (id: string) => PANEL_FUNCS.find((a) => a.id === id)
