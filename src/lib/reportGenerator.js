import PptxGenJS from "pptxgenjs";
import {
  buildPropagationPlotSpec,
  buildPropagationSpectrumPlotSpec,
  buildTransmissionSpectrumPlotSpec,
  buildWaferMapPng,
  renderPlotSpecToPng
} from "./postProcessingExport";

const BRAND = "3F0B7A";
const BRAND_SOFT = "F4EEFB";
const TEAL = "0F8A83";
const TEXT = "16323B";
const MUTED = "5E6F75";
const BORDER = "D8E3E8";
const HEADER_FILL = "F5F8FA";
const SUCCESS = "DFF3EA";
const SUCCESS_TEXT = "17795F";
const WARNING = "FCE9E6";
const WARNING_TEXT = "B24C3E";
const WHITE = "FFFFFF";
const TITLE_FONT = "Aptos Display";
const BODY_FONT = "Aptos";
const SLIDE_WIDTH = 13.333;
const SLIDE_HEIGHT = 7.5;
const TABLE_ROWS_PER_SLIDE = 12;

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(value) ? "--" : Number(value).toFixed(digits);
}

function formatMetric(value, unit, digits = 2) {
  const text = formatNumber(value, digits);
  return text === "--" ? text : `${text} ${unit}`;
}

function sanitizeSegment(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || fallback;
}

function formatDateStamp(dateValue = new Date()) {
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function locationLabel(chip) {
  if (chip?.dieX === null || chip?.dieX === undefined || chip?.dieY === null || chip?.dieY === undefined) return "--";
  return `(${chip.dieX}, ${chip.dieY})`;
}

function chipStatus(chip) {
  return chip?.passMse ? "PASS" : chip?.mse !== null && chip?.mse !== undefined ? "CHECK" : "PENDING";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to convert image to data URL."));
    reader.readAsDataURL(blob);
  });
}

function buildChipSummaryRows(chips = []) {
  return chips.map((chip) => ({
    chipId: chip.chipId,
    location: locationLabel(chip),
    propagationLoss: chip.lossDbPerCm,
    mse: chip.mse,
    status: chipStatus(chip),
    peakWavelengthNm: chip.transmissionSummary?.peakWavelengthNm ?? null,
    insertionLossDb: chip.transmissionSummary?.insertionLossDb ?? null,
    bandwidth3dBNm: chip.transmissionSummary?.bandwidth3dBNm ?? null,
    fitPoints: chip.samples?.length || 0,
    spectralPoints: chip.spectralSeries?.length || 0
  }));
}

function addSlideFrame(slide, title, subtitle, sectionLabel) {
  slide.background = { color: WHITE };
  slide.addShape("rect", { x: 0, y: 0, w: SLIDE_WIDTH, h: 0.7, line: { color: BRAND, pt: 0 }, fill: { color: BRAND } });
  slide.addText(title, {
    x: 0.42,
    y: 0.84,
    w: 8.5,
    h: 0.32,
    fontFace: TITLE_FONT,
    fontSize: 23,
    bold: true,
    color: TEXT,
    margin: 0
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.42,
      y: 1.2,
      w: 9.8,
      h: 0.2,
      fontFace: BODY_FONT,
      fontSize: 10.5,
      color: MUTED,
      margin: 0
    });
  }
  if (sectionLabel) {
    slide.addText(sectionLabel, {
      x: 10.85,
      y: 0.18,
      w: 2.0,
      h: 0.18,
      fontFace: BODY_FONT,
      fontSize: 9,
      bold: true,
      align: "right",
      color: WHITE,
      margin: 0
    });
  }
}

function addMetricCard(slide, { x, y, w, label, value, accent = TEAL }) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h: 0.92,
    rectRadius: 0.08,
    line: { color: BORDER, pt: 1 },
    fill: { color: WHITE }
  });
  slide.addShape("rect", { x, y, w: 0.09, h: 0.92, line: { color: accent, pt: 0 }, fill: { color: accent } });
  slide.addText(label, { x: x + 0.18, y: y + 0.15, w: w - 0.28, h: 0.16, fontFace: BODY_FONT, fontSize: 10, color: MUTED, margin: 0 });
  slide.addText(value, { x: x + 0.18, y: y + 0.42, w: w - 0.28, h: 0.2, fontFace: TITLE_FONT, fontSize: 17, bold: true, color: TEXT, margin: 0 });
}

function addImageOrPlaceholder(slide, data, box, label) {
  if (data) {
    slide.addImage({ data, ...box });
    return;
  }
  slide.addShape("roundRect", {
    ...box,
    rectRadius: 0.05,
    line: { color: BORDER, pt: 1, dash: "dash" },
    fill: { color: HEADER_FILL }
  });
  slide.addText(`${label}\nNot available for this chip`, {
    x: box.x + 0.2,
    y: box.y + box.h / 2 - 0.2,
    w: box.w - 0.4,
    h: 0.4,
    align: "center",
    valign: "mid",
    fontFace: BODY_FONT,
    fontSize: 11,
    color: MUTED,
    margin: 0
  });
}

function buildTableRows(summaryRows) {
  const header = [
    { text: "Chip", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    { text: "Location", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    { text: "Prop Loss", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    { text: "MSE", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    { text: "Status", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    { text: "Peak WL", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    { text: "Insertion", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    { text: "3 dB BW", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } }
  ];

  const body = summaryRows.map((row) => {
    const statusFill = row.status === "PASS" ? SUCCESS : WARNING;
    const statusColor = row.status === "PASS" ? SUCCESS_TEXT : WARNING_TEXT;
    return [
      row.chipId,
      row.location,
      formatMetric(row.propagationLoss, "dB/cm"),
      formatNumber(row.mse, 4),
      { text: row.status, options: { bold: true, align: "center", fill: statusFill, color: statusColor } },
      formatMetric(row.peakWavelengthNm, "nm", 1),
      formatMetric(row.insertionLossDb, "dB"),
      formatMetric(row.bandwidth3dBNm, "nm", 1)
    ];
  });

  return [header, ...body];
}

function addTitleSlide(pptx, context) {
  const slide = pptx.addSlide();
  addSlideFrame(slide, `${context.projectCode} ${context.slotLabel} Post-Processed Report`, `Generated ${context.generatedAtLabel}${context.selectedDate ? ` | Measurement date ${context.selectedDate}` : ""}`, "Report Generator");

  addMetricCard(slide, { x: 0.45, y: 1.65, w: 2.0, label: "Measured chips", value: String(context.summary.measuredChips || 0) });
  addMetricCard(slide, { x: 2.65, y: 1.65, w: 2.0, label: "Passing chips", value: String(context.summary.fittedChips || 0), accent: TEAL });
  addMetricCard(slide, { x: 4.85, y: 1.65, w: 2.0, label: "Failed fits", value: String(context.summary.failedFits || 0), accent: "C65D48" });
  addMetricCard(slide, { x: 7.05, y: 1.65, w: 2.5, label: "Avg propagation", value: formatMetric(context.summary.avgPropagationLossDbPerCm, "dB/cm") });
  addMetricCard(slide, { x: 9.75, y: 1.65, w: 2.9, label: "Avg peak wavelength", value: formatMetric(context.summary.avgPeakWavelengthNm, "nm", 1) });

  slide.addShape("roundRect", {
    x: 0.45,
    y: 3.02,
    w: 6.05,
    h: 2.9,
    rectRadius: 0.08,
    line: { color: BORDER, pt: 1 },
    fill: { color: WHITE }
  });
  slide.addText("Deck contents", { x: 0.68, y: 3.22, w: 2.2, h: 0.18, fontFace: TITLE_FONT, fontSize: 18, bold: true, color: TEXT, margin: 0 });
  slide.addText([
    { text: "1. Summary KPIs and measurement settings" },
    { text: "2. Chip summary table with loss, MSE, peak wavelength, insertion loss, and bandwidth" },
    { text: "3. Wafermaps for chip IDs and wafer-level metrics" },
    { text: "4. One detailed slide per measured chip with fit, transmission, and loss spectrum plots" }
  ], {
    x: 0.74,
    y: 3.62,
    w: 5.4,
    h: 2.1,
    breakLine: true,
    bullet: { indent: 14 },
    paraSpaceAfterPt: 8,
    fontFace: BODY_FONT,
    fontSize: 12,
    color: TEXT,
    margin: 0
  });

  slide.addShape("roundRect", {
    x: 6.8,
    y: 3.02,
    w: 5.95,
    h: 2.9,
    rectRadius: 0.08,
    line: { color: BORDER, pt: 1 },
    fill: { color: BRAND_SOFT }
  });
  slide.addText("Analysis settings", { x: 7.03, y: 3.22, w: 2.4, h: 0.18, fontFace: TITLE_FONT, fontSize: 18, bold: true, color: BRAND, margin: 0 });
  slide.addTable([
    ["Target wavelength", `${context.sourceMeta.propagationTargetWavelengthNm} nm`],
    ["Averaging window", `+/- ${context.sourceMeta.propagationWindowNm} nm`],
    ["Spectral step", `${context.sourceMeta.propagationSpectralStepNm} nm`],
    ["MSE threshold", formatNumber(context.sourceMeta.propagationMseThreshold, 2)],
    ["Waveguide count", String(context.sourceMeta.propagationWaveguideCount || "--")],
    ["Launch power", `${context.sourceMeta.launchPowerDbm ?? "--"} dBm`]
  ], {
    x: 7.05,
    y: 3.65,
    w: 5.45,
    border: { type: "solid", pt: 1, color: BORDER },
    fill: WHITE,
    fontFace: BODY_FONT,
    fontSize: 11,
    color: TEXT,
    margin: 0.06,
    colW: [2.45, 3.0],
    rowH: 0.33
  });
}

function addChipSummarySlides(pptx, context, summaryRows) {
  for (let index = 0; index < summaryRows.length; index += TABLE_ROWS_PER_SLIDE) {
    const pageRows = summaryRows.slice(index, index + TABLE_ROWS_PER_SLIDE);
    const slide = pptx.addSlide();
    const pageNumber = Math.floor(index / TABLE_ROWS_PER_SLIDE) + 1;
    const totalPages = Math.max(Math.ceil(summaryRows.length / TABLE_ROWS_PER_SLIDE), 1);
    addSlideFrame(slide, "Chip Summary Table", `${context.projectCode} | ${context.slotLabel} | ${pageRows.length} chip rows on this slide`, `Summary ${pageNumber}/${totalPages}`);
    slide.addTable(buildTableRows(pageRows), {
      x: 0.42,
      y: 1.6,
      w: 12.45,
      border: { type: "solid", pt: 1, color: BORDER },
      fill: WHITE,
      fontFace: BODY_FONT,
      fontSize: 10,
      color: TEXT,
      margin: 0.05,
      colW: [1.35, 1.15, 1.55, 1.1, 0.95, 1.45, 1.4, 1.35],
      rowH: 0.34,
      autoFit: false,
      valign: "mid"
    });
  }
}

async function buildWafermapViews(context) {
  const baseCells = context.currentWaferCells || [];
  const buildMetricCells = (metricRows = []) => baseCells.map((cell) => {
    const metricCell = metricRows.find((item) => item.chipId === cell.chipId);
    return {
      ...cell,
      value: metricCell?.value ?? null,
      detail: metricCell?.detail ?? cell.detail,
      hasMeasurement: metricCell?.value !== null && metricCell?.value !== undefined
    };
  });

  const views = [
    {
      title: "Wafermap - Chip Numbers",
      metricKey: "propagation",
      overlayMode: "chip",
      cells: baseCells
    },
    {
      title: "Wafermap - Propagation Loss",
      metricKey: "propagation",
      overlayMode: "value",
      cells: baseCells
    }
  ];

  if ((context.metrics.insertion.waferMetric || []).length) {
    views.push({
      title: "Wafermap - Insertion Loss",
      metricKey: "insertion",
      overlayMode: "value",
      cells: buildMetricCells(context.metrics.insertion.waferMetric)
    });
  }

  if ((context.metrics.heater.waferMetric || []).length) {
    views.push({
      title: "Wafermap - Heater Efficiency",
      metricKey: "heater",
      overlayMode: "value",
      cells: buildMetricCells(context.metrics.heater.waferMetric)
    });
  }

  const subtitle = `${context.projectCode} | ${context.slotLabel} | ${context.currentWaferTemplate?.name || "Current Template"}`;
  const rendered = [];
  for (const view of views) {
    context.onProgress?.(`Rendering ${view.title.toLowerCase()}...`);
    const png = await buildWaferMapPng({
      cells: view.cells,
      metricKey: view.metricKey,
      overlayMode: view.overlayMode,
      notchOrientation: context.currentWaferTemplate?.notchOrientation || "south",
      title: view.title,
      subtitle,
      colorScaleMin: context.sourceMeta.waferColorScaleMin,
      colorScaleMid: context.sourceMeta.waferColorScaleMid,
      colorScaleMax: context.sourceMeta.waferColorScaleMax
    });
    rendered.push({ ...view, dataUrl: await blobToDataUrl(png) });
  }
  return rendered;
}

function addWafermapSlides(pptx, context, wafermapViews) {
  const groups = [];
  for (let index = 0; index < wafermapViews.length; index += 2) {
    groups.push(wafermapViews.slice(index, index + 2));
  }

  groups.forEach((group, index) => {
    const slide = pptx.addSlide();
    addSlideFrame(slide, "Wafermaps", `${context.projectCode} | ${context.slotLabel} | Spatial summary of measured chips`, `Wafermaps ${index + 1}/${groups.length}`);
    group.forEach((view, itemIndex) => {
      const isTop = itemIndex === 0;
      const boxY = isTop ? 1.45 : 4.12;
      slide.addText(view.title.replace("Wafermap - ", ""), { x: 0.52, y: boxY, w: 4.0, h: 0.2, fontFace: TITLE_FONT, fontSize: 15, bold: true, color: TEXT, margin: 0 });
      slide.addImage({ data: view.dataUrl, x: 0.42, y: boxY + 0.3, w: 12.0, h: 2.15 });
    });
  });
}

async function renderChipAssets(chip, context) {
  const fitPlot = buildPropagationPlotSpec({
    chip,
    projectCode: context.projectCode,
    slotLabel: context.slotLabel,
    targetWavelengthNm: context.sourceMeta.propagationTargetWavelengthNm,
    windowNm: context.sourceMeta.propagationWindowNm
  });
  const spectrumPlot = buildPropagationSpectrumPlotSpec({ chip, projectCode: context.projectCode });
  const transmissionPlot = buildTransmissionSpectrumPlotSpec({ chip, projectCode: context.projectCode });

  return {
    fit: fitPlot ? blobToDataUrl(await renderPlotSpecToPng(fitPlot, 1600, 980, 2)) : null,
    spectrum: spectrumPlot ? blobToDataUrl(await renderPlotSpecToPng(spectrumPlot, 1600, 840, 2)) : null,
    transmission: transmissionPlot ? blobToDataUrl(await renderPlotSpecToPng(transmissionPlot, 1600, 840, 2)) : null
  };
}

function addChipSlide(pptx, context, chip, assets, index, total) {
  const slide = pptx.addSlide();
  addSlideFrame(slide, `${context.projectCode} | ${context.slotLabel} | ${chip.chipId}`, `Propagation report section | ${locationLabel(chip)} | Slide ${index + 1} of ${total}`, `Chip ${index + 1}/${total}`);

  addImageOrPlaceholder(slide, assets.fit, { x: 0.42, y: 1.55, w: 5.45, h: 2.25 }, "Propagation loss fit");
  addImageOrPlaceholder(slide, assets.transmission, { x: 6.06, y: 1.55, w: 6.82, h: 2.25 }, "Transmission spectrum");
  addImageOrPlaceholder(slide, assets.spectrum, { x: 0.42, y: 4.12, w: 5.45, h: 2.45 }, "Propagation loss spectrum");

  slide.addShape("roundRect", {
    x: 6.06,
    y: 4.12,
    w: 6.82,
    h: 2.45,
    rectRadius: 0.05,
    line: { color: BORDER, pt: 1 },
    fill: { color: WHITE }
  });
  slide.addText("Chip metrics", { x: 6.3, y: 4.28, w: 2.0, h: 0.18, fontFace: TITLE_FONT, fontSize: 16, bold: true, color: TEXT, margin: 0 });
  slide.addTable([
    ["Chip", chip.chipId],
    ["Location", locationLabel(chip)],
    ["Propagation loss", formatMetric(chip.lossDbPerCm, "dB/cm")],
    ["MSE", formatNumber(chip.mse, 4)],
    ["Fit status", chipStatus(chip)],
    ["Peak wavelength", formatMetric(chip.transmissionSummary?.peakWavelengthNm, "nm", 1)],
    ["Insertion loss", formatMetric(chip.transmissionSummary?.insertionLossDb, "dB")],
    ["3 dB bandwidth", formatMetric(chip.transmissionSummary?.bandwidth3dBNm, "nm", 1)],
    ["Fit points", String(chip.samples?.length || 0)],
    ["Spectral points", String(chip.spectralSeries?.length || 0)]
  ], {
    x: 6.28,
    y: 4.64,
    w: 6.38,
    border: { type: "solid", pt: 1, color: BORDER },
    fill: WHITE,
    fontFace: BODY_FONT,
    fontSize: 10,
    color: TEXT,
    margin: 0.05,
    colW: [2.45, 3.93],
    rowH: 0.22
  });
}

export async function generatePowerPointReport({
  projectCode,
  slotLabel,
  selectedDate,
  sourceMeta,
  metrics,
  currentWaferTemplate,
  currentWaferCells,
  onProgress
}) {
  const generatedAt = new Date();
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "CORNERSTONE Testing App";
  pptx.company = "CORNERSTONE";
  pptx.subject = `${projectCode} ${slotLabel} post-processed measurement report`;
  pptx.title = `${projectCode} ${slotLabel} post-processed report`;
  pptx.lang = "en-GB";
  pptx.theme = {
    headFontFace: TITLE_FONT,
    bodyFontFace: BODY_FONT,
    lang: "en-GB"
  };

  const context = {
    projectCode,
    slotLabel,
    selectedDate,
    sourceMeta,
    metrics,
    currentWaferTemplate,
    currentWaferCells,
    generatedAtLabel: generatedAt.toLocaleString(),
    summary: metrics.propagation.summaryStats,
    onProgress
  };

  const summaryRows = buildChipSummaryRows(metrics.propagation.byChip || []);

  onProgress?.("Building PPT overview slides...");
  addTitleSlide(pptx, context);
  addChipSummarySlides(pptx, context, summaryRows);

  onProgress?.("Rendering wafermaps for the PPT...");
  const wafermapViews = await buildWafermapViews(context);
  addWafermapSlides(pptx, context, wafermapViews);

  for (let index = 0; index < metrics.propagation.byChip.length; index += 1) {
    const chip = metrics.propagation.byChip[index];
    onProgress?.(`Rendering PPT chip slide ${index + 1}/${metrics.propagation.byChip.length}: ${chip.chipId}`);
    const renderedAssets = await renderChipAssets(chip, context);
    const assets = {
      fit: await renderedAssets.fit,
      spectrum: await renderedAssets.spectrum,
      transmission: await renderedAssets.transmission
    };
    addChipSlide(pptx, context, chip, assets, index, metrics.propagation.byChip.length);
  }

  onProgress?.("Finalizing PowerPoint file...");
  const blob = await pptx.write({ outputType: "blob" });
  const fileBase = `post_processed_report_${sanitizeSegment(projectCode, "MPWUNDEFINED")}_${sanitizeSegment(String(slotLabel || "SlotUndefined").toUpperCase(), "SLOTUNDEFINED")}_${formatDateStamp(generatedAt)}`;

  return {
    blob,
    fileName: `${fileBase}.pptx`,
    slideCount: pptx._slides?.length || 0,
    chipCount: metrics.propagation.byChip.length
  };
}


