import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { normalizeDatasetAnalyticsReview, normalizeDatasetAnalyticsSummary } = await server.ssrLoadModule('/src/lib/githubLibrary.js');
const { computePropagationLoss } = await server.ssrLoadModule('/src/lib/analysis.js');
const { readNamedTextRows, buildNormalizedRows } = await server.ssrLoadModule('/src/lib/parsers.js');
const reviewHelpers = await server.ssrLoadModule('/src/lib/datasetReview.js');
const libraryHelpers = await server.ssrLoadModule('/src/lib/githubLibrary.js');
const packageHelpers = await server.ssrLoadModule('/src/lib/wstProjectPackage.js');

function waveguideReviewRows() {
  return ['Chip1', 'Chip2'].flatMap(chip_id => [1, 2, 3, 4].flatMap(index =>
    [1540, 1550, 1560].map(wavelength_nm => ({
      chip_id, waveguide_id: `WG${index}`, metric_family: 'propagation',
      relative_length_mm: [0, 4, 11, 19][index - 1], wavelength_nm,
      loss_db: 5 + [0, 4, 11, 19][index - 1] * 0.3 + (index === 3 ? 12 : 0),
      die_x: null, die_y: null
    }))));
}

test('per-chip exclusions refit every wavelength without renumbering, changing lengths or deleting raw traces', () => {
  const rows = waveguideReviewRows();
  const original = JSON.stringify(rows);
  const result = computePropagationLoss(rows, { excludedWaveguideIdsByChip: { Chip1: ['WG3'] } });
  const chip = result.byChip.find(item => item.chipId === 'Chip1');
  const otherChip = result.byChip.find(item => item.chipId === 'Chip2');
  assert.deepEqual(chip.samples.map(row => [row.waveguide_id, row.relative_length_mm]), [['WG1', 0], ['WG2', 4], ['WG4', 19]]);
  assert.ok(Math.abs(chip.lossDbPerCm - 3) < 1e-10);
  assert.ok(chip.spectralSeries.every(point => point.sampleCount === 3 && Math.abs(point.lossDbPerCm - 3) < 1e-10));
  assert.equal(chip.transmissionSeries.length, 4);
  assert.equal(chip.transmissionSeries.find(item => item.waveguideId === 'WG3').excluded, true);
  assert.equal(otherChip.samples.length, 4);
  assert.equal(otherChip.passMse, false);
  assert.equal(JSON.stringify(rows), original);
  assert.equal(computePropagationLoss(rows).byChip[0].samples.length, 4);
});

test('too few included lengths leaves chip available for recovery and contributes no fitted value', () => {
  for (const excluded of [['WG2', 'WG3', 'WG4'], ['WG1', 'WG2', 'WG3', 'WG4']]) {
    const result = computePropagationLoss(waveguideReviewRows(), { excludedWaveguideIdsByChip: { Chip1: excluded } });
    const chip = result.byChip.find(item => item.chipId === 'Chip1');
    assert.equal(chip.fit, null);
    assert.equal(chip.lossDbPerCm, null);
    assert.equal(chip.passMse, false);
    assert.equal(chip.transmissionSeries.length, 4);
    assert.equal(result.byChip.length, 2);
    assert.ok(!result.waferMetric.some(item => item.chipId === 'Chip1'));
  }
});

test('propagation-only waveguide exclusions preserve original transmission summary metrics', () => {
  const rows = waveguideReviewRows();
  const baseline = computePropagationLoss(rows).byChip[0];
  const reviewed = computePropagationLoss(rows, { excludedWaveguideIdsByChip: { Chip1: ['WG1'] } }).byChip[0];
  assert.deepEqual(reviewed.transmissionSummary, baseline.transmissionSummary);
  assert.equal(reviewed.transmissionSummary.waveguideId, 'WG1');
  assert.ok(!reviewed.samples.some(row => row.waveguide_id === 'WG1'));
});

test('per-chip exclusions survive metadata, manifests, analytics cache and portable package round trip', async () => {
  const exclusions = { Chip1: ['WG3'], Chip2: ['WG2', 'WG4'] };
  const dataset = { id: 'review-test', projectName: 'MPW48', label: 'Review test', rawRows: waveguideReviewRows(), sourceMeta: { excludedWaveguideIdsByChip: exclusions }, analyticsReview: { excludedWaveguideIdsByChip: exclusions } };
  const metadata = libraryHelpers.buildDatasetMetadata(dataset, {}, [], {}, {});
  assert.deepEqual(metadata.analyticsReview.excludedWaveguideIdsByChip, exclusions);
  for (const value of [libraryHelpers.buildDatasetManifestEntry({}, [], {}, {}, metadata), libraryHelpers.buildDatasetManifestEntryV2({}, [], {}, {}, metadata), libraryHelpers.buildLibraryAnalyticsEntry(dataset)]) {
    assert.deepEqual(value.analyticsReview.excludedWaveguideIdsByChip, exclusions);
  }
  const exported = await packageHelpers.createWstProjectPackage([dataset]);
  const imported = await packageHelpers.importWstProjectPackage({ arrayBuffer: () => exported.blob.arrayBuffer(), name: exported.fileName });
  assert.deepEqual(imported.datasets[0].analyticsReview.excludedWaveguideIdsByChip, exclusions);
  assert.deepEqual(imported.datasets[0].sourceMeta.excludedWaveguideIdsByChip, exclusions);
  assert.deepEqual(imported.datasets[0].rawRows, dataset.rawRows);
  assert.deepEqual(normalizeDatasetAnalyticsReview().excludedWaveguideIdsByChip, {});
  assert.deepEqual(normalizeDatasetAnalyticsReview({ excludedWaveguideIdsByChip: { Chip1: ['WG3', 'WG3', null], Chip2: 'invalid' } }).excludedWaveguideIdsByChip, { Chip1: ['WG3'] });
});

test('processing verdict distinguishes unreviewed, all-passing and missing or failed fits', () => {
  assert.equal(reviewHelpers.processingVerdict(null).label, 'Not evaluated');
  assert.equal(reviewHelpers.processingVerdict({ measuredChips: 4, fittedChips: null }).label, 'Not evaluated');
  assert.equal(reviewHelpers.processingVerdict({ selectedChipCount: 4, fittedChips: 4 }).label, 'Meets fit criteria');
  assert.equal(reviewHelpers.processingVerdict({ selectedChipCount: 4, fittedChips: 3 }).label, 'Needs fit review');
  assert.equal(reviewHelpers.processingVerdict({ selectedChipCount: 4, fittedChips: 0 }).label, 'Needs fit review');
  assert.equal(reviewHelpers.datasetFields(null).slot, 'Unknown');
});

test('manual approval is independent of processing fits and defaults safely for old datasets', () => {
  assert.deepEqual(reviewHelpers.testTeamApproval({ testTeamApproval: 'Accepted with conditions' }), { label: 'Accepted with conditions', tone: 'issues' });
  assert.equal(reviewHelpers.testTeamApproval({ analyticsReview: { fittedChips: 4, selectedChipCount: 4 } }).label, 'Awaiting review');
  assert.equal(reviewHelpers.normalizeTestTeamApproval('invalid'), 'Awaiting review');
  assert.equal(reviewHelpers.normalizeTestTeamApproval('Pass'), 'Accepted');
  assert.equal(reviewHelpers.normalizeTestTeamApproval('Pass with issues'), 'Accepted with conditions');
  assert.equal(reviewHelpers.normalizeTestTeamApproval('Fail'), 'Rejected');
  assert.equal(reviewHelpers.testTeamApproval({ namingOverrides: { testTeamApproval: 'Fail' }, testTeamApproval: 'Pass' }).label, 'Rejected');
});

test('published approval and current review updates do not upload measurement traces', async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') writes.push({ path: new URL(url).pathname.split('/contents/')[1], content: JSON.parse(Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8')) });
    return new Response(JSON.stringify({ sha: 'existing-sha' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const dataset = { id: 'published', projectName: 'MPW48', folder: 'sample-data/wst/published', files: ['Chip1_WG1.txt'], analyticsReview: { fittedChips: 1, selectedChipCount: 1 } };
    const metadata = { testTeamApproval: 'Accepted with conditions', testTeamComments: 'One die needs follow-up', analyticsReview: dataset.analyticsReview };
    const result = await libraryHelpers.updatePublishedDatasetMetadataOnGithub({ owner: 'example', repo: 'example', branch: 'main', token: 'test-token', dataset, metadata, manifestPath: 'library-index.json', manifestPathV2: 'library-index-v2.json', analyticsIndexPath: 'library-analytics.json', existingManifest: [dataset], existingManifestV2: [dataset] });
    assert.deepEqual(writes.map((write) => write.path), ['public/sample-data/wst/published/metadata.json', 'library-index.json', 'library-index-v2.json', 'library-analytics.json']);
    assert.equal(writes[0].content.testTeamApproval, 'Accepted with conditions');
    assert.equal(result.manifestV2[0].testTeamApproval, 'Accepted with conditions');
    assert.equal(result.manifestV2[0].analyticsReview.fittedChips, 1);
    assert.deepEqual(result.manifestV2[0].files, dataset.files);
  } finally { globalThis.fetch = originalFetch; }
});

test('step descriptions and comments survive publication manifests and portable snapshots', async () => {
  const identity = libraryHelpers.applyDatasetNamingOverrides({ id: 'example', projectName: 'MPW48' }, {
    stepDescription: 'After cleaning', testTeamComments: 'Check die 2', testTeamApproval: 'Accepted with conditions'
  });
  const dataset = { id: 'example', projectName: 'MPW48', rawRows: [{ chip_id: '1', wavelength_nm: 1550 }], namingOverrides: identity, analyticsReview: { fittedChips: 1, selectedChipCount: 1 } };
  const metadata = libraryHelpers.buildDatasetMetadata(dataset, identity, [], {}, {});
  for (const manifest of [libraryHelpers.buildDatasetManifestEntry(identity, [], {}, {}, metadata), libraryHelpers.buildDatasetManifestEntryV2(identity, [], {}, {}, metadata)]) {
    assert.equal(manifest.stepDescription, 'After cleaning');
    assert.equal(manifest.testTeamComments, 'Check die 2');
    assert.equal(manifest.testTeamApproval, 'Accepted with conditions');
  }
  const updated = libraryHelpers.buildUpdatedPublishedDatasetManifestEntry({}, {}, { stepDescription: '', testTeamComments: 'Reviewed' });
  assert.equal(updated.stepDescription, '');
  assert.equal(updated.testTeamComments, 'Reviewed');
  const exported = await packageHelpers.createWstProjectPackage([dataset]);
  const imported = await packageHelpers.importWstProjectPackage({ arrayBuffer: () => exported.blob.arrayBuffer(), name: exported.fileName });
  assert.equal(imported.datasets[0].namingOverrides.stepDescription, 'After cleaning');
  assert.equal(imported.datasets[0].namingOverrides.testTeamApproval, 'Accepted with conditions');
  assert.equal(imported.datasets[0].analyticsReview.fittedChips, 1);
});

test('missing review settings remain unset across JSON and repeated normalization', () => {
  const empty = normalizeDatasetAnalyticsReview();
  assert.deepEqual(normalizeDatasetAnalyticsReview(JSON.parse(JSON.stringify(empty))), empty);
  for (const value of [null, undefined, '', '  ', 'invalid', Infinity]) {
    const review = normalizeDatasetAnalyticsReview({
      totalChipCount: value,
      propagationSettings: Object.fromEntries(Object.keys(empty.propagationSettings).map(key => [key, value]))
    });
    assert.equal(review.totalChipCount, null);
    assert.ok(Object.values(review.propagationSettings).every(setting => setting === null));
  }
});

test('explicit settings and real zero values survive normalization', () => {
  const review = normalizeDatasetAnalyticsReview({
    failedFits: 0,
    propagationSettings: {
      propagationTargetWavelengthNm: '1550', propagationWindowNm: 0,
      propagationSpectralStepNm: '10', propagationMseThreshold: 0
    }
  });
  assert.equal(review.failedFits, 0);
  assert.deepEqual(review.propagationSettings, {
    propagationTargetWavelengthNm: 1550, propagationWindowNm: 0,
    propagationSpectralStepNm: 10, propagationMseThreshold: 0
  });
  assert.equal(normalizeDatasetAnalyticsSummary({ propagationAverage: null }).propagationAverage, null);
  assert.equal(normalizeDatasetAnalyticsSummary({ propagationAverage: 0 }).propagationAverage, 0);
});

test('published traces with null review settings retain defaults and produce a propagation fit', () => {
  const review = normalizeDatasetAnalyticsReview({ propagationSettings: {
    propagationTargetWavelengthNm: null, propagationWindowNm: null,
    propagationSpectralStepNm: null, propagationMseThreshold: null
  } });
  const settings = {
    propagationTargetWavelengthNm: 1550, propagationWindowNm: 5,
    propagationSpectralStepNm: 10, propagationMseThreshold: 0.5,
    ...Object.fromEntries(Object.entries(review.propagationSettings).filter(([, value]) => value !== null && value !== undefined))
  };
  const rawRows = [1, 2, 3].flatMap(index => {
    const power = 10 ** ((10 - (5 + (index - 1) * 1.2)) / 10) / 1000;
    return readNamedTextRows(`Chip40_WG${index}.txt`, `1545\t${power}\n1550\t${power}\n1555\t${power}`);
  });
  const rows = buildNormalizedRows(rawRows, {}, { waveguideLengthByIndex: { 1: 0, 2: 4, 3: 8 } });
  const result = computePropagationLoss(rows, {
    targetWavelengthNm: settings.propagationTargetWavelengthNm,
    windowNm: settings.propagationWindowNm,
    spectralStepNm: settings.propagationSpectralStepNm,
    mseThreshold: settings.propagationMseThreshold
  });
  assert.equal(result.byChip.length, 1);
  assert.equal(result.byChip[0].samples.length, 3);
  assert.equal(result.passRate, 100);
  assert.ok(Math.abs(result.summaryStats.avgPropagationLossDbPerCm - 3) < 1e-10);
});
