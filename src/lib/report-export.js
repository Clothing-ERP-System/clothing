import { strToU8, zipSync } from 'fflate';
import PDFDocument from 'pdfkit';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index) {
  let name = '';
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

export async function generateXlsxReport(report, filters) {
  const columns = Object.keys(report.records[0] || {});
  const rows = [
    { values: ['ERP Dost', report.title] },
    { values: ['Generated at', new Date().toISOString()] },
    { values: ['Date range', `${filters.from || 'Beginning'} to ${filters.to || 'Current'}`] },
  ];
  if (filters.branch) rows.push({ values: ['Branch', filters.branch] });
  rows.push({ values: [] });
  if (columns.length) {
    rows.push({ values: columns, bold: true });
    report.records.forEach((row) => rows.push({ values: columns.map((column) => row[column]) }));
    rows.push({ values: [] });
  } else {
    rows.push({ values: ['No records match the selected filters.'] });
  }
  rows.push({ values: ['Totals', ...Object.entries(report.totals).map(([key, value]) => `${key}: ${Number(value).toLocaleString()}`)], bold: true });

  const maxColumns = Math.max(...rows.map((row) => row.values.length), 1);
  const lastColumn = columnName(maxColumns - 1);
  const sheetName = report.title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Report';
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.values.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      const style = row.bold ? ' s="1"' : '';
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${reference}"${style}><v>${value}</v></c>`;
      }
      return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  });
  const widths = Array.from({ length: maxColumns }, (_, index) => {
    const header = columns[index] || '';
    return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(32, Math.max(14, header.length + 2))}" customWidth="1"/>`;
  }).join('');
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${rows.length}"/><cols>${widths}</cols><sheetData>${sheetRows.join('')}</sheetData></worksheet>`),
  };
  return Buffer.from(zipSync(files, { level: 6 }));
}

export function generatePdfReport(report, filters) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.fontSize(18).text(`ERP DOST — ${report.title}`);
    document.moveDown(0.4).fontSize(9).fillColor('#555555')
      .text(`Generated: ${new Date().toISOString()} | Date range: ${filters.from || 'Beginning'} to ${filters.to || 'Current'}${filters.branch ? ` | Branch: ${filters.branch}` : ''}`);
    document.moveDown().fillColor('#111111').fontSize(8);
    const columns = Object.keys(report.records[0] || {});
    if (columns.length) {
      const cellWidth = 770 / columns.length;
      const drawRow = (values, bold = false) => {
        if (document.y > 520) document.addPage();
        const rowY = document.y;
        document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
        values.forEach((value, index) => {
          document.text(String(value ?? '').replace(/[\u0000-\u001f\u007f|]/g, ' '), 36 + index * cellWidth, rowY, {
            width: cellWidth - 4,
            height: 24,
            ellipsis: true,
            lineBreak: false,
          });
        });
        document.y = rowY + 22;
      };
      drawRow(columns, true);
      report.records.forEach((row) => drawRow(columns.map((column) => row[column])));
    } else {
      document.text('No records match the selected filters.');
    }
    document.moveDown().fontSize(9).text(
      `Totals: ${Object.entries(report.totals).map(([key, value]) => `${key}: ${Number(value).toLocaleString()}`).join(' | ')}`
    );
    document.end();
  });
}
