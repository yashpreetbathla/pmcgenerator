import { setMaster, setSlave } from './StepCards'
import type { IoModuleInst } from '@/data/ioModules'
const m = (id: string, group: number) => ({ id, group } as unknown as IoModuleInst)
it('setMaster moves a card to group 0 and keeps the rest in order', () => {
  const r = setMaster([m('panel', 0), m('machine', 1), m('extra', 2)], 'machine')
  expect(Object.fromEntries(r.map((x) => [x.id, x.group]))).toEqual({ machine: 0, panel: 1, extra: 2 })
})
it('setSlave moves the master to the end and promotes the next card', () => {
  const r = setSlave([m('panel', 0), m('machine', 1)], 'panel')
  expect(Object.fromEntries(r.map((x) => [x.id, x.group]))).toEqual({ machine: 0, panel: 1 })
})
