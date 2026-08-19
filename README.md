# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Development

Windows: run `.\dev.ps1` instead of `pnpm tauri dev`. The `libsql-ffi` build script needs `cp.exe` (Git for Windows `usr\bin`) and `cmake.exe` on PATH; the script locates both and prepends them for that shell only.

Secrets live in `src-tauri/gdrive_secrets.toml` (gitignored). `src-tauri/build.rs` reads it and bakes the values in at compile time.
