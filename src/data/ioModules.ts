/**
 * FANUC I/O Link modules (typical byte capacities — verify against the module's connection manual).
 * Each I/O Module occupies a contiguous X and Y byte range set in LADDER-III I/O Module assignment.
 */
export interface IoModuleType {
  id: string
  name: string
  xBytes: number
  yBytes: number
  desc: string
}

export const IO_MODULE_TYPES: IoModuleType[] = [
  { id: 'conn-basic', name: 'I/O module for connector panel (basic + MPG)', xBytes: 16, yBytes: 8, desc: '96 DI / 64 DO plus manual pulse generator interface (X0–X15 / Y0–Y7 typical).' },
  { id: 'conn-ext', name: 'I/O module for connector panel (expansion)', xBytes: 12, yBytes: 8, desc: '96 DI / 64 DO expansion module.' },
  { id: 'op-panel', name: 'I/O module for operator\'s panel', xBytes: 16, yBytes: 8, desc: '72 DI / 56 DO with MPG interface, for the machine operator\'s panel.' },
  { id: 'main-panel', name: 'Standard machine operator\'s panel (main panel A/B)', xBytes: 16, yBytes: 8, desc: 'FANUC standard operator\'s panel — key matrix + LEDs.' },
  { id: 'terminal', name: 'Terminal type I/O module', xBytes: 9, yBytes: 7, desc: '72 DI / 56 DO, screw terminals.' },
  { id: 'unit-a', name: 'I/O Unit-MODEL A (5/10-slot base)', xBytes: 16, yBytes: 16, desc: 'Slot-based DI/DO cards; size depends on cards fitted.' },
  { id: 'unit-b', name: 'I/O Unit-MODEL B (distributed)', xBytes: 16, yBytes: 16, desc: 'Interface unit + basic/extension units.' },
  { id: 'compact', name: 'I/O Link i compact / ET module', xBytes: 8, yBytes: 8, desc: 'Compact distributed I/O (ET type).' },
  { id: 'beta-io', name: 'βi servo amplifier with I/O Link (PMC axis)', xBytes: 16, yBytes: 16, desc: 'PMC-controlled axis: command/status via X/Y (e.g. turret, magazine).' },
  { id: 'custom', name: 'Custom module', xBytes: 16, yBytes: 8, desc: 'Any module — set the byte sizes yourself.' },
]

export type ModuleRole = 'machine' | 'panel' | 'any'

export interface IoModuleInst {
  id: string
  typeId: string
  name: string
  role: ModuleRole
  xStart: number
  yStart: number
  xBytes: number
  yBytes: number
}

export const moduleTypeById = (id: string) => IO_MODULE_TYPES.find((m) => m.id === id) ?? IO_MODULE_TYPES[IO_MODULE_TYPES.length - 1]

export function makeModule(typeId: string, i: number, role: ModuleRole, xStart: number, yStart: number, name?: string): IoModuleInst {
  const t = moduleTypeById(typeId)
  return { id: `m${i + 1}`, typeId, name: name ?? t.name, role, xStart, yStart, xBytes: t.xBytes, yBytes: t.yBytes }
}

/** Default: machine-side I/O at X0–X15/Y0–Y7, operator's panel at X16–X31/Y8–Y15. */
export const defaultModules = (): IoModuleInst[] => [
  makeModule('conn-basic', 0, 'machine', 0, 0, 'Machine side I/O'),
  makeModule('op-panel', 1, 'panel', 16, 8, 'Operator\'s panel'),
]

/** Next free start addresses after existing modules. */
export function nextStart(mods: IoModuleInst[]) {
  return {
    x: mods.reduce((m, x) => Math.max(m, x.xStart + x.xBytes), 0),
    y: mods.reduce((m, x) => Math.max(m, x.yStart + x.yBytes), 0),
  }
}
