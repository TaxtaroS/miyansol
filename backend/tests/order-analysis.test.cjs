const {test} = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const sharp = require('sharp');
const {createAsyncSqliteDatabase} = require('../dist/async-sqlite');
const {readOrderWithGemini} = require('../dist/gemini-order-reader');
const {matchProduct} = require('../dist/order-reader');

test('async SQLite rolls back all rows and isolates concurrent requests', async () => {
  const raw = new Database(':memory:');
  raw.exec('CREATE TABLE records(id INTEGER PRIMARY KEY)');
  const db = createAsyncSqliteDatabase(raw);
  let entered, release;
  const started = new Promise(resolve=>{entered=resolve});
  const resume = new Promise(resolve=>{release=resolve});
  const failing = db.transaction(async()=>{
    await db.prepare('INSERT INTO records VALUES(1)').run();
    entered(); await resume;
    await db.prepare('INSERT INTO records VALUES(2)').run();
    throw new Error('simulated failure');
  })();
  const rejected = assert.rejects(failing,/simulated failure/);
  await started;
  const concurrent = db.prepare('INSERT INTO records VALUES(3)').run();
  release(); await rejected; await concurrent;
  assert.deepEqual(await db.prepare('SELECT id FROM records').all(),[{id:3}]);
  await db.transaction(async()=>{
    await db.prepare('INSERT INTO records VALUES(4)').run();
    await Promise.resolve();
    await db.prepare('INSERT INTO records VALUES(5)').run();
  })();
  assert.deepEqual(await db.prepare('SELECT id FROM records').all(),[{id:3},{id:4},{id:5}]);
  await db.close();
});

test('Gemini contract and complete order workflow use only in-memory data', async t => {
  const actualFetch = global.fetch;
  let mode = 'success';
  let lastRequest;
  let calls = 0;
  process.env.NODE_ENV = 'test';
  process.env.SQLITE_DATABASE_PATH = ':memory:';
  delete process.env.DATABASE_URL;
  process.env.GEMINI_API_KEY = 'test-only-not-a-real-key';
  global.fetch = async (url, options) => {
    assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com\//);
    lastRequest = {url,options,body:JSON.parse(options.body)};
    calls++;
    if (mode === '429') return Response.json({error:{message:'do not expose provider details'}},{status:429});
    if (mode === 'timeout') throw new DOMException('timeout','TimeoutError');
    if (mode === 'blocked') return Response.json({promptFeedback:{blockReason:'SAFETY'}});
    if (mode === 'html') return new Response('<html>gateway</html>',{status:502});
    const rows = mode === 'empty' ? [] : mode === 'invalid' ? [{name:'로프참1',quantity:2.7,needsReview:false}] : [
      {name:'MSRP0001',quantity:3,needsReview:false,note:''},
      {name:'MSRP0001',quantity:2,needsReview:false,note:''},
      {name:'확인이 필요한 품목 <script>alert(1)</script>',quantity:1,needsReview:true,note:'손글씨 수량 확인'},
    ];
    return Response.json({candidates:[{finishReason:mode === 'truncated' ? 'MAX_TOKENS' : 'STOP',content:{parts:[{text:JSON.stringify(rows)}]}}]});
  };
  const image = await sharp({create:{width:120,height:180,channels:3,background:'#fff'}}).png().toBuffer();
  const file = {buffer:image,mimetype:'application/octet-stream',originalname:'주문서.PNG'};
  const app = require('../dist/index').default;
  const rawDb = require('../dist/db').db;
  const productId = Number(rawDb.prepare("INSERT INTO products(sku,name,catalog_name) VALUES('MSRP0001','로프참1','로프참1')").run().lastInsertRowid);
  rawDb.prepare("INSERT INTO inventory VALUES(?,'PICKING',100)").run(productId);
  rawDb.prepare("INSERT INTO inventory VALUES(?,'FACTORY',20)").run(productId);
  rawDb.prepare("INSERT INTO vendors(name) VALUES('테스트 거래처')").run();
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const request = (path,options={}) => actualFetch(base+path,{...options,headers:{cookie,...options.headers}});
  const post = (path,body) => request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  t.after(async()=>{global.fetch=actualFetch; await new Promise(resolve=>server.close(resolve)); rawDb.close(); delete process.env.GEMINI_API_KEY;});
  await t.test('image orientation, MIME, duplicate rows and review flags are retained',async()=>{
    const result = await readOrderWithGemini(file);
    assert.equal(result.rows.length,3);
    assert.equal(result.rows[0].quantity,3);
    assert.equal(result.rows[1].quantity,2);
    assert.equal(result.rows[2].needsReview,true);
    assert.equal(lastRequest.body.contents[0].parts[0].inlineData.mimeType,'image/jpeg');
    assert.ok(!String(lastRequest.url).includes(process.env.GEMINI_API_KEY));
    const uploaded = Buffer.from(lastRequest.body.contents[0].parts[0].inlineData.data,'base64');
    const metadata = await sharp(uploaded).metadata();
    assert.equal(metadata.width,120);assert.equal(metadata.height,180);
  });
  await t.test('PDF remains a PDF, not a text-only OCR fallback',async()=>{
    await readOrderWithGemini({buffer:Buffer.from('%PDF-1.7'),mimetype:'application/octet-stream',originalname:'주문.PDF'});
    assert.equal(lastRequest.body.contents[0].parts[0].inlineData.mimeType,'application/pdf');
  });
  await t.test('API errors, incomplete and malformed quantities never become a successful empty order',async()=>{
    for (const state of ['429','blocked','truncated','empty','invalid','html']) {
      mode=state;await assert.rejects(readOrderWithGemini(file));
    }
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(readOrderWithGemini(file),/GEMINI_API_KEY/);
    assert.equal(await readOrderWithGemini({...file,originalname:'order.xlsx',mimetype:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),null);
    process.env.GEMINI_API_KEY='test-only-not-a-real-key';mode='success';
  });
  await t.test('ambiguous product sizes stay unmatched',()=>{
    const products=[{id:1,name:'기본백 미니',sku:'MINI001'},{id:2,name:'기본백 라지',sku:'LARGE001'}];
    assert.equal(matchProduct('기본백',products),null);
  });
  let id;
  await t.test('upload persists the source; listing excludes binary data',async()=>{
    const setup = await post('/api/auth/setup',{email:'test@example.com',name:'테스트 관리자',password:'test-password-123'});
    assert.equal(setup.status,201);
    cookie=setup.headers.get('set-cookie').split(';')[0];
    const body=new FormData();body.append('vendor','테스트 거래처');body.append('files',new Blob([image],{type:'image/png'}),'sample.png');
    const response=await request('/api/order-imports',{method:'POST',body});
    assert.equal(response.status,201);id=(await response.json()).imports[0].id;
    const list=await request('/api/order-imports');assert.equal(list.status,200);
    const data=await list.json();assert.equal(data.imports.length,1);
    assert.equal('file_data' in data.imports[0],false);assert.equal('raw_text' in data.imports[0],false);
    const preview=await request(`/api/order-imports/${id}/preview`);
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()),image);
  });
  await t.test('failure preserves source and retry saves all analyzed rows atomically',async()=>{
    mode='429';const failed=await post(`/api/order-imports/${id}/analyze`,{});assert.equal(failed.status,400);
    assert.match((await failed.json()).message,/429/);
    assert.equal(rawDb.prepare('SELECT COUNT(*) n FROM order_import_items').get().n,0);
    assert.deepEqual(rawDb.prepare('SELECT file_data FROM order_imports WHERE id=?').get(id).file_data,image);
    mode='success';const response=await post(`/api/order-imports/${id}/analyze`,{});assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.rows,3);assert.equal(data.unmatched,1);assert.equal(data.engine,'gemini-vision+alias-matcher');
    const again=await post(`/api/order-imports/${id}/analyze`,{});assert.equal(again.status,400);
    assert.equal(rawDb.prepare('SELECT COUNT(*) n FROM order_import_items').get().n,3);
  });
  await t.test('printable Korean document is escaped and needs no external worker',async()=>{
    const before=calls;
    const response=await request(`/api/order-imports/${id}/document`);assert.equal(response.status,200);
    const html=await response.text();assert.match(html,/출고 명세서/);assert.match(html,/인쇄 \/ PDF 저장/);
    assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.equal(calls,before);
  });
  await t.test('review requires matches; correction enables review and resets previous approval',async()=>{
    const url=`/api/order-imports/${id}/review`;
    assert.equal((await request(url,{method:'PATCH'})).status,400);
    const item=rawDb.prepare('SELECT id FROM order_import_items WHERE matched_product_id IS NULL').get();
    const patch=()=>request(`/api/order-import-items/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,quantity:4})});
    assert.equal((await patch()).status,200);
    assert.equal((await request(url,{method:'PATCH'})).status,200);
    assert.ok(rawDb.prepare('SELECT reviewed_at FROM order_imports WHERE id=?').get(id).reviewed_at);
    assert.equal((await patch()).status,200);
    assert.equal(rawDb.prepare('SELECT reviewed_at FROM order_imports WHERE id=?').get(id).reviewed_at,null);
    rawDb.prepare("UPDATE order_imports SET status='COMMITTED' WHERE id=?").run(id);
    assert.equal((await post(`/api/order-imports/${id}/analyze`,{})).status,409);
    assert.equal((await patch()).status,400);
  });
});
