import Database from 'better-sqlite3';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const db = new Database(fileURLToPath(new URL('../data/inventory.db', import.meta.url)));
const columns = db.prepare('PRAGMA table_info(label_templates)').all();
if (!columns.some(column => column.name === 'template_data')) db.exec('ALTER TABLE label_templates ADD COLUMN template_data TEXT');
const rows = db.prepare('SELECT id, source_path FROM label_templates').all();
const update = db.prepare('UPDATE label_templates SET template_data=? WHERE id=?');

function extract(file) {
  const source = fs.readFileSync(file, 'utf8');
  const values = [];
  const expression = /"c34fb5f8-f355-4304-9b3d-07cc6b2473c2"\s*:\s*("(?:\\.|[^"])*")/g;
  for (const match of source.matchAll(expression)) {
    try {
      const value = JSON.parse(match[1]).trim();
      if (value && !values.includes(value)) values.push(value);
    } catch { /* 손상된 개별 문자열은 건너뜁니다. */ }
  }
  return values;
}

let imported = 0;
const run = db.transaction(() => {
  for (const row of rows) {
    if (!fs.existsSync(row.source_path)) continue;
    const values = extract(row.source_path);
    update.run(JSON.stringify(values), row.id);
    imported += 1;
  }
});
run();
console.log(`라벨 원본 데이터 ${imported}개 연결 완료`);
