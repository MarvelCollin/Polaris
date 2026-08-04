import { open } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";

async function getImageDir(): Promise<string> {
  const appData = await appDataDir();
  const dir = `${appData}images`;
  const dirExists = await exists(dir);
  if (!dirExists) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function pickAndSaveImage(): Promise<string | null> {
  const file = await open({
    title: "Pilih Gambar Produk",
    filters: [{ name: "Gambar", extensions: ["png", "jpg", "jpeg", "webp"] }],
    multiple: false,
  });

  if (!file) return null;

  const fileName = `${Date.now()}-${file.split(/[/\\]/).pop()}`;
  const imageDir = await getImageDir();
  const destPath = `${imageDir}/${fileName}`;

  const data = await readFile(file);
  await writeFile(destPath, data);

  return destPath;
}

export async function getImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const data = await readFile(path);
    const ext = path.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    const blob = new Blob([data], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
