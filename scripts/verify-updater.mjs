const DIST_REPO = "MarvelCollin/Polaris-dist";
const SOURCE_REPO = "MarvelCollin/Polaris";
const BRANCH = process.env.BRANCH ?? "updater";
const TOKEN = process.env.UPDATER_TOKEN ?? process.env.GITHUB_TOKEN ?? "";

const targets = process.env.REPO
  ? [{ repo: process.env.REPO, label: "override" }]
  : [
      { repo: DIST_REPO, label: "current endpoint, shipped since v2.12.1" },
      { repo: SOURCE_REPO, label: "legacy endpoint, baked into v2.8.0 to v2.12.0" },
    ];

let failed = 0;

function report(ok, label, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
}

function auth(accept) {
  const headers = { Accept: accept, "User-Agent": "polaris-updater-check" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  return headers;
}

function repoOf(url) {
  return url.match(/api\.github\.com\/repos\/([^/]+\/[^/]+)\//)?.[1] ?? null;
}

async function verify({ repo, label }) {
  const endpoint = `https://api.github.com/repos/${repo}/contents/latest.json?ref=${BRANCH}`;
  console.log("");
  console.log(`repo      ${repo}  (${label})`);
  console.log(`endpoint  ${endpoint}`);
  console.log("");

  const manifestRes = await fetch(endpoint, { headers: auth("application/vnd.github.raw") });
  report(manifestRes.ok, "manifest reachable", `HTTP ${manifestRes.status}`);

  if (!manifestRes.ok) {
    if (manifestRes.status === 404) {
      console.log("");
      console.log(`The ${BRANCH} branch or latest.json does not exist on ${repo}.`);
      console.log("It is created by the Publish updater manifest step on the next tagged release.");
    }
    if (manifestRes.status === 401) {
      console.log("");
      console.log("HTTP 401 means the token itself is rejected, not that access is missing.");
      console.log("api.github.com answers 401 for an invalid token even on a public repo, so an");
      console.log("app carrying a revoked token cannot even reach the manifest. Such a copy can");
      console.log("only be recovered by reinstalling from a fresh installer.");
    }
    if (manifestRes.status === 403) {
      console.log("");
      console.log(`Auth rejected. The token needs Contents: Read on ${repo}.`);
    }
    return;
  }

  const raw = await manifestRes.text();
  let manifest;
  try {
    manifest = JSON.parse(raw);
    report(true, "manifest parses as json");
  } catch {
    report(false, "manifest parses as json", raw.slice(0, 120));
    return;
  }

  const platform = manifest?.platforms?.["windows-x86_64"];
  report(typeof manifest.version === "string", "has version", manifest.version);
  report(/^\d+\.\d+\.\d+/.test(manifest.version ?? ""), "version is semver", manifest.version);
  report(Boolean(platform), "has windows-x86_64 platform");
  report(Boolean(platform?.signature), "has signature", `${platform?.signature?.length ?? 0} chars`);
  report(Boolean(platform?.url), "has installer url");

  if (platform?.signature) {
    const decoded = Buffer.from(platform.signature, "base64").toString("utf8");
    report(decoded.startsWith("untrusted comment:"), "signature is minisign format");
  }

  if (!platform?.url) return;

  report(platform.url.startsWith("https://api.github.com/"), "installer url uses the api form", platform.url.slice(0, 52) + "...");

  const installerRepo = repoOf(platform.url);
  const crossRepo = installerRepo !== null && installerRepo !== repo;
  if (crossRepo) {
    console.log(`note      manifest lives on ${repo} but the installer lives on ${installerRepo}`);
    console.log("          one token has to read both, or this endpoint checks green and then");
    console.log("          fails at download time");
  }

  const bin = await fetch(platform.url, { headers: auth("application/octet-stream") });
  report(bin.ok, "installer downloads", `HTTP ${bin.status}`);
  if (bin.ok) {
    const bytes = new Uint8Array(await bin.arrayBuffer());
    report(bytes.length > 100000, "installer is a real payload", `${(bytes.length / 1048576).toFixed(2)} MB`);
    report(bytes[0] === 0x50 && bytes[1] === 0x4b, "installer is a zip archive");
  } else if (crossRepo && bin.status === 404) {
    console.log("");
    console.log(`The token reads ${repo} but not ${installerRepo}.`);
    console.log(`Grant it Contents: Read on ${installerRepo}, or copies pointed at this`);
    console.log("endpoint will offer the update and then fail while downloading it.");
  }
}

console.log(`branch    ${BRANCH}`);
console.log(`token     ${TOKEN ? "supplied" : "none (public mode)"}`);

for (const target of targets) await verify(target);

console.log("");
console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
