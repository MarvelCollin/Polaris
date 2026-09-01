import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import tauriConf from "../../src-tauri/tauri.conf.json";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const toLines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

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
    const lines = toLines(read("src-tauri/gdrive_secrets.example.toml"));
    expect(lines).toHaveLength(SECRET_KEYS.length);
    for (const line of lines) {
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

  it("verifies the endpoints with the token the app carries, not the dist token", () => {
    const verify = workflow.slice(workflow.indexOf("Verify both endpoints"));
    expect(verify).toContain("node scripts/verify-updater.mjs");
    expect(verify).toContain("UPDATER_TOKEN: ${{ secrets.UPDATER_TOKEN }}");
    expect(verify).not.toContain("secrets.DIST_TOKEN");
  });

  it("verifies only after both manifests are published", () => {
    expect(workflow.indexOf('publish_manifest "$GITHUB_REPOSITORY"'))
      .toBeLessThan(workflow.indexOf("Verify both endpoints"));
  });
});

describe("public migration build", () => {
  const workflow = read(".github/workflows/release.yml");

  it("is a single flag that can be turned off without touching the steps", () => {
    expect(workflow).toMatch(/^ {2}PUBLIC_MIGRATION: "(true|false)"$/m);
  });

  it("gates the public release on that flag", () => {
    expect(workflow).toContain("if: env.PUBLIC_MIGRATION == 'true'");
  });

  it("gives the legacy endpoint its own manifest so it can name the public copy", () => {
    expect(workflow).toContain('publish_manifest "$DIST_REPO" "$GH_TOKEN" "${RUNNER_TEMP}/latest.json"');
    expect(workflow).toContain('publish_manifest "$GITHUB_REPOSITORY" "$LEGACY_TOKEN" "${RUNNER_TEMP}/legacy.json"');
  });

  it("falls back to the private installer once the flag is off", () => {
    expect(workflow).toContain('cp "${RUNNER_TEMP}/latest.json" "${RUNNER_TEMP}/legacy.json"');
  });

  it("keeps the dist manifest on the private installer either way", () => {
    const dist = workflow.slice(workflow.indexOf('write_manifest "$(asset_url "$DIST_REPO"'));
    expect(dist.slice(0, 120)).toContain("$DIST_REPO");
  });

  it("never deletes the tag it was triggered by", () => {
    const step = workflow.slice(workflow.indexOf("Publish a public migration copy"), workflow.indexOf("Publish updater manifest"));
    expect(step).toContain('gh release delete "$TAG" --repo "$GITHUB_REPOSITORY" --yes');
    expect(step).not.toContain("--cleanup-tag");
  });
});

describe("updater verifier", () => {
  const script = read("scripts/verify-updater.mjs");

  it("checks the legacy endpoint as well as the current one", () => {
    expect(script).toContain(DIST_REPO);
    expect(script).toContain('SOURCE_REPO = "MarvelCollin/Polaris"');
  });

  it("prefers the baked token over whatever else is in the environment", () => {
    expect(script).toContain("process.env.UPDATER_TOKEN ?? process.env.GITHUB_TOKEN");
  });

  it("downloads the installer so a manifest that only looks right still fails", () => {
    expect(script).toContain('report(bin.ok, "installer downloads"');
  });

  it("names the repo the token is missing when the manifest and installer differ", () => {
    expect(script).toContain("installerRepo !== repo");
    expect(script).toContain("Contents: Read on ${installerRepo}");
  });

  it("proves the legacy installer is public, which is all the old token can read", () => {
    expect(script).toContain("anonymous: true");
    expect(script).toContain('"installer downloads without a token"');
  });
});
