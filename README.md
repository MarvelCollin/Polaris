# Polaris

Point of sale desktop app for Sahabat Sentarum. Tauri 2 + React 19 + TypeScript, with a local SQLite database that syncs to Turso as an embedded replica so the app keeps working offline.

## Features

Sales and purchasing with returns and partial payments, customer accounts with per customer pricing, product and category management with images, receivables and payables tracking, a dashboard, ESC/POS thermal receipt printing, QRIS payments through Midtrans, automatic Google Drive backups, and in app updates.

## Development

Windows: run `.\dev.ps1` instead of `pnpm tauri dev`. The `libsql-ffi` build script needs `cp.exe` (Git for Windows `usr\bin`) and `cmake.exe` on PATH; the script locates both and prepends them for that shell only.

```
pnpm install
.\dev.ps1
pnpm test
```

## Secrets

Copy `src-tauri/gdrive_secrets.example.toml` to `src-tauri/gdrive_secrets.toml` and fill it in. That file is gitignored and has never been committed. `src-tauri/build.rs` reads it and bakes the values in at compile time, so a build without it still compiles but the Turso sync, Midtrans, Drive backup and updater features stay inactive.

In CI the same file is written from repository secrets: `MIDTRANS_SERVER_KEY`, `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN`, `TURSO_URL`, `TURSO_AUTH_TOKEN`, `UPDATER_TOKEN`.

## Releases

This repository holds source only. Because the built installer has the Midtrans, Turso and Google Drive credentials compiled into it, installers are never published here. Pushing a `v*` tag builds the app and publishes the installer to the private [Polaris-dist](https://github.com/MarvelCollin/Polaris-dist) repository, then writes an updater manifest to the `updater` branch there.

The app checks `https://api.github.com/repos/MarvelCollin/Polaris-dist/contents/latest.json?ref=updater` and authenticates with `UPDATER_TOKEN`, a fine grained token limited to read only Contents access on the dist repository. Two tokens are involved and they are not interchangeable:

| Secret | Used by | Access needed |
| --- | --- | --- |
| `DIST_TOKEN` | CI only, never shipped | Contents read and write on `Polaris-dist` |
| `UPDATER_TOKEN` | Compiled into the app | Contents read only on `Polaris-dist` |

Verify a published release end to end with:

```
GITHUB_TOKEN=<token with read access to Polaris-dist> node scripts/verify-updater.mjs
```
