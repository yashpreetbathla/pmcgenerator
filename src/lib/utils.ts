import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export const cn = (...i: ClassValue[]) => twMerge(clsx(i))
export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`

/** Save a file. On phones that support it, opens the native Share sheet (Files, Drive, WhatsApp, email…); otherwise downloads. */
export async function saveFile(content: string | Blob, filename: string, mime = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content
  const file = new File([blob], filename, { type: mime })
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
  const mobile = matchMedia('(pointer: coarse)').matches
  if (mobile && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: filename }); return 'shared' as const } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled' as const }
  }
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded' as const
}

export const toCsv = (rows: Record<string, unknown>[], cols: string[]) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')

export const DRAFT_NOTICE = 'Draft for engineering review. Enter and verify in FANUC LADDER-III, then test on the machine with all safety interlocks before use.'
