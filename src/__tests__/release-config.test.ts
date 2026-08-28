import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import tauriConf from "../../src-tauri/tauri.conf.json";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const DIST_REPO = "MarvelCollin/Polaris-dist";
const SECRET_KEYS = [
  "midtrans_server_key",
  "client_id",
  "client_secret",
  "refresh_token",
  "turso_url",
  "turso_auth_token",
  "updater_token",
];

describe("updater endpoint", () => {
  const endpoints = tauriConf.plugins.updater.endpoints;

  it("points at the private dist repo", () => {
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toContain(DIST_REPO);
  });

  it("never serves installers from the public source repo", () => {
    for (const endpoint of endpoints) {
      expect(endpoint).not.toMatch(/repos\/MarvelCollin\/Polaris\//);
    }
  });

  it("uses the authenticated contents api so a private repo can answer", () => {
    expect(endpoints[0]).toMatch(/^https:\/\/api\.github\.com\/repos\/.+\/contents\/latest\.json\?ref=updater$/);
  });

  it("keeps the signing public key so a swapped installer is rejected", () => {
    expect(tauriConf.plugins.updater.pubkey).toBeTruthy();
    const decoded = Buffer.from(tauriConf.plugins.updater.pubkey, "base64").toString("utf8");
    expect(decoded).toContain("minisign public key");
  });

  it("builds the zip and signature the manifest refers to", () => {
    expect(tauriConf.bundle.createUpdaterArtifacts).toBe("v1Compatible");
  });
});

describe("secrets never reach the public repo", () => {
  it("keeps the real secrets file ignored", () => {
    expect(read(".gitignore")).toContain("src-tauri/gdrive_secrets.toml");
  });

  it("ships an example that covers every key build.rs reads", () => {
    const buildRs = read("src-tauri/build.rs");
    const example = read("src-tauri/gdrive_secrets.example.toml");
    for (const key of SECRET_KEYS) {
      expect(buildRs).toContain(`"${key}"`);
      expect(example).toContain(`${key} = ""`);
    }
  });

  it("leaves no value in the example file", () => {
    const example = read("src-tauri/gdrive_secrets.example.toml");
    for (const line of example.split("\n").filter(Boolean)) {
      expect(line).toMatch(/^\w+ = ""$/);
    }
  });
});

describe("release workflow", () => {
  const workflow = read(".github/workflows/release.yml");

  it("publishes installers to the dist repo", () => {
    expect(workflow).toContain(`DIST_REPO: ${DIST_REPO}`);
    expect(workflow).toContain('--repo "$DIST_REPO"');
  });

  it("uses a dist token that is separate from the token baked into the app", () => {
    expect(workflow).toContain("secrets.DIST_TOKEN");
    expect(workflow).toContain("secrets.UPDATER_TOKEN");
  });

  it("runs the test suite before it builds", () => {
    expect(workflow.indexOf("pnpm test")).toBeLessThan(workflow.indexOf("tauri-action"));
  });

  it("still refreshes the old endpoint so installed copies can migrate", () => {
    expect(workflow).toContain('publish_manifest "$GITHUB_REPOSITORY"');
  });
});
