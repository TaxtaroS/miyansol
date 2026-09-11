// Optional browser regression: run after `pnpm build` with Playwright installed.
// PLAYWRIGHT_MODULE may point at an existing Playwright installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const sharp = require('sharp');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async()=>{
  process.env.NODE_ENV='test';
  process.env.SQLITE_DATABASE_PATH=':memory:';
  process.env.GEMINI_API_KEY='test-only-not-a-real-key';
  delete process.env.DATABASE_URL;
  let failNext=true;
  global.fetch=async url=>{
    assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com\//);
    if(failNext){failNext=false;return Response.json({error:{message:'quota'}},{status:429})}
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify([
      {name:'로프참1',quantity:3,needsReview:false,note:''},
      {name:'멍미참2',quantity:1,needsReview:true,note:'손글씨 수량 확인'},
    ])}]}}]});
  };
  const api=require('../dist/index').default;
  const db=require('../dist/db').db;
  for(const [sku,name] of [['MSRP0001','로프참1'],['MSMM0002','멍미참2']]){
    const id=db.prepare('INSERT INTO products(sku,name,catalog_name) VALUES(?,?,?)').run(sku,name,name).lastInsertRowid;
    db.prepare("INSERT INTO inventory VALUES(?,'PICKING',100)").run(id);
    db.prepare("INSERT INTO inventory VALUES(?,'FACTORY',20)").run(id);
  }
  db.prepare("INSERT INTO vendors(name) VALUES('테스트 거래처')").run();
  const outer=express();
  outer.use(express.static(path.resolve(__dirname,'../../frontend/dist')));
  outer.use(api);
  const server=outer.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'miyansol-order-browser-'));
  let browser;
  try{
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(base);
    await page.getByLabel('관리자 이름').fill('테스트 관리자');
    await page.getByLabel('이메일').fill('test@example.com');
    await page.getByLabel('비밀번호').fill('test-password-123');
    await page.getByRole('button',{name:'관리자 계정 만들기'}).click();
    await page.getByRole('button',{name:'패킹출고',exact:true}).click();
    await page.locator('.order-upload-panel select').selectOption({label:'테스트 거래처'});
    const source=await sharp(Buffer.from('<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="1200" fill="white"/><g font-family="Malgun Gothic" fill="#172b45"><text x="60" y="90" font-size="42">테스트 출고 주문서</text><text x="60" y="190" font-size="30">로프참1                       3</text><text x="60" y="260" font-size="30">멍미참2                       1</text></g></svg>')).png().toBuffer();
    await page.locator('input[type=file]').setInputFiles([{name:'order-photo.png',mimeType:'image/png',buffer:source},{name:'order-photo-2.png',mimeType:'image/png',buffer:source}]);
    await page.getByRole('heading',{name:'선택한 원본 주문서'}).waitFor();
    await page.getByRole('button',{name:'주문서 등록 및 분석',exact:true}).click();
    await page.getByText('Gemini (429):',{exact:false}).first().waitFor();
    await page.getByRole('button',{name:'다시 분석',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.order-upload-panel .notice')?.textContent?.includes('2개 주문서 저장'));
    let rows=db.prepare('SELECT id,status FROM order_imports ORDER BY id').all();
    assert.equal(rows.length,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM order_import_items').get().n,2);
    await page.getByRole('button',{name:'다시 분석',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('button:disabled.order-preview-button'));
    await page.getByRole('button',{name:'다시 분석',exact:true}).waitFor({state:'detached'});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM order_import_items').get().n,4);
    await page.getByRole('button',{name:'확인 필요',exact:true}).first().click();
    const modal=page.locator('.order-preview-modal');
    await modal.getByRole('heading',{name:'정리된 출고 명세서'}).waitFor();
    const frame=page.frameLocator('iframe[title="테스트 거래처 출고 명세서"]');
    await frame.getByRole('heading',{name:'출고 명세서',exact:true}).waitFor();
    assert.equal(await modal.getByRole('button',{name:'내용 확인 완료'}).isDisabled(),true);
    const editor=modal.locator('.order-item-editors tbody tr').filter({hasText:'손글씨 수량 확인'});
    await editor.locator('select').selectOption('2');
    await editor.locator('input').fill('4');
    await editor.getByRole('button',{name:'품목 확인·저장'}).click();
    await page.waitForFunction(()=>!document.querySelector('.order-preview-actions .primary')?.disabled);
    await frame.getByText('합계 · 2개 품목').waitFor();
    await page.screenshot({path:path.join(output,'order-review-desktop.png')});
    const documentPage=await browser.newPage();
    const href=await modal.getByRole('link',{name:'명세서 인쇄 / PDF 저장'}).getAttribute('href');
    await documentPage.goto(base+href);
    await documentPage.getByRole('heading',{name:'출고 명세서',exact:true}).waitFor();
    await documentPage.pdf({path:path.join(output,'order-document.pdf'),format:'A4',printBackground:true});
    assert.equal(await documentPage.locator('tbody tr').count(),2);
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'order-review-mobile.png')});
    const overflow=await modal.evaluate(el=>el.getBoundingClientRect().right>window.innerWidth);
    assert.equal(overflow,false);
    assert.deepEqual(pageErrors,[]);
    console.log(JSON.stringify({result:'PASS',checks:['two-file upload with partial failure','saved-source retry','review flag','correction','printable Korean document','desktop/mobile modal','no uncaught browser errors'],artifacts:output}));
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
