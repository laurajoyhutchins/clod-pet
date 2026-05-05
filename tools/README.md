# Tools

Utility scripts for local debugging and test flow work.

## Scripts

- `repl.js` - interactive backend REPL for poking the HTTP API.
- `test-flow.js` - end-to-end backend flow sanity check.
- `capture-control-panel.js` - launches Electron, measures the control panel, and writes a PNG screenshot.

## Capture control panel

Run from the repo root after building the app:

```powershell
cd app
npm.cmd run build:ts
cd ..
node tools/capture-control-panel.js --out tools/control-panel-live.png
```

Useful flags:

- `--advanced` - render advanced settings expanded.
- `--diagnostics` - render diagnostics expanded.
- `--active-pets=<n>` - mock `n` active pets in the panel.
- `--delay=<ms>` - wait longer before measuring.
- `--after-resize-delay=<ms>` - wait longer after resizing before capture.

