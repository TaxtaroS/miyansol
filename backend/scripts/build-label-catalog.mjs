import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const labelRoot = process.argv[2] || 'C:/Users/USER/Desktop/유니라벨';
const sellmateCsv = process.argv[3] || 'C:/Users/USER/Downloads/stk_forInOut_20260811_100830.csv';
const outputPath = fileURLToPath(new URL('../data/label-catalog.json', import.meta.url));
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.toLowerCase().endsWith('.uldx')) files.push(fullPath);
  }
}

function templateValues(source) {
  const values = [];
  const expression = /"c34fb5f8-f355-4304-9b3d-07cc6b2473c2"\s*:\s*("(?:\\.|[^"])*")/g;
  for (const match of source.matchAll(expression)) {
    try {
      const value = JSON.parse(match[1]).trim();
      if (value && !values.includes(value)) values.push(value);
    } catch { /* 손상된 문자열은 건너뜁니다. */ }
  }
  return values;
}

walk(labelRoot);
const vendorNames = {
  '롯데_온라인 라벨': '롯데_온라인',
};
const labels = files.map(file => {
  const relativePath = path.relative(labelRoot, file).split(path.sep).join('/');
  const parts = relativePath.split('/');
  const values = templateValues(fs.readFileSync(file, 'utf8'));
  const barcode = values.map(value => value.replace(/[\s-]/g, '')).find(value => /^\d{13}$/.test(value)) || null;
  return {
    vendor: vendorNames[parts[0]] || (parts.length > 1 ? parts[0] : '공통'),
    category: parts.slice(1, -1).join(' / '),
    product_name: path.basename(file, '.uldx').replace(/\s*-\s*복사본$/, ''),
    barcode,
    // Preserve the original UniLabel path. Existing labels imported from this
    // folder use this key too, so a catalog refresh updates them instead of
    // creating a second copy.
    source_path: file,
    template_data: values,
  };
});

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(cell); cell = ''; if (row.some(value => value)) rows.push(row); row = []; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift().map(value => value.trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])));
}

const sellmateRows = parseCsv(new TextDecoder('euc-kr').decode(fs.readFileSync(sellmateCsv)))
  .filter(row => row['공급처명']?.toLowerCase().includes('miyansol'));
for (const [index, row] of sellmateRows.entries()) {
  const candidate = (row['바코드번호(표시)'] || row['바코드번호(서식)'] || '').replace(/[^0-9]/g, '');
  const barcode = /^\d{13}$/.test(candidate) ? candidate : null;
  labels.push({
    vendor: '셀메이트',
    category: row['상품분류'] || '',
    product_name: row['상품명'] || barcode || `셀메이트 상품 ${index + 1}`,
    barcode,
    source_path: `${sellmateCsv}#${barcode || `row-${index + 1}`}`,
    template_data: [row['사입상품명'] || '', row['상품명'] || ''],
  });
}

fs.writeFileSync(outputPath, JSON.stringify({ version: 1, labels }, null, 2));
console.log(`매장 라벨 원본 ${labels.length}개를 ${outputPath}에 저장했습니다.`);
