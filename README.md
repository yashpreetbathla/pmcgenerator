# PMC Generator

**Build or read FANUC PMC ladders, right in your browser.**

Live app: **https://yashpreetbathla.github.io/pmcgenerator/**

PMC Generator is a free, browser-only tool for people who work with FANUC CNC PMC (ladder) programs. You can open a PMC backup straight from a memory card and read it on your phone or PC, or answer a few questions about a machine and get a **draft** ladder, symbol table and alarm messages to start from in FANUC LADDER-III.

There is no server and no account. Your files never leave your device.

## Features

- **Open Backup (decoder).** Pick a memory-card PMC backup (e.g. `PMC1.000`) and see the title block, memory map, symbols and comments, alarm/operator messages and the ladder nets.
- **Build PMC (configurator).** Choose the control, machine type, accessories and I/O modules. You get a draft PmcProject with standard interface signals, machine tags, messages and nets.
- **Viewer tabs.** The ladder diagram, mnemonic list, symbols, messages, memory map and cross reference look the same for decoded backups and generated drafts.
- **Signals reference.** A searchable list of 400+ standard CNC↔PMC signals (G/F, lathe/mill, by category), plus a glossary of LADDER-III terms.
- **My Projects.** Projects are saved on this device. You can rename, duplicate, delete, export and import them as `*.pmcproj.json`.
- **Mobile friendly.** Big touch targets. Export opens the native Share sheet on phones (Files, Drive, WhatsApp, email…). You can "Add to Home Screen" to use it like an app.
- **Private.** Everything runs locally in the browser.
- **Demo.** A small synthetic 2-axis lathe ladder lets you try the viewer without a file.

## Run locally

```bash
npm install
npm run dev        # → http://localhost:3002/pmcgenerator/
```

Other scripts: `npm test` (Vitest), `npm run typecheck`, `npm run build`, `npm run preview`.

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand (persisted to `localStorage`), React Router (hash routing, so GitHub Pages needs no server config).

## Deploy

Each push to `main` runs `.github/workflows/deploy.yml`. It installs dependencies, runs the tests, builds and publishes `dist/` to **GitHub Pages**. In the repository settings, set Pages → Source to "GitHub Actions". The Vite `base` defaults to `/pmcgenerator/`; override it with the `BASE_PATH` environment variable if needed.

## Supported backups

| Backup | Status |
| --- | --- |
| Memory-card `FANUCROM` backups of **0i-D PMC/L** | Verified |
| Other 0i-D / 0i-F / 30i PMC types | May work, may differ |
| LADDER-III source files (`.LAD`) | Not supported |

If your backup does not open or looks wrong, please open an issue and share a sample if you can (remove anything confidential). Every new layout helps.

## Backup format notes (empirical)

> These notes come from comparing real backups byte by byte. They are **not FANUC documentation**, may be incomplete, and may be wrong for other PMC types or versions.

| Item | Observation |
| --- | --- |
| Header | File starts with the ASCII marker `FANUCROM` |
| Memory map | Table of 16-byte records at **`0x5A4`**: area letter, segment offset, segment id, size, first address. Used to turn raw operand words back into `X/Y/F/G/R/E/A/K/D/T/C/…` addresses |
| Title block | Text fields at `0x21A0` (builder, machine, PMC type and control, version, date, memo) |
| Symbols | **24-byte records** from `0x4EA4`: 16-byte symbol name, 4-byte comment offset, 4-byte address (stored on the *next* record) |
| Comments and messages | Stored as **reversed** text blocks. Comments are found by offset. Messages are indexed by a 4-byte offset table at `0x22A0` (one entry per `A` bit) and begin with the 4-digit message number |
| Basic instruction | 32-bit word = **opcode \| area \| bitAddress**: top byte = opcode (RD, AND, OR, WRT, … low 2 bits = area high bits), next byte = area/segment, low 16 bits = `byte × 8 + bit` |
| Functional instruction | Top bit **`0x80`** marks a SUB header. The second byte is the **word count** including the header, the low 16 bits are the SUB number (e.g. 24 = TMRB, 27 = CODB). Parameter words follow. A compact `0xC0` form holds one inline parameter |
| CODB / COD tables | Conversion table data follows the CODB/COD parameters (width × entries, padded to 32-bit words) |
| Levels | `END1` / `END2` / `END3` / `END` split the program into Level 1, Level 2, Level 3 and end |

## Safety

Generated ladders are **drafts for engineering review only**. Enter and verify every program in FANUC LADDER-III, check it against the machine's electrical drawings and the FANUC Connection Manual, and test it on the machine with all safety interlocks working before use. Decoded views can be incomplete or wrong. Never load anything onto a machine without checking it yourself. You use this software at your own risk (see the [MIT License](LICENSE)).

Signal addresses in the reference are for path 1 of 0i-series / 30i-series controls and must be checked against the Connection Manual (Function) for your control.

## Trademarks

FANUC and LADDER-III are trademarks of FANUC Corporation. This project is independent and is not affiliated with, endorsed by or supported by FANUC. The demo project is synthetic and contains no proprietary machine data.

## License

[MIT](LICENSE) © yashpreetbathla
