function slugify(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function titleizeToken(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeOverrideText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function arrayMin(values, fallback = null) {
  if (!values.length) return fallback;
  return values.reduce((min, value) => (value < min ? value : min), values[0]);
}

function arrayMax(values, fallback = null) {
  if (!values.length) return fallback;
  return values.reduce((max, value) => (value > max ? value : max), values[0]);
}

function summarizeWavelength(rows) {
  const values = rows
    .map((row) => Number(row.wavelength_nm))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { min: null, max: null };
  }
  return { min: arrayMin(values), max: arrayMax(values) };
}

function joinedDatasetText(projectName, waferName, sourceMeta = {}, rows = []) {
  return [
    projectName,
    waferName,
    sourceMeta.name,
    sourceMeta.type,
    sourceMeta.platform,
    sourceMeta.platformId,
    sourceMeta.buildingBlock,
    sourceMeta.buildingBlockId,
    sourceMeta.notes,
    ...rows.slice(0, 24).map((row) => row.source_name || "")
  ].filter(Boolean).join(" ");
}

function inferDatasetTokens(projectName, waferName, sourceMeta = {}, rows = []) {
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  const mpwMatch = joined.match(/\b(MPW(?:\s*[_-]?\s*[A-Z0-9]+)+)\b/i);
  const slotMatch = joined.match(/Slot\s*([0-9]+)/i);
  const typeMatch = joined.match(/\b(rib|strip|slot)\b/i);
  const modeMatch = /manual/i.test(joined)
    ? "manual"
    : /automated|wst/i.test(joined)
      ? "wst"
      : "measurement";

  return {
    mpw: mpwMatch ? slugify(mpwMatch[1]).toUpperCase() : "Measurement",
    slot: slotMatch ? `Slot${slotMatch[1]}` : "SlotUndefined",
    waveguideType: typeMatch ? typeMatch[1].toLowerCase() : "waveguide",
    mode: modeMatch
  };
}

function inferPlatform(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.platformId || sourceMeta.platform || "").replace(/[_\s-]+/g, "").toLowerCase();
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows).replace(/[_\s-]+/g, "").toLowerCase();
  const normalized = explicit || joined;

  if (normalized.includes("220nmsoiactive")) return { id: "220nm_soi_active", label: "220nm SOI Active" };
  if (normalized.includes("220nmsoipassive")) return { id: "220nm_soi_passive", label: "220nm SOI Passive" };
  if (normalized.includes("220nmsoi")) return { id: "220nm_soi", label: "220nm SOI" };
  if (normalized.includes("340nmsoi")) return { id: "340nm_soi", label: "340nm SOI" };
  if (normalized.includes("500nmsoi")) return { id: "500nm_soi", label: "500nm SOI" };
  if (normalized.includes("300nmsin")) return { id: "300nm_sin", label: "300nm SiN" };
  if (normalized.includes("geonsi")) return { id: "ge_on_si", label: "Ge-on-Si" };
  return { id: "platform_undefined", label: "Platform Undefined" };
}

function inferMeasurementType(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.measurementType || "");
  if (/heater|mzi/i.test(explicit)) return "HeaterEfficiency";
  if (/insertion|\bil\b/i.test(explicit)) return "InsertionLoss";
  if (/propagation/i.test(explicit)) return "PropagationLoss";

  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  if (/heater|mzi/i.test(joined)) return "HeaterEfficiency";
  if (/insertion|\bil\b/i.test(joined)) return "InsertionLoss";
  return "PropagationLoss";
}

function inferWaveguideType(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.waveguideType || sourceMeta.waveguideDescriptor || "");
  if (/rib/i.test(explicit)) return { id: "rib", label: "Rib" };
  if (/strip/i.test(explicit)) return { id: "strip", label: "Strip" };

  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows);
  if (/rib/i.test(joined)) return { id: "rib", label: "Rib" };
  if (/strip/i.test(joined)) return { id: "strip", label: "Strip" };
  return { id: "waveguide", label: "Waveguide" };
}

function inferBuildingBlock(sourceMeta = {}, rows = [], projectName = "", waferName = "") {
  const explicit = String(sourceMeta.buildingBlockId || sourceMeta.buildingBlock || "").trim();
  if (explicit) {
    return {
      id: slugify(explicit).toLowerCase(),
      label: titleizeToken(explicit)
    };
  }

  const measurementType = inferMeasurementType(sourceMeta, rows, projectName, waferName);
  const waveguideType = inferWaveguideType(sourceMeta, rows, projectName, waferName);
  const joined = joinedDatasetText(projectName, waferName, sourceMeta, rows).toLowerCase();

  if (measurementType === "PropagationLoss") {
    if (waveguideType.id === "rib") return { id: "propagation_loss_rib", label: "Propagation Loss Rib" };
    if (waveguideType.id === "strip") return { id: "propagation_loss_strip", label: "Propagation Loss Strip" };
    return { id: "propagation_loss_waveguide", label: "Propagation Loss Waveguide" };
  }
  if (/mmi/i.test(joined)) return { id: "mmi", label: "MMI" };
  if (/cross/i.test(joined)) return { id: "crossing", label: "Crossing" };
  if (/grating|\bgc\b/i.test(joined)) return { id: "grating_coupler", label: "Grating Coupler" };
  if (/mzi/i.test(joined)) return { id: "mzi", label: "MZI" };
  return { id: slugify(measurementType).toLowerCase() || "measurement_block", label: titleizeToken(measurementType) || "Measurement Block" };
}

export function inferDatasetIdentity({ projectName = "", waferName = "", sourceMeta = {}, rows = [], selectedDate = "" }) {
  const tokens = inferDatasetTokens(projectName, waferName, sourceMeta, rows);
  const chipIds = unique(rows.map((row) => row.chip_id));
  const waveguides = unique(rows.map((row) => row.waveguide_id));
  const sourceNames = unique(rows.map((row) => row.source_name));
  const wavelength = summarizeWavelength(rows);
  const label = `${tokens.mpw} ${tokens.slot} ${titleizeToken(tokens.waveguideType)} ${tokens.mode === "manual" ? "Manual" : "WST"} Raw Data`;
  const folderName = `${tokens.mpw}_${tokens.slot}_${tokens.waveguideType}_${tokens.mode}_data`;
  const projectLabel = projectName || `${tokens.mpw}_${tokens.slot}_${titleizeToken(tokens.waveguideType).replace(/\s+/g, "_")}`;
  const waferLabel = waferName || unique(rows.map((row) => row.wafer_label))[0] || `${tokens.mpw}_${tokens.slot}_${tokens.waveguideType}`;
  const platform = inferPlatform(sourceMeta, rows, projectName, waferName);
  const measurementType = inferMeasurementType(sourceMeta, rows, projectName, waferName);
  const waveguideType = inferWaveguideType(sourceMeta, rows, projectName, waferName);
  const buildingBlock = inferBuildingBlock(sourceMeta, rows, projectName, waferName);

  return {
    id: slugify(folderName).toLowerCase(),
    label,
    folderName,
    projectName: projectLabel,
    waferName: waferLabel,
    selectedDate,
    mpw: tokens.mpw,
    slot: tokens.slot,
    waveguideType: titleizeToken(tokens.waveguideType),
    measurementMode: tokens.mode === "manual" ? "Manual converted" : tokens.mode === "wst" ? "Automated WST" : "Measurement",
    sourceType: sourceMeta.type || (tokens.mode === "manual" ? "Manual converted trace set" : "Automated WST trace set"),
    sourceNames,
    sourceCount: sourceNames.length,
    chipCount: chipIds.length,
    waveguideCount: waveguides.length,
    rowCount: rows.length,
    wavelengthMinNm: wavelength.min,
    wavelengthMaxNm: wavelength.max,
    platformId: platform.id,
    platformLabel: platform.label,
    buildingBlockId: buildingBlock.id,
    buildingBlockLabel: buildingBlock.label,
    measurementType,
    waveguideFamily: waveguideType.label,
    legacyFolder: `sample-data/wst/${folderName}`
  };
}

export function applyDatasetNamingOverrides(identity, namingOverrides = {}) {
  if (!namingOverrides || typeof namingOverrides !== "object") return identity;

  const nextLabel = normalizeOverrideText(namingOverrides.label, identity.label);
  const nextFolderName = slugify(normalizeOverrideText(namingOverrides.folderName, identity.folderName)) || identity.folderName;
  const nextProjectName = normalizeOverrideText(namingOverrides.projectName, identity.projectName);
  const nextSlot = normalizeOverrideText(namingOverrides.slot, identity.slot);
  const nextPlatformLabel = normalizeOverrideText(namingOverrides.platformLabel, identity.platformLabel);
  const nextBuildingBlockLabel = normalizeOverrideText(namingOverrides.buildingBlockLabel, identity.buildingBlockLabel);

  return {
    ...identity,
    label: nextLabel,
    folderName: nextFolderName,
    id: slugify(nextFolderName).toLowerCase() || identity.id,
    projectName: nextProjectName,
    waferName: normalizeOverrideText(namingOverrides.waferName, identity.waferName),
    mpw: normalizeOverrideText(namingOverrides.mpw || namingOverrides.projectName, identity.mpw),
    slot: nextSlot,
    platformLabel: nextPlatformLabel,
    buildingBlockLabel: nextBuildingBlockLabel,
    legacyFolder: `sample-data/wst/${nextFolderName}`
  };
}

function formatNumber(value, digits = 1) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

function formatDateLabel(selectedDate) {
  return selectedDate || new Date().toISOString().slice(0, 10);
}

function upgradeManifestEntryToV2(entry = {}) {
  if ((entry.schemaVersion || entry.librarySchemaVersion) >= 2) return entry;
  return {
    schemaVersion: 2,
    datasetId: entry.datasetId || entry.id,
    id: entry.id || entry.datasetId || entry.label,
    label: entry.label,
    projectName: entry.projectName,
    waferName: entry.waferName,
    selectedDate: entry.selectedDate,
    folder: entry.folder,
    traceFolder: entry.folder,
    sourceType: entry.sourceType,
    measurementMode: entry.measurementMode,
    measurementType: entry.measurementType || "PropagationLoss",
    mpw: entry.mpw,
    slot: entry.slot,
    waveguideType: entry.waveguideType,
    waveguideFamily: entry.waveguideFamily || entry.waveguideType,
    platformId: entry.platformId || "platform_undefined",
    platformLabel: entry.platformLabel || "Platform Undefined",
    buildingBlockId: entry.buildingBlockId || "measurement_block",
    buildingBlockLabel: entry.buildingBlockLabel || "Measurement Block",
    traceCount: entry.traceCount,
    rowCount: entry.rowCount,
    chipCount: entry.chipCount,
    waveguideCount: entry.waveguideCount,
    wavelengthMinNm: entry.wavelengthMinNm,
    wavelengthMaxNm: entry.wavelengthMaxNm,
    files: entry.files || [],
    readme: entry.readme,
    metadataFile: entry.metadataFile || "",
    configFile: entry.configFile || "",
    waveguideConfig: entry.waveguideConfig || null,
    copiedToFolder: true,
    processedInTestingSuite: true,
    notes: entry.notes || "",
    source: entry.source || "github-library",
    librarySchemaVersion: 2
  };
}

function sortWaveguideLengthEntries(lengthMap = {}) {
  return Object.entries(lengthMap || {})
    .map(([key, value]) => [Number(key), Number(value)])
    .filter(([key, value]) => Number.isFinite(key) && Number.isFinite(value))
    .sort((a, b) => a[0] - b[0]);
}

export function buildWaveguideConfig(sourceMeta = {}) {
  const waveguideLengths = sortWaveguideLengthEntries(sourceMeta.waveguideLengthByIndex).map(([index, lengthMm]) => ({
    index,
    lengthMm
  }));

  return {
    propagationWaveguideCount: Number(sourceMeta.propagationWaveguideCount) || waveguideLengths.length || 0,
    propagationWaveguideStartMm: Number.isFinite(Number(sourceMeta.propagationWaveguideStartMm))
      ? Number(sourceMeta.propagationWaveguideStartMm)
      : null,
    propagationWaveguideIntervalMm: Number.isFinite(Number(sourceMeta.propagationWaveguideIntervalMm))
      ? Number(sourceMeta.propagationWaveguideIntervalMm)
      : null,
    propagationWaveguideManualMode: Boolean(sourceMeta.propagationWaveguideManualMode),
    waveguideLengths
  };
}

export function buildDatasetMetadata(dataset, identity, traceFiles, waveguideConfig) {
  const sourceMeta = dataset?.sourceMeta || {};
  return {
    schemaVersion: 2,
    datasetId: identity.id,
    label: identity.label,
    projectName: identity.projectName,
    waferName: identity.waferName,
    selectedDate: identity.selectedDate,
    mpwRun: identity.mpw,
    slot: identity.slot,
    platform: identity.platformLabel,
    platformId: identity.platformId,
    buildingBlock: identity.buildingBlockLabel,
    buildingBlockId: identity.buildingBlockId,
    measurementType: identity.measurementType,
    measurementMode: identity.measurementMode,
    waveguideType: identity.waveguideFamily,
    sourceType: identity.sourceType,
    traceCount: traceFiles.length,
    rowCount: identity.rowCount,
    chipCount: identity.chipCount,
    waveguideCount: identity.waveguideCount,
    wavelengthMinNm: identity.wavelengthMinNm,
    wavelengthMaxNm: identity.wavelengthMaxNm,
    copiedToFolder: true,
    processedInTestingSuite: true,
    notes: sourceMeta.notes || "",
    sourceNames: identity.sourceNames,
    traceFiles: traceFiles.map((file) => file.fileName),
    waveguideConfig,
    legacyFolder: identity.legacyFolder,
    metadataFile: `${identity.folderName}/metadata.json`,
    configFile: `${identity.folderName}/waveguide-config.json`
  };
}

function normalizeOutputFileName(sourceName, fallbackPrefix, firstRow, index) {
  const rawName = String(sourceName || "").trim();
  if (rawName && /\.(txt|csv)$/i.test(rawName)) {
    return rawName.replace(/\.csv$/i, ".txt");
  }
  if (rawName && /\.(xlsx|xls)$/i.test(rawName)) {
    return rawName.replace(/\.(xlsx|xls)$/i, ".txt");
  }
  if (rawName) {
    return `${rawName}.txt`;
  }

  const chipId = firstRow?.chip_id || `Chip${index + 1}`;
  const waveguideId = firstRow?.waveguide_id || `WG${index + 1}`;
  return `${fallbackPrefix}_${chipId}_${waveguideId}.txt`;
}

export function buildDatasetTraceFiles(rows, identity) {
  const grouped = rows.reduce((acc, row) => {
    const key = row.source_name || `${row.chip_id || "chip"}-${row.waveguide_id || "wg"}`;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(row);
    return acc;
  }, new Map());

  const prefix = slugify(identity.waferName || identity.projectName || identity.folderName);
  return Array.from(grouped.entries()).map(([sourceName, sourceRows], index) => {
    const ordered = [...sourceRows].sort((a, b) => Number(a.wavelength_nm) - Number(b.wavelength_nm));
    const outputName = normalizeOutputFileName(sourceName, prefix, ordered[0], index);
    const points = ordered
      .filter((row) => Number.isFinite(Number(row.wavelength_nm)) && Number.isFinite(Number(row.optical_power_w)))
      .map((row) => `${Number(row.wavelength_nm)}\t${Number(row.optical_power_w)}`);
    if (!points.length) return null;
    const content = points.join("\n");
    return {
      fileName: outputName,
      content,
      rowCount: ordered.length,
      sourceName,
      chipId: ordered[0]?.chip_id || "",
      waveguideId: ordered[0]?.waveguide_id || ""
    };
  }).filter(Boolean);
}

export function buildDatasetReadme(identity, traceFiles, metadata) {
  const chipList = unique(traceFiles.map((file) => file.chipId)).join(", ") || "--";
  const waveguideList = unique(traceFiles.map((file) => file.waveguideId)).join(", ") || "--";
  return [
    `# ${identity.label}`,
    "",
    `This folder contains GitHub-hosted measurement traces for ${identity.projectName}.`,
    "",
    "## Dataset Summary",
    `- Project: ${identity.projectName}`,
    `- Wafer: ${identity.waferName}`,
    `- Platform: ${identity.platformLabel}`,
    `- Building block: ${identity.buildingBlockLabel}`,
    `- Measurement mode: ${identity.measurementMode}`,
    `- Measurement type: ${identity.measurementType}`,
    `- Waveguide type: ${identity.waveguideFamily}`,
    `- Date: ${formatDateLabel(identity.selectedDate)}`,
    `- Files: ${traceFiles.length}`,
    `- Chips: ${chipList}`,
    `- Waveguides: ${waveguideList}`,
    `- Metadata: metadata.json`,
    `- Waveguide config: waveguide-config.json`,
    `- Normalized rows: ${identity.rowCount}`,
    `- Wavelength span: ${formatNumber(identity.wavelengthMinNm, 3)} nm to ${formatNumber(identity.wavelengthMaxNm, 3)} nm`,
    metadata?.notes ? `- Notes: ${metadata.notes}` : null,
    "",
    "## Filename Pattern",
    "Each trace is saved as a two-column text file:",
    "1. wavelength in nm",
    "2. optical power in W",
    "",
    "This folder was prepared for the Wafer Post-Processing Suite GitHub measurement-data library."
  ].filter(Boolean).join("\n");
}

export function buildDatasetManifestEntry(identity, traceFiles, waveguideConfig, metadata) {
  return {
    id: identity.id,
    label: identity.label,
    projectName: identity.projectName,
    waferName: identity.waferName,
    selectedDate: identity.selectedDate,
    folder: `sample-data/wst/${identity.folderName}`,
    sourceType: identity.sourceType,
    measurementMode: identity.measurementMode,
    measurementType: identity.measurementType,
    mpw: identity.mpw,
    slot: identity.slot,
    waveguideType: identity.waveguideType,
    platformId: identity.platformId,
    platformLabel: identity.platformLabel,
    buildingBlockId: identity.buildingBlockId,
    buildingBlockLabel: identity.buildingBlockLabel,
    traceCount: traceFiles.length,
    rowCount: identity.rowCount,
    chipCount: identity.chipCount,
    waveguideCount: identity.waveguideCount,
    wavelengthMinNm: identity.wavelengthMinNm,
    wavelengthMaxNm: identity.wavelengthMaxNm,
    files: traceFiles.map((file) => file.fileName),
    readme: `${identity.folderName}/README.md`,
    metadataFile: `${identity.folderName}/metadata.json`,
    configFile: `${identity.folderName}/waveguide-config.json`,
    waveguideConfig,
    notes: metadata?.notes || "",
    source: "github-library",
    librarySchemaVersion: 1
  };
}

export function buildDatasetManifestEntryV2(identity, traceFiles, waveguideConfig, metadata) {
  return {
    schemaVersion: 2,
    datasetId: identity.id,
    id: identity.id,
    label: identity.label,
    projectName: identity.projectName,
    waferName: identity.waferName,
    selectedDate: identity.selectedDate,
    folder: `sample-data/wst/${identity.folderName}`,
    traceFolder: `sample-data/wst/${identity.folderName}`,
    sourceType: identity.sourceType,
    measurementMode: identity.measurementMode,
    measurementType: identity.measurementType,
    mpw: identity.mpw,
    slot: identity.slot,
    waveguideType: identity.waveguideType,
    waveguideFamily: identity.waveguideFamily,
    platformId: identity.platformId,
    platformLabel: identity.platformLabel,
    buildingBlockId: identity.buildingBlockId,
    buildingBlockLabel: identity.buildingBlockLabel,
    traceCount: traceFiles.length,
    rowCount: identity.rowCount,
    chipCount: identity.chipCount,
    waveguideCount: identity.waveguideCount,
    wavelengthMinNm: identity.wavelengthMinNm,
    wavelengthMaxNm: identity.wavelengthMaxNm,
    files: traceFiles.map((file) => file.fileName),
    readme: `${identity.folderName}/README.md`,
    metadataFile: `${identity.folderName}/metadata.json`,
    configFile: `${identity.folderName}/waveguide-config.json`,
    waveguideConfig,
    copiedToFolder: metadata?.copiedToFolder ?? true,
    processedInTestingSuite: metadata?.processedInTestingSuite ?? true,
    notes: metadata?.notes || "",
    source: "github-library-v2",
    librarySchemaVersion: 2
  };
}

export function buildDatasetSnapshotMetadata(dataset) {
  const detectedIdentity = inferDatasetIdentity({
    projectName: dataset.projectName,
    waferName: dataset.waferName,
    sourceMeta: dataset.sourceMeta,
    rows: dataset.rawRows || [],
    selectedDate: dataset.selectedDate
  });
  const identity = applyDatasetNamingOverrides(detectedIdentity, dataset.namingOverrides);

  return {
    ...identity,
    shortLabel: identity.label || `${identity.mpw} ${identity.slot} ${identity.waveguideType}`,
    rowLabel: `${identity.rowCount.toLocaleString()} normalized rows`,
    sourceLabel: `${identity.sourceCount} file${identity.sourceCount === 1 ? "" : "s"}`
  };
}

function encodeBase64Unicode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 404) return null;
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    const message = typeof payload === "string"
      ? payload
      : payload?.message || `GitHub request failed with status ${response.status}.`;
    const error = new Error(message || `GitHub request failed with status ${response.status}.`);
    error.name = "GitHubRequestError";
    error.githubStatus = response.status;
    error.githubPayload = payload;
    throw error;
  }
  return response.json();
}

async function getExistingFileSha({ owner, repo, branch, path, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const result = await githubRequest(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  return result?.sha || null;
}

async function putGithubFile({ owner, repo, branch, path, token, message, content }) {
  const existingSha = await getExistingFileSha({ owner, repo, branch, path, token });
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  return githubRequest(url, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      message,
      branch,
      content: encodeBase64Unicode(content),
      ...(existingSha ? { sha: existingSha } : {})
    })
  });
}

export async function publishDatasetPackageToGithub({
  owner,
  repo,
  branch,
  token,
  manifestPath,
  mirrorManifestPath,
  manifestPathV2,
  mirrorManifestPathV2,
  packageData,
  existingManifest = [],
  existingManifestV2 = [],
  onProgress
}) {
  const nextManifest = [
    packageData.manifestEntry,
    ...existingManifest.filter((entry) => entry.id !== packageData.manifestEntry.id)
  ].sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));

  const nextManifestV2 = [
    packageData.manifestEntryV2,
    ...existingManifestV2
      .map((entry) => upgradeManifestEntryToV2(entry))
      .filter((entry) => entry.id !== packageData.manifestEntryV2.id)
  ].sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));

  const filesToWrite = [
    ...packageData.traceFiles.flatMap((file) => [
      { path: `public/sample-data/wst/${packageData.identity.folderName}/${file.fileName}`, content: file.content },
      { path: `sample-data/wst/${packageData.identity.folderName}/${file.fileName}`, content: file.content }
    ]),
    { path: `public/sample-data/wst/${packageData.identity.folderName}/README.md`, content: packageData.readme },
    { path: `sample-data/wst/${packageData.identity.folderName}/README.md`, content: packageData.readme },
    { path: `public/sample-data/wst/${packageData.identity.folderName}/${packageData.metadataFileName}`, content: packageData.metadataContent },
    { path: `sample-data/wst/${packageData.identity.folderName}/${packageData.metadataFileName}`, content: packageData.metadataContent },
    { path: `public/sample-data/wst/${packageData.identity.folderName}/${packageData.configFileName}`, content: packageData.configContent },
    { path: `sample-data/wst/${packageData.identity.folderName}/${packageData.configFileName}`, content: packageData.configContent },
    { path: manifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" },
    { path: mirrorManifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" },
    ...(manifestPathV2 && mirrorManifestPathV2
      ? [
          { path: manifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n" },
          { path: mirrorManifestPathV2, content: JSON.stringify(nextManifestV2, null, 2) + "\n" }
        ]
      : [])
  ];

  let completed = 0;
  for (const file of filesToWrite) {
    onProgress?.({ completed, total: filesToWrite.length, path: file.path });
    await putGithubFile({
      owner,
      repo,
      branch,
      token,
      path: file.path,
      content: file.content,
      message: `Add measurement dataset ${packageData.identity.label}`
    });
    completed += 1;
    onProgress?.({ completed, total: filesToWrite.length, path: file.path });
  }

  return {
    manifest: nextManifest,
    manifestV2: nextManifestV2,
    folderUrl: `https://github.com/${owner}/${repo}/tree/${branch}/public/sample-data/wst/${packageData.identity.folderName}`
  };
}

export function buildGithubDatasetPackage(dataset) {
  const detectedIdentity = inferDatasetIdentity({
    projectName: dataset.projectName,
    waferName: dataset.waferName,
    sourceMeta: dataset.sourceMeta,
    rows: dataset.rawRows || [],
    selectedDate: dataset.selectedDate
  });
  const identity = applyDatasetNamingOverrides(detectedIdentity, dataset.namingOverrides);
  const traceFiles = buildDatasetTraceFiles(dataset.rawRows || [], identity);
  if (!traceFiles.length) {
    throw new Error("This dataset does not contain trace-style wavelength and optical-power rows that can be published to the GitHub measurement library.");
  }
  const waveguideConfig = buildWaveguideConfig(dataset.sourceMeta);
  const metadata = buildDatasetMetadata(dataset, identity, traceFiles, waveguideConfig);
  const readme = buildDatasetReadme(identity, traceFiles, metadata);
  const manifestEntry = buildDatasetManifestEntry(identity, traceFiles, waveguideConfig, metadata);
  const manifestEntryV2 = buildDatasetManifestEntryV2(identity, traceFiles, waveguideConfig, metadata);
  return {
    identity,
    traceFiles,
    readme,
    metadata,
    manifestEntry,
    manifestEntryV2,
    metadataFileName: "metadata.json",
    metadataContent: JSON.stringify(metadata, null, 2) + "\n",
    configFileName: "waveguide-config.json",
    configContent: JSON.stringify(waveguideConfig, null, 2) + "\n"
  };
}


