// Optional browser regression; use PLAYWRIGHT_MODULE for an existing installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'miyansol-label-check-'));
  try {
    const page = await browser.newPage();
    await page.addScriptTag({path:require.resolve('jsbarcode/dist/JsBarcode.all.min.js', {paths:[path.join(root,'frontend')]})});
    const source = fs.readFileSync(path.join(root,'frontend/src/LabelOutput.tsx'),'utf8')
      .replace(/^import .*;\r?\n/gm, '').replace('export default function LabelOutput', 'function LabelOutput');
    const retailSource = fs.readFileSync(path.join(root,'frontend/src/retail-label.ts'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
    const retailNames = 'isRetailVendor,retailCategory,retailPriceText,retailLabelName,retailLabelProblem,retailLabelMarkup';
    const retailSetup = `const {${retailNames}}=(()=>{${retailSource};return {${retailNames}}})();const retailLabelStyles=${JSON.stringify(fs.readFileSync(path.join(root,'frontend/src/retail-label.css'),'utf8'))};`;
    const compiled = ts.transpileModule('const majorOrder=[];\n' + retailSetup + source, {
      compilerOptions:{jsx:ts.JsxEmit.React, target:ts.ScriptTarget.ES2022}
    }).outputText;
    await page.addScriptTag({content:compiled + '\nwindow.labelChecks={labelMarkup,displayCode,printQueueDocument,retailLabelProblem};'});
    const labels = JSON.parse(fs.readFileSync(path.join(root,'backend/data/label-catalog.json'),'utf8')).labels;
    const exportLabels = labels.filter(label => label.vendor === '중국_미국라벨');
    assert.ok(exportLabels.length > 0);
    const failures = await page.evaluate(items => items.flatMap(item => {
      const box = document.createElement('div');
      box.innerHTML = window.labelChecks.labelMarkup({...item,quantity:1},1);
      const actual = [...box.querySelector('article').children].map(el=>el.textContent);
      return JSON.stringify(actual) === JSON.stringify(item.template_data) && window.labelChecks.displayCode(item) === item.template_data[2]
        ? [] : [{name:item.product_name,actual,expected:item.template_data}];
    }), exportLabels);
    assert.deepEqual(failures, []);
    const sellmate = labels.filter(label=>label.vendor==='셀메이트');
    const retailFailures = await page.evaluate(items=>items.flatMap(item=>['교보영풍','영풍 이요샵'].flatMap(vendor=>{
      const retail={...item,vendor,template_data:null};
      const problem=window.labelChecks.retailLabelProblem(retail);
      if(!item.barcode) {
        try { window.labelChecks.labelMarkup(retail,1); return [{name:item.product_name,problem:'missing barcode was printable'}]; }
        catch { return problem === '셀메이트 바코드 확인 필요' ? [] : [{name:item.product_name,problem}]; }
      }
      if(problem)return [{name:item.product_name,problem}];
      const box=document.createElement('div');box.innerHTML=window.labelChecks.labelMarkup(retail,1);
      return box.querySelector('.retail-label-price')?.textContent?.match(/판매가격 : [\d,]+원/) && box.querySelector('svg text')?.textContent===item.barcode && !box.querySelector('.sellmate,.standard')?[]:[{name:item.product_name,problem:'incorrect retail markup'}];
    })),sellmate);
    assert.deepEqual(retailFailures,[]);
    assert.equal(await page.evaluate(()=>window.labelChecks.retailLabelProblem({vendor:'교보영풍',category:'unknown',product_name:'unknown',barcode:'123'})), '판매가격 확인 필요');
    // Capture the real print document without opening the OS print dialog.
    const html = await page.evaluate(item => {
      let html='';
      window.open=()=>({document:{open(){},write(value){html=value},close(){}}});
      window.labelChecks.printQueueDocument([{...item,quantity:1}]);
      return html.replace(/<script>[\s\S]*?<\/script>/g,'');
    }, {...sellmate[0],vendor:'교보영풍',template_data:null});
    await page.setContent(html);
    await page.screenshot({path:path.join(output,'retail-label.png')});
    await page.emulateMedia({media:'print'});
    const dimensions = await page.locator('.retail-label').boundingBox();
    assert.ok(Math.abs(dimensions.width - 40 * 96 / 25.4) < 1);
    assert.ok(Math.abs(dimensions.height - 20 * 96 / 25.4) < 1);
    assert.equal(await page.locator('.retail-label').evaluate(el=>el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth),false);
    await page.pdf({path:path.join(output,'retail-label.pdf'),preferCSSPageSize:true,printBackground:true});
    const samples = fs.readFileSync(path.join(root,'frontend/src/LabelOutput.tsx'),'utf8').match(/\/uploads\/label-samples\/[^']+/g);
    for (const sample of samples) assert.ok(fs.existsSync(path.join(root,'backend',sample)),sample);
    console.log(JSON.stringify({result:'PASS',exportLabels:exportLabels.length,retailLabels:sellmate.length*2,sampleImages:samples.length,labelSize:'40x20mm',artifacts:output}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
