const REPO = process.env.REPO ?? "MarvelCollin/Polaris";
const BRANCH = process.env.BRANCH ?? "updater";
const TOKEN = process.env.GITHUB_TOKEN ?? "";
const ENDPOINT = `https://api.github.com/repos/${REPO}/contents/latest.json?ref=${BRANCH}`;

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

console.log(`repo      ${REPO}`);
console.log(`branch    ${BRANCH}`);
console.log(`token     ${TOKEN ? "supplied" : "none (public mode)"}`);
console.log(`endpoint  ${ENDPOINT}`);
console.log("");

const manifestRes = await fetch(ENDPOINT, { headers: auth("application/vnd.github.raw") });
report(manifestRes.ok, "manifest reachable", `HTTP ${manifestRes.status}`);

if (!manifestRes.ok) {
  if (manifestRes.status === 404) {
    console.log("");
    console.log("The updater branch or latest.json does not exist yet.");
    console.log("It is created by the Publish updater manifest step on the next tagged release.");
  }
  if (manifestRes.status === 401 || manifestRes.status === 403) {
    console.log("");
    console.log("Auth rejected. If the repo is private the token needs read access to Contents.");
  }
  process.exit(1);
}

const raw = await manifestRes.text();
let manifest;
try {
  manifest = JSON.parse(raw);
  report(true, "manifest parses as json");
} catch {
  report(false, "manifest parses as json", raw.slice(0, 120));
  process.exit(1);
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

if (platform?.url) {
  report(platform.url.startsWith("https://api.github.com/"), "installer url uses the api form", platform.url.slice(0, 52) + "...");

  const bin = await fetch(platform.url, { headers: auth("application/octet-stream") });
  report(bin.ok, "installer downloads", `HTTP ${bin.status}`);
  if (bin.ok) {
    const bytes = new Uint8Array(await bin.arrayBuffer());
    report(bytes.length > 100000, "installer is a real payload", `${(bytes.length / 1048576).toFixed(2)} MB`);
    report(bytes[0] === 0x50 && bytes[1] === 0x4b, "installer is a zip archive");
  }
}

console.log("");
console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
