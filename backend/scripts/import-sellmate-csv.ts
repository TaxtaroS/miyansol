import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

type CsvRow = Record<string, string>;
type Product = { id: number; name: string; barcode: string | null };

const sourcePath = path.resolve(process.argv[2] || 'C:/Users/USER/Downloads/stk_forInOut_20260811_100830.csv');
const dryRun = process.argv.includes('--dry-run');
const createMissing = process.argv.includes('--create-missing');
const db = new Database(path.resolve(import.meta.dirname, '../data/inventory.db'));

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift()?.map(value => value.trim()) || [];
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]))) as CsvRow[];
}

const translations: Record<string, string> = {
  Apple:'애플', Aqua:'아쿠아', Bahamsa:'바함사', Barbie:'바비', Beige:'베이지', Black:'블랙', Blossom:'블로썸',
  BlueBerry:'블루베리', Blueberry:'블루베리', Blue:'블루', Bronze:'브론즈', Brown:'브라운', Camel:'카멜', camel:'카멜', Candy:'캔디',
  Cherry:'체리쥬빌레', Choco:'초코', Chunjang2:'춘장2', Chunjang:'춘장', Donghae:'동해', Egg:'에그', egg:'에그',
  Foil2:'호일2', Foil:'호일', foil:'호일', Gaetbeol:'갯벌', Gerbera:'거베라', Gold:'골드', Grape:'그레이프', Gray:'그레이',
  Hama2:'하마2', Hama:'하마', Indian:'인디언', Ivory:'아이보리', Jackson:'잭슨', Jangmi2:'장미2', Jangmi:'장미',
  Jeju:'제주', Khaki:'카키', Koppulso:'코뿔소', Latte:'라떼', Lemon:'레몬', Lilac:'라일락', Lily:'릴리', Macaron:'마카롱',
  'M.Gray':'민트그레이', Mintgray:'민트그레이', Mocha:'모카', Mud:'머드', Namhae:'남해', Navy:'네이비', Neon:'형광',
  Orange:'오렌지', Peach:'피치', Peony:'피오니', Peppermint:'페퍼민트', Pink:'핑크', Pistachio:'피스타치오', Purple:'퍼플',
  Pumpkin:'펌킨', Rich:'리치', Roje:'로제', Shark:'샤크', Silver:'실버', Sky:'스카이', Soldier2:'솔져2', Soldier:'솔져',
  Sopho2:'소포2', Sopho:'소포', Starkhaki:'스타카키', Stone:'스톤', Sunchang:'순창', Time:'타임', Unicorn:'유니콘',
  Violet:'바이올렛', Wine:'와인', Yeontan2:'연탄2', Yeontan:'연탄', Yeosu:'여수', Yogurt:'요거트', Olive:'올리브',
  Mint:'민트', Green:'그린',
};

function translate(value: string) {
  return translations[value] || value;
}

function translatePhrase(value: string) {
  if (value.startsWith('Disco ')) return `디스코 ${translate(value.slice(6))}`;
  return translate(value);
}

function numbered(name: string, prefix: string) {
  const match = name.match(/(\d+)\s*$/);
  return match ? `${prefix}${Number(match[1])}` : '';
}

function targetName(row: CsvRow) {
  const category = row['상품분류'];
  const name = row['상품명'];
  let match: RegExpMatchArray | null;
  if ((match = name.match(/^Basic bag (.+) ([LS])$/))) return `기본백 ${translatePhrase(match[1])} ${match[2]}`;
  if ((match = name.match(/^Mini bag (.+)$/))) return `미니백 ${match[1] === 'Bahamsa' ? '바람과함께사라지다' : translatePhrase(match[1])}`;
  if ((match = name.match(/^Accordion bag (.+)$/))) return `아코디언백 ${translate(match[1])}`;
  if ((match = name.match(/^Brick Bag (.+)$/i))) return `브릭백 ${translate(match[1])}`;
  if ((match = name.match(/^Heart bag (.+)$/i))) return `하트백 ${translate(match[1])}`;
  if ((match = name.match(/^Lagoon Big Bag (.+)$/i))) return `라군 빅백 ${translate(match[1])}`;
  if ((match = name.match(/^Mandu bag (.+)$/i))) return `만두백 ${translate(match[1])}`;
  if ((match = name.match(/^Memory bag (.+)$/i))) return `메모리백 ${translate(match[1])}`;
  if ((match = name.match(/^Mink bag (.+) ([LM])$/i))) return `밍크백 ${translate(match[1])} ${match[2] === 'L' ? '라지' : '미니'}`;
  if ((match = name.match(/^Ugg bag (.+) ([LM])$/i))) return `어그백 ${translate(match[1])} ${match[2] === 'L' ? '라지' : '미니'}`;
  if ((match = name.match(/^Hopi Mink bag (.+) M$/i))) return `호피백 ${translate(match[1])} 미니`;
  if ((match = name.match(/^Pier bag Mini (.+)$/i))) return `피어백 미니 ${translate(match[1])}`;
  if ((match = name.match(/^Pier bag (.+)$/i))) return `피어백 ${translate(match[1])}`;
  if ((match = name.match(/^Quilting Pouch (.+)$/i))) return `퀼팅 파우치 ${translate(match[1])}`;
  if ((match = name.match(/^Square Pouch A D\.(.+)$/i))) return `스퀘어 파우치 A 디스코 ${translate(match[1])}`;
  if ((match = name.match(/^Square Pouch A (.+)$/i))) return `스퀘어 파우치 A ${translate(match[1])}`;
  if ((match = name.match(/^Square Pouch B (.+)$/i))) return `스퀘어 파우치 B ${translate(match[1])}`;
  if ((match = name.match(/^Square 3Pouch Dot (.+)$/i))) return `스퀘어 3 파우치백 도트 ${translate(match[1])}`;
  if ((match = name.match(/^Square 3Pouch Leo (.+)$/i))) return `스퀘어 3 파우치 레오파드 ${translate(match[1])}`;
  if ((match = name.match(/^Square 3Pouch ST (.+)$/i))) return `스퀘어 3 파우치백 ST ${translate(match[1])}`;
  if ((match = name.match(/^Square 3Pouch Twd (.+)$/i))) return `스퀘어 3 파우치백 트위드 ${translate(match[1])}`;
  if ((match = name.match(/^Rope Strap (\d+)$/i))) {
    const colors = ['그레이','블루','블랙','스카이','오렌지','올리브','와인','카멜'];
    return `로프 스트랩 ${colors[Number(match[1]) - 1] || match[1]}`;
  }
  if (/^HP Strap \d+$/i.test(name)) return numbered(name, 'H·P 스트랩');
  if (/^Flower Charm \d+$/i.test(name)) return numbered(name, '꽃참');
  if (/^Flowerkey Charm \d+$/i.test(name)) return numbered(name, '꽃키참');
  if (/^Heart Charm \d+$/i.test(name)) return numbered(name, '하트참');
  if (/^Lucky Charm \d+$/i.test(name)) return numbered(name, '럭키참');
  if (/^Meongmi charm \d+$/i.test(name)) return numbered(name, '멍미');
  if (/^Long Charm \d+$/i.test(name)) return numbered(name, '구슬');
  if (/^Mini Charm \d+$/i.test(name)) return numbered(name, '미니구슬');
  if (/^Rope Charm \d+$/i.test(name)) return numbered(name, '로프');
  if (/^Sol Charm \d+$/i.test(name)) return numbered(name, '솔참');
  if (/^Teolsil pompom \d+$/i.test(name)) return numbered(name, '털실폼폼');
  if (/^Dual bag /i.test(name) || category === '듀얼백') return '';
  if ((match = name.match(/^Mini pouch (.+)$/i))) return `미니 파우치 ${translate(match[1])}`;
  if (/^Towel Charm \d+$/i.test(name)) return numbered(name, '타월참');
  return '';
}

const csvText = new TextDecoder('euc-kr').decode(fs.readFileSync(sourcePath));
const rows = parseCsv(csvText).filter(row => row['공급처명'].includes('miyansol'));
if (createMissing && !dryRun) {
  const findProduct = db.prepare("SELECT id FROM products WHERE replace(lower(name),' ','')=replace(lower(?),' ','') LIMIT 1");
  const insertProduct = db.prepare('INSERT INTO products(sku,name,color,barcode,catalog_name) VALUES(?,?,?,?,?)');
  const insertInventory = db.prepare("INSERT OR IGNORE INTO inventory(product_id,location,quantity) VALUES(?, ?, 0)");
  db.transaction(() => {
    for (const row of rows) {
      const name = targetName(row);
      if (!name || findProduct.get(name)) continue;
      const catalogName = name.startsWith('기본백 ') ? name.replace(/^기본백\s+/,'').replace(/\s+[SL]$/i,'')
        : name.startsWith('미니 파우치 ') ? '미니 파우치'
        : name.startsWith('타월참') ? '타월참' : name;
      const result = insertProduct.run(row['사입상품명'] || `SELLMATE-${row['바코드번호(표시)']}`, name, '', row['바코드번호(표시)'] || null, catalogName);
      insertInventory.run(result.lastInsertRowid, 'FACTORY');
      insertInventory.run(result.lastInsertRowid, 'PICKING');
    }
  })();
}
const products = db.prepare('SELECT id,name,barcode FROM products WHERE active=1').all() as Product[];
const byName = new Map(products.map(product => [product.name.replace(/\s+/g, '').toLowerCase(), product]));
const matches: Array<{ row: CsvRow; product: Product; target: string }> = [];
const unmatched: Array<{ name: string; code: string; category: string; target: string }> = [];
const conflicts: Array<{ name: string; code: string; existing: string; incoming: string }> = [];

for (const row of rows) {
  const target = targetName(row);
  const product = target ? byName.get(target.replace(/\s+/g, '').toLowerCase()) : undefined;
  if (!product) { unmatched.push({name:row['상품명'],code:row['사입상품명'],category:row['상품분류'],target}); continue; }
  const barcode = row['바코드번호(서식)'];
  if (product.barcode && product.barcode !== barcode) conflicts.push({name:product.name,code:row['사입상품명'],existing:product.barcode,incoming:barcode});
  else matches.push({row,product,target});
}

const duplicateBarcodes = db.prepare(`SELECT barcode,COUNT(*) count FROM products WHERE barcode IS NOT NULL AND barcode!='' GROUP BY barcode HAVING COUNT(*)>1`).all();
const result = {source:rows.length,matched:matches.length,unmatched:unmatched.length,conflicts:conflicts.length,duplicateBarcodes,unmatchedItems:unmatched,conflictItems:conflicts};

if (!dryRun) {
  const updateProduct = db.prepare("UPDATE products SET barcode=? WHERE id=? AND (barcode IS NULL OR barcode='')");
  const upsertLabel = db.prepare(`INSERT INTO label_templates(vendor,category,product_name,barcode,source_path,product_id,template_data)
    VALUES('셀메이트',?,?,?,?,?,?)
    ON CONFLICT(source_path) DO UPDATE SET category=excluded.category,product_name=excluded.product_name,barcode=excluded.barcode,product_id=excluded.product_id,template_data=excluded.template_data`);
  const insertAlias = db.prepare(`INSERT OR IGNORE INTO product_aliases(product_id,alias,normalized_alias,source) VALUES(?,?,?,'SELLMATE')`);
  db.transaction(() => {
    db.prepare("DELETE FROM label_templates WHERE source_path='C:\\Users\\USER\\Downloads\\sellmate_custom_pdf_20260807_174736.pdf'").run();
    for (const {row,product} of matches) {
      const barcode = row['바코드번호(서식)'];
      const code = row['사입상품명'];
      updateProduct.run(barcode, product.id);
      upsertLabel.run(row['상품분류'], row['상품명'], barcode, `${sourcePath}#${barcode}`, product.id, JSON.stringify([code,row['상품명']]));
      for (const alias of [code,row['상품명']]) insertAlias.run(product.id,alias,alias.replace(/[^0-9a-z가-힣]/gi,'').toLowerCase());
    }
  })();
}

console.log(JSON.stringify(result, null, 2));
