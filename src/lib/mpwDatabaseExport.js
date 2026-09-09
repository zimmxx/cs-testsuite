import { METRICS, statistics, formatValue, markdownLog } from './mpwDatabase.js';
import { formatExcelPackage } from './mpwExcelFormat.js';

export function downloadFile(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportJson(db) { downloadFile(JSON.stringify(db, null, 2), `CORNERSTONE-MPW-V${db.version}.json`, 'application/json'); }
export function exportLog(db) { downloadFile(markdownLog(db), `CORNERSTONE-MPW-V${db.version}-updates.md`, 'text/markdown'); }

export async function buildExcel(db, records, scope) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const generated = new Date().toISOString();
  const headers = ['Platform', 'MPW / Project', 'Step', 'Slot', 'Building block', 'Optical mode', 'Parameter', 'Unit', 'Mean / value', 'Included chips', 'Total chips', 'Sample SD (snapshot)', 'Minimum (snapshot)', 'Maximum (snapshot)', 'Measurement date', 'Method', 'Chip / record', 'Include (1/0)', 'Review', 'Source', 'Notes'];
  const summaryCells = new Map();
  function makeSheet(rows, details) {
    const aoa = [['CORNERSTONE MPW Measurement Records'], [`V${db.version} | Generated ${generated} | ${scope}`], ['Chip rows are collapsed. Expand using Excel outline +. Change Include 1/0 to recalculate; failed chips remain excluded.'], headers];
    const outline = [{}, {}, {}, {}];
    const formulas = [];
    for (const r of rows) {
      const s = statistics(r);
      const prefix = [r.platform, r.project, r.step, r.slot, r.buildingBlock, r.opticalMode, r.parameter, r.unit];
      const row = aoa.length;
      if (details) summaryCells.set(r.id, { sheet: METRICS[r.metric].label, row: row + 1 });
      aoa.push([...prefix, s.mean, s.count, s.total, s.sd, s.min, s.max, r.date, r.method, r.chips.length ? 'Chip average' : 'Summary only', '', '', r.sourceRef || r.source, r.notes]);
      outline.push({ level: 0, collapsed: details && r.chips.length > 0 });
      if (details && r.chips.length) {
        const start = aoa.length + 1;
        for (const c of r.chips) {
          aoa.push([...prefix, c.value, '', '', '', '', '', r.date, r.method, c.id, c.included ? 1 : 0, c.status, r.sourceRef || r.source, c.reason || '']);
          outline.push({ level: 1, hidden: true });
        }
        const end = aoa.length;
        formulas.push({ row, start, end, s });
      }
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    // Text is always typed as text; user-entered = strings cannot become formulas.
    for (const { row, start, end, s } of formulas) {
      const n = row + 1;
      const eligible = `R${start}:R${end},1,S${start}:S${end},"<>failed",I${start}:I${end},"<>"`;
      sheet[`I${n}`] = { t: s.mean === null ? 'str' : 'n', f: `IFERROR(AVERAGEIFS(I${start}:I${end},${eligible}),"")`, v: s.mean ?? '' };
      sheet[`J${n}`] = { t: 'n', f: `COUNTIFS(${eligible})`, v: s.count };
      // SD/min/max are labelled snapshot statistics; live mean/count are authoritative after edits.
    }
    sheet['!rows'] = outline;
    sheet['!outline'] = { above: true };
    sheet['!cols'] = headers.map((h, i) => ({ wch: [4, 19, 20].includes(i) ? 34 : i === 0 ? 23 : 19 }));
    sheet['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: 20 } }));
    if (aoa.length > 4) sheet['!autofilter'] = { ref: `A4:U${aoa.length}` };
    for (const key of Object.keys(sheet)) if (!key.startsWith('!') && sheet[key].t === 'n') sheet[key].z = '0.000';
    return sheet;
  }
  XLSX.utils.book_append_sheet(workbook, makeSheet(records, false), 'Master Summary');
  for (const [metric, spec] of Object.entries(METRICS)) XLSX.utils.book_append_sheet(workbook, makeSheet(records.filter(r => r.metric === metric), true), spec.label);
  records.forEach((r, index) => {
    const target = summaryCells.get(r.id);
    const stats = statistics(r);
    for (const [column, value] of [['I', stats.mean], ['J', stats.count]]) {
      workbook.Sheets['Master Summary'][`${column}${index + 5}`] = { t: value === null ? 'str' : 'n', v: value ?? '', f: `IF('${target.sheet}'!${column}${target.row}="","",'${target.sheet}'!${column}${target.row})`, z: column === 'I' ? '0.000' : '0' };
    }
  });
  workbook.Workbook = { CalcPr: { calcMode: 'auto' } };
  return workbook;
}

export async function exportExcel(db, records, scope) {
  const XLSX = await import('xlsx');
  const workbook = await buildExcel(db, records, scope);
  const generated = new Date().toISOString();
  downloadFile(formatExcelPackage(XLSX, workbook), `CORNERSTONE-MPW-V${db.version}-${generated.slice(0, 10)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function buildPdf(db, records, scope) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const generated = new Date().toISOString();
  let y = 0;
  const ascii = value => String(value ?? '').replace(/π/g, 'pi').replace(/—/g, '-').replace(/[^\x20-\x7E\n]/g, ' ');
  function header() {
    pdf.setFillColor(40, 33, 92); pdf.rect(0, 0, 297, 28, 'F'); pdf.setTextColor(255);
    pdf.setFontSize(17); pdf.text('CORNERSTONE MPW Measurement Records', 12, 12);
    pdf.setFontSize(8); pdf.text(`V${db.version} | Generated ${generated}`, 12, 21);
    pdf.setTextColor(40); pdf.setFontSize(8); const scopeLines = pdf.splitTextToSize(ascii(scope), 270); pdf.text(scopeLines, 12, 34); y = 38 + scopeLines.length * 3.5;
  }
  const widths = [27, 31, 44, 42, 18, 20, 23, 24, 44];
  const headings = ['Project / Slot', 'Platform / Step', 'Building block / Mode', 'Parameter', 'Mean', 'Unit', 'Included / Total', 'Measured', 'Source'];
  function tableHead(title) {
    pdf.setFontSize(12); pdf.setTextColor(53, 42, 134); pdf.text(ascii(title), 12, y); y += 6;
    pdf.setFillColor(235, 232, 248); pdf.rect(12, y, 273, 12, 'F');
    pdf.setFontSize(8); pdf.setTextColor(40); pdf.setFont('helvetica', 'bold');
    let x = 12; headings.forEach((label, i) => { pdf.text(pdf.splitTextToSize(label, widths[i] - 4), x + 2, y + 4); x += widths[i]; });
    y += 12; pdf.setFont('helvetica', 'normal');
  }
  const sections = [['Master Summary', records], ...Object.entries(METRICS).map(([key, spec]) => [spec.label, records.filter(r => r.metric === key)])];
  sections.forEach(([title, selected], sectionIndex) => {
    if (sectionIndex) pdf.addPage(); header();
    pdf.setFontSize(8); pdf.text('Record averages; included non-failed chips only. Historical summaries retain their source value. Missing values: -.', 12, y); y += 8;
    tableHead(`${title} (${selected.length} records)`);
    if (!selected.length) { pdf.text('No records in this selection.', 14, y + 6); return; }
    selected.forEach((r, index) => {
      const stats = statistics(r);
      const values = [`${r.project}\n${r.slot}`, `${r.platform}\n${r.step}`, `${r.buildingBlock}\n${r.opticalMode || 'Unspecified'}`, r.parameter, formatValue(stats.mean), r.unit, r.chips.length ? `${stats.count} / ${stats.total}` : 'Summary only', r.date || 'Unknown', `${r.source === 'reference' ? 'Excel overview' : r.source === 'library' ? 'GitHub library' : 'Manual'}\nRef ${records.indexOf(r) + 1}`];
      pdf.setFontSize(8);
      const lines = values.map((value, i) => pdf.splitTextToSize(ascii(value), widths[i] - 4));
      const height = Math.max(12, Math.max(...lines.map(v => v.length)) * 3.5 + 5);
      if (y + height > 193) { pdf.addPage(); header(); tableHead(`${title} (continued)`); }
      if (index % 2 === 0) { pdf.setFillColor(247, 248, 252); pdf.rect(12, y, 273, height, 'F'); }
      pdf.setTextColor(40); pdf.setDrawColor(218, 220, 230); pdf.setLineWidth(0.15);
      let x = 12; lines.forEach((value, i) => { pdf.rect(x, y, widths[i], height); pdf.text(value, x + 2, y + 4); x += widths[i]; });
      y += height;
    });
  });
  if (records.length) {
    pdf.addPage(); header(); pdf.setFontSize(12); pdf.text('Source references and measurement notes', 12, y); y += 8;
    records.forEach((r, index) => {
      pdf.setFontSize(8);
      const lines = pdf.splitTextToSize(ascii(`Ref ${index + 1}: ${r.project} / ${r.slot} / ${r.parameter} | ${r.sourceRef || r.source} | Method: ${r.method || 'Unknown'}${r.notes ? ' | ' + r.notes : ''}`), 270);
      lines.forEach(line => { if (y > 190) { pdf.addPage(); header(); pdf.setFontSize(8); } pdf.text(line, 12, y); y += 4; }); y += 3;
    });
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) { pdf.setPage(page); pdf.setFontSize(8); pdf.setTextColor(100); pdf.text(`V${db.version} | ${db.updatedAt ? 'Database updated ' + db.updatedAt : 'Local draft'} | Page ${page} of ${pdf.getNumberOfPages()}`, 12, 203); }
  return pdf;
}
export async function exportPdf(db, records, scope) {
  const pdf = await buildPdf(db, records, scope);
  pdf.save(`CORNERSTONE-MPW-Measurement-Records-V${db.version}.pdf`);
}
