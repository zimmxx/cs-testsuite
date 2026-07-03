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

function inferDatasetTokens(projectName, waferName, sourceMeta = {}, rows = []) {
  const joined = [projectName, waferName, sourceMeta.name, sourceMeta.type, ...rows.slice(0, 24).map((row) => row.source_name || "")].join(" ");
  const mpwMatch = joined.match(/MPW\s*([0-9]+)/i);
  const slotMatch = joined.match(/Slot\s*([0-9]+)/i);
  const typeMatch = joined.match(/\b(rib|strip|slot)\b/i);
  const modeMatch = /manual/i.test(joined)
    ? "manual"
    : /automated|wst/i.test(joined)
      ? "wst"
      : "measurement";

  return {
    mpw: mpwMatch ? `MPW${mpwMatch[1]}` : "Measurement",
    slot: slotMatch ? `Slot${slotMatch[1]}` : "SlotUndefined",
    waveguideType: typeMatch ? typeMatch[1].toLowerCase() : "waveguide",
    mode: modeMatch
  };
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
    wavelengthMaxNm: wavelength.max
  };
}

function formatNumber(value, digits = 1) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

function formatDateLabel(selectedDate) {
  return selectedDate || new Date().toISOString().slice(0, 10);
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

export function buildDatasetReadme(identity, traceFiles) {
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
    `- Measurement mode: ${identity.measurementMode}`,
    `- Source type: ${identity.sourceType}`,
    `- Date: ${formatDateLabel(identity.selectedDate)}`,
    `- Files: ${traceFiles.length}`,
    `- Chips: ${chipList}`,
    `- Waveguides: ${waveguideList}`,
    `- Normalized rows: ${identity.rowCount}`,
    `- Wavelength span: ${formatNumber(identity.wavelengthMinNm, 3)} nm to ${formatNumber(identity.wavelengthMaxNm, 3)} nm`,
    "",
    "## Filename Pattern",
    "Each trace is saved as a two-column text file:",
    "1. wavelength in nm",
    "2. optical power in W",
    "",
    "This folder was prepared for the Wafer Post-Processing Suite GitHub measurement-data library."
  ].join("\n");
}

export function buildDatasetManifestEntry(identity, traceFiles) {
  return {
    id: identity.id,
    label: identity.label,
    projectName: identity.projectName,
    waferName: identity.waferName,
    selectedDate: identity.selectedDate,
    folder: `sample-data/wst/${identity.folderName}`,
    sourceType: identity.sourceType,
    measurementMode: identity.measurementMode,
    mpw: identity.mpw,
    slot: identity.slot,
    waveguideType: identity.waveguideType,
    traceCount: traceFiles.length,
    rowCount: identity.rowCount,
    chipCount: identity.chipCount,
    waveguideCount: identity.waveguideCount,
    wavelengthMinNm: identity.wavelengthMinNm,
    wavelengthMaxNm: identity.wavelengthMaxNm,
    files: traceFiles.map((file) => file.fileName),
    readme: `${identity.folderName}/README.md`,
    source: "github-library"
  };
}

export function buildDatasetSnapshotMetadata(dataset) {
  const identity = inferDatasetIdentity({
    projectName: dataset.projectName,
    waferName: dataset.waferName,
    sourceMeta: dataset.sourceMeta,
    rows: dataset.rawRows || [],
    selectedDate: dataset.selectedDate
  });

  return {
    ...identity,
    shortLabel: `${identity.mpw} ${identity.slot} ${identity.waveguideType}`,
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
    const detail = await response.text();
    throw new Error(detail || `GitHub request failed with status ${response.status}.`);
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
  packageData,
  existingManifest = [],
  onProgress
}) {
  const nextManifest = [
    packageData.manifestEntry,
    ...existingManifest.filter((entry) => entry.id !== packageData.manifestEntry.id)
  ].sort((a, b) => String(a.projectName || a.label).localeCompare(String(b.projectName || b.label)));

  const filesToWrite = [
    ...packageData.traceFiles.flatMap((file) => [
      { path: `public/sample-data/wst/${packageData.identity.folderName}/${file.fileName}`, content: file.content },
      { path: `sample-data/wst/${packageData.identity.folderName}/${file.fileName}`, content: file.content }
    ]),
    { path: `public/sample-data/wst/${packageData.identity.folderName}/README.md`, content: packageData.readme },
    { path: `sample-data/wst/${packageData.identity.folderName}/README.md`, content: packageData.readme },
    { path: manifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" },
    { path: mirrorManifestPath, content: JSON.stringify(nextManifest, null, 2) + "\n" }
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
    folderUrl: `https://github.com/${owner}/${repo}/tree/${branch}/public/sample-data/wst/${packageData.identity.folderName}`
  };
}

export function buildGithubDatasetPackage(dataset) {
  const identity = inferDatasetIdentity({
    projectName: dataset.projectName,
    waferName: dataset.waferName,
    sourceMeta: dataset.sourceMeta,
    rows: dataset.rawRows || [],
    selectedDate: dataset.selectedDate
  });
  const traceFiles = buildDatasetTraceFiles(dataset.rawRows || [], identity);
  if (!traceFiles.length) {
    throw new Error("This dataset does not contain trace-style wavelength and optical-power rows that can be published to the GitHub measurement library.");
  }
  const readme = buildDatasetReadme(identity, traceFiles);
  const manifestEntry = buildDatasetManifestEntry(identity, traceFiles);
  return {
    identity,
    traceFiles,
    readme,
    manifestEntry
  };
}
