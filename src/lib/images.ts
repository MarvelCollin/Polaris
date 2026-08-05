import { open } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";

const imageCache = new Map<string, { url: string; refCount: number }>();
const inflight = new Map<string, Promise<string | null>>();
const MAX_CACHE = 200;

let cachedImageDir: string | null = null;

async function getImageDir(): Promise<string> {
  if (cachedImageDir) return cachedImageDir;
  const appData = await appDataDir();
  const dir = `${appData}images`;
  const dirExists = await exists(dir);
  if (!dirExists) {
    await mkdir(dir, { recursive: true });
  }
  cachedImageDir = dir;
  return dir;
}

function evictOne() {
  for (const [key, entry] of imageCache) {
    if (entry.refCount <= 0) {
      URL.revokeObjectURL(entry.url);
      imageCache.delete(key);
      return;
    }
  }
}

function readAndCache(path: string): Promise<string | null> {
  const existing = inflight.get(path);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const data = await readFile(path);
      const ext = path.split(".").pop()?.toLowerCase() ?? "png";
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);

      if (imageCache.size >= MAX_CACHE) evictOne();
      imageCache.set(path, { url, refCount: 0 });
      return url;
    } catch {
      return null;
    } finally {
      inflight.delete(path);
    }
  })();

  inflight.set(path, promise);
  return promise;
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

export function acquireImageUrl(path: string): { promise: Promise<string | null>; release: () => void } {
  const cached = imageCache.get(path);
  if (cached) {
    cached.refCount++;
    return {
      promise: Promise.resolve(cached.url),
      release: () => releaseImageUrl(path),
    };
  }

  let cancelled = false;
  const promise = readAndCache(path).then((url) => {
    if (cancelled || !url) {
      if (cancelled) releaseImageUrl(path);
      return null;
    }
    const entry = imageCache.get(path);
    if (entry) entry.refCount++;
    return url;
  });

  return {
    promise,
    release: () => {
      cancelled = true;
    },
  };
}

function releaseImageUrl(path: string) {
  const cached = imageCache.get(path);
  if (!cached) return;
  cached.refCount--;
}

export function invalidateImageCache(path: string) {
  const cached = imageCache.get(path);
  if (cached) {
    URL.revokeObjectURL(cached.url);
    imageCache.delete(path);
  }
}

export async function getImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const cached = imageCache.get(path);
  if (cached) return cached.url;
  return readAndCache(path);
}
