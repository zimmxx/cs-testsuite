// Apply presentation and native Excel controls to the generated OOXML workbook.
// SheetJS CE preserves data/formulas/outlines but does not write cell styles.
export function formatExcelPackage(XLSX, workbook) {
  XLSX = XLSX.CFB ? XLSX : XLSX.default;
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const archive = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  function transform(path, update) {
    const index = archive.FullPaths.findIndex(p => p.endsWith('/' + path));
    if (index < 0) throw new Error(`Workbook package is missing ${path}`);
    const entry = archive.FileIndex[index];
    const content = encoder.encode(update(decoder.decode(entry.content)));
    entry.content = content; entry.size = content.length;
  }
  const styles = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="164" fontId="0" fillId="3" borderId="0" xfId="0"/>'
  ];
  transform('xl/styles.xml', () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/><color rgb="FF202442"/></font><font><b/><sz val="20"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><sz val="10"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF352A86"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF352A86"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0EEF8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length}">${styles.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  workbook.SheetNames.forEach((name, index) => {
    const worksheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    transform(`xl/worksheets/sheet${index + 1}.xml`, xml => {
      xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="4" ySplit="4" topLeftCell="E5" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>');
      xml = xml.replace(/<row\b([^>]*)>/g, (match, attrs) => {
        const row = Number(attrs.match(/\br="(\d+)"/)?.[1]);
        const height = row === 1 ? 36 : row < 4 ? 30 : row === 4 ? 34 : worksheet['!rows']?.[row - 1]?.level ? 24 : 44;
        return `<row${attrs.replace(/\s(?:ht|customHeight)="[^"]*"/g, '')} ht="${height}" customHeight="1">`;
      });
      xml = xml.replace(/<c\b([^>]*)>/g, (match, attrs) => {
        const address = attrs.match(/\br="([A-Z]+)(\d+)"/); if (!address) return match;
        const row = Number(address[2]); const numeric = ['I', 'L', 'M', 'N'].includes(address[1]);
        const style = row <= 4 ? row : numeric ? (row % 2 ? 7 : 8) : row % 2 ? 5 : 6;
        return `<c${attrs.replace(/\ss="[^"]*"/g, '')} s="${style}">`;
      });
      if (index > 0 && range.e.r >= 4) {
        const validation = `<dataValidations count="1"><dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Use 1 or 0" error="Enter 1 to include or 0 to exclude a chip." sqref="R5:R${range.e.r + 1}"><formula1>0</formula1><formula2>1</formula2></dataValidation></dataValidations>`;
        const marker = xml.match(/<(?:ignoredErrors|pageMargins|pageSetup|drawing)\b/);
        xml = marker ? xml.slice(0, marker.index) + validation + xml.slice(marker.index) : xml.replace('</worksheet>', validation + '</worksheet>');
      }
      return xml;
    });
  });
  return XLSX.CFB.write(archive, { type: 'array', fileType: 'zip', compression: true });
}
