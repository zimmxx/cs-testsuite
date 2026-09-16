import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
after(() => server.close());
const { normalizeDatasetAnalyticsReview, normalizeDatasetAnalyticsSummary } = await server.ssrLoadModule('/src/lib/githubLibrary.js');
const { computePropagationLoss } = await server.ssrLoadModule('/src/lib/analysis.js');
const { readNamedTextRows, buildNormalizedRows } = await server.ssrLoadModule('/src/lib/parsers.js');

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
