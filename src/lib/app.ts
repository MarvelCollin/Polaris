import { exit } from "@tauri-apps/plugin-process";

export async function closeApp(): Promise<void> {
  await exit(0);
}
