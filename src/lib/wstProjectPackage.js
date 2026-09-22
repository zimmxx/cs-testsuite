import { strFromU8, strToU8, unzipSync, zip, zipSync } from "../../node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/browser.js";

const PACKAGE_KIND = "cornerstone-wst-project-package";
const PACKAGE_SCHEMA_VERSION = 2;
const MAX_PACKAGE_BYTES = 750 * 1024 * 1024;
const ROW_CHUNK_SIZE = 4_000;

function safePackageToken(value, fallback) {
  const token = String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return token || fallback;
}

function packageError(message) {
  return new Error(`WST project package: ${message}`);
}

function plainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function exportableSnapshot(snapshot) {
  if (!Array.isArray(snapshot?.rawRows) || !snapshot.rawRows.length) {
    throw packageError(`"${snapshot?.label || "Unnamed snapshot"}" has no measurement rows to export.`);
  }

  return {
    schemaVersion: 1,
    id: String(snapshot.id || ""),
    label: String(snapshot.label || "Dataset snapshot"),
    projectName: String(snapshot.projectName || ""),
    waferName: String(snapshot.waferName || ""),
    selectedDate: String(snapshot.selectedDate || ""),
    rawRows: snapshot.rawRows,
    columnMap: plainJson(snapshot.columnMap || {}),
    sourceMeta: plainJson(snapshot.sourceMeta || {}),
    summary: plainJson(snapshot.summary || {}),
    namingOverrides: plainJson(snapshot.namingOverrides || {}),
    display: plainJson(snapshot.display || {})
  };
}

function encodeRowsAsNdjson(rows) {
  return strToU8(rows.map((row) => JSON.stringify(row)).join("\n"));
}

function createZip(files) {
  if (typeof Worker === "undefined") return Promise.resolve(zipSync(files, { level: 6 }));
  return new Promise((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function packageReadme(projectName, projectNames, datasetCount) {
  return [
    `# ${projectName} WST Project Package`,
    "",
    `This portable package contains ${datasetCount} saved measurement snapshot${datasetCount === 1 ? "" : "s"}.`,
    projectNames.length > 1 ? `Included projects: ${projectNames.join(", ")}.` : "",
    "Open it in Wafer Post-Processing Suite through Dataset Snapshots > Import Project Package.",
    "",
    "The package is not encrypted. Protect it with your approved secure-transfer process before sharing confidential measurements."
  ].join("\n");
}

export async function createWstProjectPackage(snapshots = []) {
  const preparedSnapshots = snapshots.map(exportableSnapshot);
  if (!preparedSnapshots.length) throw packageError("Select at least one saved snapshot to export.");

  const projectNames = [...new Set(preparedSnapshots.map((snapshot) => snapshot.projectName).filter(Boolean))];
  const projectName = projectNames.length === 1
    ? projectNames[0]
    : projectNames.length ? "Multiple_projects" : "WST_Project";
  const createdAt = new Date().toISOString();
  const files = {};
  const datasets = preparedSnapshots.map((snapshot, index) => {
    const folder = `datasets/${String(index + 1).padStart(2, "0")}-${safePackageToken(snapshot.waferName || snapshot.label, "dataset")}`;
    const metadataPath = `${folder}/snapshot.json`;
    const { rawRows, ...snapshotMetadata } = snapshot;
    files[metadataPath] = strToU8(JSON.stringify(snapshotMetadata));
    const rowFiles = [];
    for (let start = 0; start < rawRows.length; start += ROW_CHUNK_SIZE) {
      const path = `${folder}/rows-${String(rowFiles.length + 1).padStart(4, "0")}.ndjson`;
      files[path] = encodeRowsAsNdjson(rawRows.slice(start, start + ROW_CHUNK_SIZE));
      rowFiles.push(path);
    }
    return {
      id: snapshot.id,
      label: snapshot.label,
      projectName: snapshot.projectName,
      slot: snapshot.waferName,
      rowCount: rawRows.length,
      metadataPath,
      rowFiles
    };
  });

  const manifest = {
    kind: PACKAGE_KIND,
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    createdAt,
    projectName,
    projectNames,
    datasetCount: datasets.length,
    datasets
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["README.md"] = strToU8(packageReadme(projectName, projectNames, datasets.length));

  return {
    blob: new Blob([await createZip(files)], { type: "application/vnd.cornerstone.wst-project-package+zip" }),
    fileName: `${safePackageToken(projectName, "wst-project")}-${createdAt.slice(0, 10)}.wstpkg`,
    manifest
  };
}

function isSafeDatasetPath(path, extension) {
  return path.startsWith("datasets/") && !path.includes("..") && path.endsWith(extension);
}

function readJsonEntry(entries, path) {
  const content = entries[path];
  if (!content) throw packageError(`Missing required file "${path}".`);
  try {
    return JSON.parse(strFromU8(content));
  } catch {
    throw packageError(`"${path}" is not valid JSON.`);
  }
}

function validateImportedSnapshot(snapshot, descriptor) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.rawRows) || !snapshot.rawRows.length) {
    throw packageError(`Dataset "${descriptor?.label || descriptor?.path || "unknown"}" has no usable measurement rows.`);
  }
  if (snapshot.rawRows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw packageError(`Dataset "${descriptor?.label || descriptor?.path || "unknown"}" contains invalid measurement rows.`);
  }
  return {
    ...snapshot,
    columnMap: snapshot.columnMap && typeof snapshot.columnMap === "object" ? snapshot.columnMap : {},
    sourceMeta: snapshot.sourceMeta && typeof snapshot.sourceMeta === "object" ? snapshot.sourceMeta : {},
    summary: snapshot.summary && typeof snapshot.summary === "object" ? snapshot.summary : {},
    namingOverrides: snapshot.namingOverrides && typeof snapshot.namingOverrides === "object" ? snapshot.namingOverrides : {},
    display: snapshot.display && typeof snapshot.display === "object" ? snapshot.display : {}
  };
}

function readRowsEntry(entries, path, descriptor) {
  const content = entries[path];
  if (!content) throw packageError(`Missing measurement rows for "${descriptor?.label || "unknown"}".`);
  const text = strFromU8(content).trim();
  if (!text) return [];
  try {
    return text.split("\n").map((line) => JSON.parse(line));
  } catch {
    throw packageError(`Measurement rows in "${path}" are not valid JSON lines.`);
  }
}

export async function importWstProjectPackage(file) {
  if (!file) throw packageError("Choose a .wstpkg file first.");
  if (file.size > MAX_PACKAGE_BYTES) {
    throw packageError(`The selected file is larger than the ${(MAX_PACKAGE_BYTES / 1024 / 1024).toFixed(0)} MB local import limit.`);
  }

  let entries;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw packageError("The selected file is not a readable ZIP-based .wstpkg archive.");
  }

  const manifest = readJsonEntry(entries, "manifest.json");
  if (manifest?.kind !== PACKAGE_KIND || ![1, PACKAGE_SCHEMA_VERSION].includes(manifest?.schemaVersion)) {
    throw packageError("This is not a supported Wafer Post-Processing Suite project package.");
  }
  if (!Array.isArray(manifest.datasets) || !manifest.datasets.length) {
    throw packageError("The package manifest contains no datasets.");
  }
  if (manifest.datasets.length > 40) {
    throw packageError("The package contains more than 40 datasets, which exceeds the local snapshot limit.");
  }

  const datasets = manifest.datasets.map((descriptor) => {
    if (manifest.schemaVersion === 1) {
      const path = String(descriptor?.path || "");
      if (!isSafeDatasetPath(path, ".json")) throw packageError("The package manifest contains an unsafe dataset path.");
      return validateImportedSnapshot(readJsonEntry(entries, path), descriptor);
    }

    const metadataPath = String(descriptor?.metadataPath || "");
    const rowFiles = Array.isArray(descriptor?.rowFiles) ? descriptor.rowFiles.map(String) : [];
    if (!isSafeDatasetPath(metadataPath, ".json") || !rowFiles.length || rowFiles.length > 10_000 || rowFiles.some((path) => !isSafeDatasetPath(path, ".ndjson"))) {
      throw packageError("The package manifest contains unsafe dataset content paths.");
    }
    const rawRows = rowFiles.flatMap((path) => readRowsEntry(entries, path, descriptor));
    return validateImportedSnapshot({ ...readJsonEntry(entries, metadataPath), rawRows }, descriptor);
  });

  return { manifest, datasets };
}
