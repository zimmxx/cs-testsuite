import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const publicRoot = path.resolve(projectRoot, "public", "sample-data", "wst");
const privateRoot = path.resolve(projectRoot, "private", "sample-data", "wst");
const publicManifests = ["library-index.json", "library-index-v2.json"];
const analyticsFile = "library-analytics.json";

function isDtuDataset(entry = {}) {
  return /(?:^|_)DTU(?:_|$)/i.test(`${entry.projectName || ""}_${entry.mpw || ""}_${entry.label || ""}`);
}

function assertInside(candidate, expectedRoot) {
  const resolved = path.resolve(candidate);
  if (resolved !== expectedRoot && !resolved.startsWith(`${expectedRoot}${path.sep}`)) {
    throw new Error(`Refusing to operate outside ${expectedRoot}: ${resolved}`);
  }
  return resolved;
}

async function readJson(filePath, fallback = []) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await mkdir(privateRoot, { recursive: true });

const primaryManifestPath = path.join(publicRoot, publicManifests[0]);
const primaryManifest = await readJson(primaryManifestPath);
const privateEntries = primaryManifest
  .filter(isDtuDataset)
  .map((entry) => ({
    ...entry,
    visibility: "private",
    accessGroups: ["dtu"],
    source: "private-library"
  }));

if (!privateEntries.length && !existsSync(path.join(privateRoot, "library-index.json"))) {
  throw new Error("No DTU datasets were found in the public manifest.");
}

if (privateEntries.length) await writeJson(path.join(privateRoot, "library-index.json"), privateEntries);
const effectivePrivateEntries = privateEntries.length
  ? privateEntries
  : await readJson(path.join(privateRoot, "library-index.json"));

for (const manifestName of publicManifests) {
  const manifestPath = path.join(publicRoot, manifestName);
  const entries = await readJson(manifestPath);
  await writeJson(manifestPath, entries.filter((entry) => !isDtuDataset(entry)));
}

const analyticsPath = path.join(publicRoot, analyticsFile);
const analytics = await readJson(analyticsPath);
const privateAnalytics = analytics.filter(isDtuDataset).map((entry) => ({ ...entry, visibility: "private", accessGroups: ["dtu"] }));
await writeJson(analyticsPath, analytics.filter((entry) => !isDtuDataset(entry)));
if (privateAnalytics.length || !existsSync(path.join(privateRoot, analyticsFile))) {
  await writeJson(path.join(privateRoot, analyticsFile), privateAnalytics);
}

for (const entry of effectivePrivateEntries) {
  const folderName = path.basename(String(entry.folder || ""));
  if (!folderName || !/^MPW47_DTU_/i.test(folderName)) throw new Error(`Unexpected DTU folder: ${folderName}`);
  const source = assertInside(path.join(publicRoot, folderName), publicRoot);
  const destination = assertInside(path.join(privateRoot, folderName), privateRoot);
  if (existsSync(source)) {
    if (existsSync(destination)) throw new Error(`Private destination already exists: ${destination}`);
    await rename(source, destination);
  }
  const routeConfig = path.join(destination, "route-config.json");
  const legacyWaveguideConfig = path.join(destination, "waveguide-config.json");
  if (existsSync(routeConfig) && !existsSync(legacyWaveguideConfig)) await copyFile(routeConfig, legacyWaveguideConfig);
}

await writeFile(path.join(privateRoot, "README.md"), `# Private WST measurement library\n\nThis local directory mirrors the public \`public/sample-data/wst/\` dataset package format, including \`README.md\`, \`metadata.json\`, \`route-config.json\`, \`waveguide-config.json\`, manifests, and trace files.\n\nIt is deliberately excluded from the public Git repository. Use the authenticated private-library API or a separate private GitHub repository; never move confidential partner data back into \`public/\`.\n`, "utf8");

console.log(`Private DTU library ready with ${effectivePrivateEntries.length} dataset packages in ${privateRoot}.`);
