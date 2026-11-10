# PMC Generator

**Build or read FANUC PMC ladders, right in your browser. Works on phone, tablet and PC.**

Live app: **https://yashpreetbathla.github.io/pmcgenerator/**

PMC Generator is a free tool for people who work with FANUC CNC PMC (ladder) programs:

- **Open a PMC backup** straight from a memory card (e.g. `PMC1.000`) and read the ladder, symbols, messages and I/O on your phone or PC.
- **Build a new PMC** by answering a few questions about the machine. You get a **draft** ladder, Symbol Comment table, alarm/operator messages and I/O map to finish in FANUC LADDER-III.

Nothing to install, no account, no server. Your files never leave your device.

---

## Contents

1. [Quick start](#quick-start)
2. [Open Backup: read a PMC file](#open-backup-read-a-pmc-file)
3. [Build PMC: generate a draft ladder](#build-pmc-generate-a-draft-ladder)
4. [Project view (ladder, symbols, messages, I/O)](#project-view)
5. [Saving, exporting and sharing (also on mobile)](#saving-exporting-and-sharing)
6. [Signals reference and LADDER-III terms](#signals-reference)
7. [Design](#design)
8. [Run locally](#run-locally)
9. [Deploy to GitHub Pages](#deploy-to-github-pages)
10. [Project structure](#project-structure)
11. [Supported backups](#supported-backups)
12. [Backup format notes (reverse-engineered)](#backup-format-notes-reverse-engineered)
13. [Known limitations](#known-limitations)
14. [Safety](#safety)
15. [Trademarks and license](#trademarks-and-license)

---

## Quick start

| I want to… | Do this |
| --- | --- |
| Read an existing machine's ladder | **Open** → choose the backup file → the project opens on the **Ladder** tab |
| Make a ladder for a new or retrofit machine | **Build** → tap **Next** through 6 steps → **Generate PMC** |
| Just look around | **Home → Try the demo** (a synthetic 2-axis lathe) |
| Find a standard signal (e.g. `*ESP`, `FIN`, `+J1`) | **Signals** → search |
| Get my work out | Project → **Export** (CSV / mnemonic text / JSON). On phones this opens the Share sheet |

On a phone, the bottom bar has **Home · Open · Build · Projects · Signals**. On desktop the same items are in the top bar.

---

## Open Backup: read a PMC file

1. Take a PMC backup to a memory card on the CNC (for example from the BOOT / ALL I/O screen; the exact steps depend on the control).
2. In the app go to **Open** and tap **Choose file** (or drag the file in on desktop). Any file name works, e.g. `PMC1.000`.
3. The file is decoded **on your device** and saved to **My Projects**.

What's decoded:

- **Title**: builder, machine, PMC type, control, ladder version, date and memo
- **System Parameter**: the memory map (X, Y, F, G, R, A, K, D, T, C, E… and their ranges)
- **Symbol Comment**: every address with its machine tag (e.g. `EMGPBI`, `+XMOVL`, `-XDIRI`) and comment
- **Message**: every A-address alarm (1000s) and operator message (2000s)
- **Ladder**: Level 1, Level 2 (and Level 3) nets, all basic instructions and functional instructions (TMRB, CODB with its table, MOVE, DCNV, COIN, DISPB, WINDR/WINDW, DIFU/DIFD, COM/COME, JMP/JMPE…)

The machine's own tags are kept exactly as they are in the backup.

---

## Build PMC: generate a draft ladder

A 6-step wizard. Every step has sensible defaults, so you can tap **Next** all the way through and still get a useful result. Your progress is saved on the device, so refreshing the phone doesn't lose anything.

| Step | What you choose |
| --- | --- |
| **1. Control & PMC type** | Any FANUC control (searchable). Its usual PMC types are listed first, and **every other PMC type can still be chosen** (marked "verify compatibility"). You can also pick **Custom control** and type any name. Memory sizes (levels, steps, X/Y, R, E, A, D, K) are shown for the selected PMC type |
| **2. Machine type** | Lathe (T), turn-mill, twin-spindle lathe, VMC, HMC, 5-axis, grinder, gantry/router, press/transfer, special-purpose, custom. You can also set axes and paths. The machine type preselects sensible options |
| **3. Options** | About 60 machine options in 14 groups (list below). Search, "select all in group", and per-option settings (timer presets, M-code numbers) |
| **4. Custom devices** | **Add anything**: any number of devices with your own inputs, outputs (switched by M-code or following an input) and alarms (with a trigger input) |
| **5. I/O assignment** | Every signal is auto-assigned to an **I/O Module** using standard FANUC addresses. You can edit any address, symbol tag or comment. Duplicates and invalid addresses are highlighted. **Re-assign automatically** rebuilds the map |
| **6. Summary** | Project name, builder, memo, notes to check, then **Generate PMC**. The project opens in the viewer |

### Controls and PMC types in the catalog

- **Controls:** 0i-TF Plus / MF Plus, 0i-TF / MF, 0i-PF, 0i-TD / MD, 0i Mate-TD / MD, 0i-TC / MC (+ Mate), 0i-TB / MB (+ Mate), 0i-TA / MA (+ Mate), 30i-B Plus, 31i-B5 Plus / 31i-B Plus, 32i-B Plus, 35i-B, 30i-B, 31i-B / B5, 32i-B, 30i/31i/32i-A, Power Motion i-A, Power Motion i-MODEL D, 16i/18i/21i-A and -B, Series 16/18-B/C, Series 21-B, Series 15-B / 15i, Series 0-TC / 0-MC, plus **Custom control**
- **PMC types:** PMC-SA1, SA3, SA5, SB7, 0i-D PMC, 0i-D PMC/L, 0i-F PMC, 0i-F PMC/L, 0i-F Plus PMC, DCS PMC (Dual Check Safety), PMC-RA1/RA3, RB3/RB4/RC3/RC4, RB5/RB6, PMC-NB/NB2, PMC-L/M (Series 0-C)

Memory sizes are typical values. Always check them against the FANUC PMC Programming Manual for your option set.

### Machine options (Step 3)

| Group | Options |
| --- | --- |
| CNC interface | M-code decode (MF / FIN), T-code (TF / TFIN), S-code (SF / SFIN) |
| Safety | Emergency stop chain, hardware overtravel limits, light curtain / safety mat, two-hand start |
| Operator panel | Mode select (EDIT / AUTO / MDI / DNC / JOG / HANDLE / REF), cycle start / feed hold, external reset, feed override (Gray-code rotary switch), spindle override, rapid override, jog buttons (+J / -J, rapid), MPG axis and multiplier, single block / block skip / dry run / machine lock, program protect key |
| Spindle | Spindle CW / CCW / stop (M03 / M04 / M05), orientation (M19), gear change (M41 / M42), sub-spindle, live tool, spindle / C-axis clamp, spindle oil cooler |
| Axes | Reference return dogs (*DEC), reference complete lamps, vertical axis brake, battery alarms (CNC + absolute encoder) |
| Tool changer | Turret (index by T-code), ATC arm type with carousel (M06), manual tool clamp (drawbar), tool life management |
| Workholding | Chuck (foot switch, ID / OD), collet, tailstock, steady rest, vise / fixture clamp, rotary table clamp, vacuum table, magnetic chuck |
| Coolant & lube | Flood coolant (M08 / M09), mist / air blow (M07), through-spindle coolant (M88 / M89), way lubrication |
| Hydraulics / pneumatics | Hydraulic unit, air pressure switch |
| Chip handling | Chip conveyor (fwd / rev / overload), dust extraction, mist collector |
| Doors | Door interlock (switch + lock), automatic door (M80 / M81) |
| Automation | Parts catcher, bar feeder interface, robot / loader interface, 2-pallet rotary APC |
| Measurement | Touch probe (skip X4.7), tool presetter arm (XAE), work counter |
| Misc | Signal tower lamps + buzzer, work light, electrical cabinet cooler |

### How the draft is generated

The generator is deterministic: the same answers always give the same ladder.

- **Standard I/O by default.** CNC↔PMC interface signals use the standard FANUC G/F addresses (e.g. `*ESP` G8.4, `*SP` G8.5, `ST` G7.2, `MD1/2/4` G43, `FIN` G4.3, `MF` F7.0, `TF` F7.3, `SF` F7.2, `+J1` G100.0, `-J1` G102.0, `*FV0–7` G12, `SOV0–7` G30, `ERS` G8.7, `RRW` G8.6). Fixed CNC inputs keep their addresses: E-stop X8.4, `*DEC` X9.n, skip X4.7, XAE X4.0/X4.1.
- **I/O allocation.** Machine-side signals go to the machine I/O Module (X0–X15 / Y0–Y7 by default). Operator-panel signals go to the panel module (X16–X31 / Y8–Y15). Rotary-switch and position-code bits go on bits 0–n of one byte.
- **Relays and messages.** Internal relays start at R100. Alarms use A bits numbered 1000+ and operator messages 2000+, shown with DISPB.
- **Program structure.** Level 1: E-stop, overtravel, spindle emergency stop. Level 2: M-code decoding, the option nets, then shared logic (cycle start permissives, feed hold, interlocks, spindle stop, MFIN/TFIN/SFIN → FIN, DISPB). Then END1 / END2 / END.
- **Alarm and operator messages for machine edge cases.** Covered cases include motion timeouts, sensor faults, overloads, low pressure or level, a door opened in AUTO, interlocked commands and strobe timeouts. Alarms stop or hold the machine; operator messages only inform.
- **Notes to check.** The summary lists warnings, for example: I/O capacity exceeded, address outside the PMC range, conflicting options or M-codes, timer/relay/message limits, multi-path left to complete, required CNC parameters (e.g. 3004#5 for hardware overtravel).

The output is a **draft** in LADDER-III terms (nets, Symbol Comment, Message, I/O Module). It is not a binary you can load straight into the control.

---

## Project view

Decoded backups, generated drafts and the demo all open in the same view, with LADDER-III terminology:

| Tab | What you see |
| --- | --- |
| **Title** | Builder, machine, control, PMC type, version, date, memo |
| **Ladder** | One continuous FANUC-style ladder with power rails, net numbers, contacts, coils on the right rail, and functional-instruction boxes with labelled parameters and CODB / COD tables. Filter by Level 1 / 2 / 3 / Subprogram, search by address, symbol or net number, show Symbol / Address / Both, zoom, or switch to the **Mnemonic** list |
| **Symbol Comment** | Searchable table (cards on phones) with area filter chips (X, Y, F, G, R, A, K, D, T, C, E…) and an "unused" badge |
| **Message** | A-address, number and text, with Alarm / Operator badges |
| **I/O Map** | X and Y bytes as 8-bit grids with tag names. Tap a bit for its symbol, comment and where it's used |
| **Cross Reference** | Pick any address and see every net where it's a contact, a coil or a functional-instruction parameter. Tap to jump to the net |
| **System Parameter** | The memory map |

Tap any address in the ladder to see its symbol, comment and where-used list.

---

## Saving, exporting and sharing

- **Auto-save on this device.** Every opened backup and generated draft is saved in the browser (localStorage) under **My Projects**.
- **My Projects:** open, rename, duplicate, delete, **export** as `*.pmcproj.json`, and **import** one or more project files. There's a storage bar showing the ~5 MB browser limit, and a clear message if storage is full.
- **Export from a project:** **PMC (memory card) `.000`** binary, Symbol Comment CSV, Message CSV, LADDER-III-style mnemonic list (`.txt`, one instruction per line with net and level separators), and project JSON.

### PMC binary export (`.000`)

**Project → Export → PMC (memory card) .000** writes a FANUC memory-card PMC file (FANUCROM, 0i-D PMC/L layout) to open in **FANUC LADDER-III** (File → Import, memory-card format).

| Project | Result |
| --- | --- |
| Decoded backup, unchanged | **Exact copy.** Byte-identical to the original file (verified by a round-trip test on a real 131,200-byte backup) |
| Decoded backup after edits, or a generated draft | **Experimental.** All sections (title, memory map, messages, Symbol Comment, ladder code, header pointers) are written, but a 68-byte header block (likely a scrambled signature or password) and the I/O Link assignment tables can't be generated yet, so LADDER-III may reject the file |

If LADDER-III rejects an exported file, please open an issue with the exact error message. A second backup of the same machine type (e.g. with and without a password) would help crack the remaining block.
- **On phones**, export opens the **native Share sheet** (Files, Google Drive, WhatsApp, email…). On desktop it downloads the file.
- **Install like an app:** use "Add to Home Screen" (web app manifest included).

---

## Signals reference

- **Standard signals:** 400+ CNC↔PMC interface signals (G = PMC→CNC, F = CNC→PMC), with search and filters by direction, category and Lathe / Mill. Addresses are for path 1 of 0i / 30i-series controls; check them against the Connection Manual (Function) for your control.
- **LADDER-III terms:** a glossary of Title, System Parameter, Symbol Comment, Message, I/O Module, Ladder, Level 1/2/3, Subprogram, Net, Contact, Coil, Functional Instruction, Mnemonic, Cross Reference, Signal Trace, and the K / D / T / C / A / R / E / X / Y / F / G areas.

---

## Design

The look is taken from the machine itself:

- **Charcoal bezel** top bar and bottom nav (like a CNC control panel), with a FANUC-yellow rule
- **FANUC-yellow pushbutton** primary actions with dark text, on a cool machine-grey panel face
- **Barlow / Barlow Semi Condensed** for text and headings (industrial, DIN-like), **IBM Plex Mono** for addresses and mnemonics
- Signal green for active contacts in the ladder, alarm red only for errors
- **Dark mode** (toggle in the top bar)
- **Mobile-first:** one wizard step per screen, sticky Back / Next, 44 px+ touch targets, no sideways page scrolling, and wide ladders scroll inside their own panel

---

## Run locally

Needs Node.js 20+.

```bash
git clone https://github.com/yashpreetbathla/pmcgenerator.git
cd pmcgenerator
npm install
npm run dev          # → http://localhost:3002/pmcgenerator/
```

`npm run dev` also listens on your network, so you can open the **Network** URL it prints (e.g. `http://192.168.x.x:3002/pmcgenerator/`) on a **phone on the same Wi-Fi** to test the mobile layout.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3002 with hot reload |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build on port 3002 |

To test the decoder against a real backup without committing it:

```bash
PMC_SAMPLE=/path/to/PMC1.000 npm test
```

**Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Zustand (persisted to localStorage), React Router (hash routing), Sonner (toasts), Lucide icons, Fontsource fonts (bundled, so it works offline).

---

## Deploy to GitHub Pages

Each push to `main` runs `.github/workflows/deploy.yml`. It installs dependencies, runs the tests, builds, and publishes `dist/` to **GitHub Pages** at https://yashpreetbathla.github.io/pmcgenerator/.

For a fork: in Settings → Pages, set **Source = GitHub Actions**. The Vite `base` defaults to `/pmcgenerator/`; set `BASE_PATH=/your-repo/` (or `/`) to change it. Hash routing means no server rewrite rules are needed.

---

## Project structure

```
src/
  core/                 pure logic, no UI, unit-tested
    types.ts            PmcProject model shared by decoder, generator and viewer
    decoder.ts          FANUC memory-card backup → PmcProject
    generator.ts        Build PMC config → PmcProject (deterministic draft)
    ladderTree.ts       stack instructions → series/parallel tree for drawing
    crossref.ts         where-used index
    encoder.ts          PmcProject → FANUC memory-card .000 binary
    pmcLayout.ts        binary layout constants, memory map rules, passthrough capture
    export.ts           CSV / mnemonic / JSON export
    subs.ts             functional instruction (SUB n) names
  data/
    controls.ts         FANUC controls, PMC types, memory maps, standard G/F used by generator
    machineTypes.ts     machine types and default options
    accessories.ts      option catalog: I/O, messages, settings, net templates
    ioModules.ts        I/O Link module types
    standardSignals.ts  400+ standard signals for the reference
    glossary.ts         LADDER-III terms
    demoProject.ts      synthetic demo lathe
  components/
    ui/                 buttons, fields, tabs, callouts
    ladder/             ladder diagram and mnemonic renderers
    Layout.tsx          top bar, bottom nav
  features/
    home/               Home, My Projects
    viewer/             Open Backup, Project view and tabs
    configurator/       Build PMC wizard
    reference/          Signals and glossary
  store/projects.ts     saved projects (localStorage)
```

---

## Supported backups

| Backup | Status |
| --- | --- |
| Memory-card `FANUCROM` PMC backups of **0i-D PMC/L** (e.g. 0i Mate-TD) | Verified: full ladder, symbols, comments and messages decode with 0 unknown words |
| Other 0i-D / 0i-F / 30i PMC types | May work, may differ. Please share samples |
| LADDER-III source files (`.LAD`) | Not supported |
| PMC parameter backups (K / D / T / C values) | Not supported yet (they're a separate file) |

If your backup doesn't open or looks wrong, open an issue and share a sample if you can (remove anything confidential).

---

## Backup format notes (reverse-engineered)

> These notes come from comparing real backups byte by byte. They are **not FANUC documentation**, may be incomplete, and may be wrong for other PMC types or versions.

| Item | Observation |
| --- | --- |
| Header | File starts with the ASCII marker `FANUCROM`; section header `PMC1` at `0x180` |
| Memory map | 16-byte records at **`0x5A4`**: area letter, byte offset within segment, segment id, size, first address number. X/Y/V share a segment (Y @ 0, X @ 128, V @ 512); G/F/U likewise (G @ 0, F @ 768, U @ 1536) |
| Title block | 32-character text fields at `0x21A0` (builder, machine, PMC type and control, version, date, memo) |
| Message index | One 4-byte offset per A bit at `0x22A0` |
| Messages | Byte-reversed text block; each message starts with its 4-digit number |
| Symbols | **24-byte records** from `0x4EA4`: 16-byte name, 4-byte comment offset, 4-byte address (the address field belongs to the *next* record) |
| Comments | One byte-reversed text block; each comment is sliced out using the offset differences |
| Address word | `area (10 bits) : bitAddress (16 bits)`, where area = segment × 8 and bitAddress = (segment offset + byte) × 8 + bit. Ladder code reads inputs through the mirror areas (V = X, U = F, W = M) |
| Basic instruction | 32-bit little-endian word: top byte = opcode (`04` RD, `08` RD.NOT, `0C` RD.STK, `10` RD.NOT.STK, `14` AND, `18` AND.NOT, `1C` AND.STK, `20` OR, `24` OR.NOT, `28` OR.STK, `38` WRT…) with its low 2 bits = area high bits |
| Functional instruction | Top bit `0x80`: second byte = word count including the header, low 16 bits = SUB number. Parameter words follow (numbers or encoded addresses). The `0xC0–0xC3` form has no parameter words (COM, COME, JMPE, END) |
| CODB / COD tables | 2-byte table entries follow the parameters, padded to 32-bit words |
| Levels | `SUB1 END1` → Level 2 → `SUB2 END2` → `SUB64 END` |
| Header pointers | Section starts and ends, record counts and text lengths, measured from 0x180 (e.g. symbol section end, comment text length, Level 1 size, code end). Sections are rounded up to 1 KiB |
| Level 1 vs Level 2 reads | Level 1 reads X / F / M directly; Level 2 reads them through the V / U / W mirror areas |
| Still unknown | 68 bytes at `0x22C–0x26F` (scrambled: the 3rd 16-byte group = 1st XOR `0x0B`) and the I/O Link assignment tables at `0x9AC–0xBAF` |

---

## Known limitations

- Only the 0i-D PMC/L backup layout is verified. Other PMC types need sample files.
- PMC `.000` export is exact only for unchanged decoded backups. Edited or generated files are experimental until the 68-byte header block is understood. 0i-F / 0i-F Plus drafts are written in the 0i-D PMC/L layout.
- Generated ladders are drafts. ATC / APC / turret sequences are simplified, and multi-path machines only get path-2 E-stop and feed hold automatically.
- Some functional-instruction format codes and timer limits must be checked against the FANUC manual for your PMC type.
- Projects live in browser storage (~5 MB). Export large projects to keep them safe.

---

## Safety

Generated ladders are **drafts for engineering review only**. Enter and verify every program in FANUC LADDER-III, check it against the machine's electrical drawings and the FANUC Connection Manual, and test it on the machine with every safety interlock working before use. Decoded views can be incomplete or wrong. PMC logic controls safety functions such as the door, chuck and E-stop interlocks, so never load anything onto a machine without checking it yourself. You use this software at your own risk (see the license).

---

## Trademarks and license

FANUC and LADDER-III are trademarks of FANUC Corporation. This project is independent and is not affiliated with, endorsed by or supported by FANUC. The demo project is synthetic and contains no proprietary machine data. No customer backup files are included in this repository.

[MIT](LICENSE) © yashpreetbathla
