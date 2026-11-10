export type MachineTypeId = 'lathe' | 'turnmill' | 'twin' | 'vmc' | 'hmc' | 'fiveaxis' | 'grinder' | 'gantry' | 'press' | 'spm' | 'custom'

export interface MachineType {
  id: MachineTypeId
  name: string
  desc: string
  series: 'T' | 'M' | 'any'
  axes: string[]
  paths: number
  /** Accessories selected by default (required ones are always added). */
  defaults: string[]
}

const PANEL = ['mode', 'cycle', 'feedovr', 'spovr', 'rapidovr', 'jog', 'mpg', 'prgfunc', 'memkey']
const BASE = ['estop', 'overtravel', 'decdog', 'mcode', 'tcode', 'scode', 'signaltower', 'worklight', 'absbattery', 'refdone']

export const MACHINE_TYPES: MachineType[] = [
  { id: 'lathe', name: 'Lathe (T)', desc: 'CNC turning centre with turret, chuck and tailstock', series: 'T', axes: ['X', 'Z'], paths: 1,
    defaults: [...BASE, ...PANEL, 'spindle', 'turret', 'chuck', 'tailstock', 'coolant', 'lube', 'hydraulic', 'chipconv', 'door'] },
  { id: 'turnmill', name: 'Turn-mill', desc: 'Lathe with live tooling, C-axis and Y-axis', series: 'T', axes: ['X', 'Y', 'Z', 'C'], paths: 1,
    defaults: [...BASE, ...PANEL, 'spindle', 'orient', 'livetool', 'spclamp', 'turret', 'chuck', 'tailstock', 'coolant', 'lube', 'hydraulic', 'chipconv', 'door'] },
  { id: 'twin', name: 'Twin-spindle lathe', desc: 'Main + sub-spindle, parts catcher', series: 'T', axes: ['X', 'Z', 'B'], paths: 2,
    defaults: [...BASE, ...PANEL, 'spindle', 'sp2', 'turret', 'chuck', 'coolant', 'lube', 'hydraulic', 'chipconv', 'door', 'partcatcher'] },
  { id: 'vmc', name: 'Vertical machining centre', desc: 'VMC with ATC, vise and flood coolant', series: 'M', axes: ['X', 'Y', 'Z'], paths: 1,
    defaults: [...BASE, ...PANEL, 'spindle', 'orient', 'atc', 'vise', 'coolant', 'lube', 'air', 'chipconv', 'door', 'axbrake'] },
  { id: 'hmc', name: 'Horizontal machining centre', desc: 'HMC with B-axis, pallet changer, through-spindle coolant', series: 'M', axes: ['X', 'Y', 'Z', 'B'], paths: 1,
    defaults: [...BASE, ...PANEL, 'spindle', 'orient', 'atc', 'rotclamp', 'apc', 'coolant', 'tsc', 'lube', 'hydraulic', 'air', 'chipconv', 'door', 'axbrake'] },
  { id: 'fiveaxis', name: '5-axis machining centre', desc: 'Trunnion / swivel head, A/C rotary axes', series: 'M', axes: ['X', 'Y', 'Z', 'A', 'C'], paths: 1,
    defaults: [...BASE, ...PANEL, 'spindle', 'orient', 'atc', 'rotclamp', 'coolant', 'tsc', 'lube', 'air', 'chipconv', 'door', 'probe', 'axbrake'] },
  { id: 'grinder', name: 'Grinder', desc: 'Cylindrical / surface grinder', series: 'T', axes: ['X', 'Z'], paths: 1,
    defaults: [...BASE, ...PANEL, 'spindle', 'coolant', 'lube', 'hydraulic', 'tailstock', 'door', 'mistcoll'] },
  { id: 'gantry', name: 'Gantry / router', desc: 'Router with vacuum table and dust extraction', series: 'M', axes: ['X', 'Y', 'Z'], paths: 1,
    defaults: [...BASE, ...PANEL, 'spindle', 'vacuum', 'dust', 'lube', 'air', 'axbrake'] },
  { id: 'press', name: 'Press / transfer', desc: 'Servo press or transfer line station', series: 'any', axes: ['X', 'Y'], paths: 1,
    defaults: ['estop', 'overtravel', 'decdog', 'mcode', 'signaltower', 'mode', 'cycle', 'feedovr', 'jog', 'twohand', 'lightcurtain', 'hydraulic', 'lube', 'air', 'workcounter'] },
  { id: 'spm', name: 'Special purpose machine', desc: 'Drilling / tapping / custom automation cell', series: 'any', axes: ['X', 'Z'], paths: 1,
    defaults: ['estop', 'overtravel', 'decdog', 'mcode', 'tcode', 'scode', 'signaltower', 'mode', 'cycle', 'feedovr', 'spovr', 'jog', 'mpg', 'spindle', 'coolant', 'hydraulic', 'air', 'workcounter', 'door'] },
  { id: 'custom', name: 'Custom', desc: 'Start minimal and pick everything yourself', series: 'any', axes: ['X', 'Y', 'Z'], paths: 1,
    defaults: ['estop', 'mcode', 'tcode', 'mode', 'cycle', 'feedovr', 'jog', 'signaltower'] },
]

export const machineById = (id: string) => MACHINE_TYPES.find((m) => m.id === id) ?? MACHINE_TYPES[MACHINE_TYPES.length - 1]
