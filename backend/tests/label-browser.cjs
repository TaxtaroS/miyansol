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
    const compiled = ts.transpileModule('const majorOrder=[];\n' + source, {
      compilerOptions:{jsx:ts.JsxEmit.React, target:ts.ScriptTarget.ES2022}
    }).outputText;
    await page.addScriptTag({content:compiled + '\nwindow.labelChecks={labelMarkup,displayCode,printQueueDocument};'});
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
    // Capture the real print document without opening the OS print dialog.
    const html = await page.evaluate(item => {
      let html='';
      window.open=()=>({document:{open(){},write(value){html=value},close(){}}});
      window.labelChecks.printQueueDocument([{...item,quantity:1}]);
      return html.replace(/<script>[\s\S]*?<\/script>/g,'');
    }, exportLabels[0]);
    await page.setContent(html);
    assert.equal(await page.locator('.export-title').textContent(),exportLabels[0].template_data[1]);
    await page.screenshot({path:path.join(output,'export-label.png')});
    await page.emulateMedia({media:'print'});
    const dimensions = await page.locator('.label').boundingBox();
    assert.ok(Math.abs(dimensions.width - 40 * 96 / 25.4) < 1);
    assert.ok(Math.abs(dimensions.height - 20 * 96 / 25.4) < 1);
    const samples = fs.readFileSync(path.join(root,'frontend/src/LabelOutput.tsx'),'utf8').match(/\/uploads\/label-samples\/[^']+/g);
    for (const sample of samples) assert.ok(fs.existsSync(path.join(root,'backend',sample)),sample);
    console.log(JSON.stringify({result:'PASS',exportLabels:exportLabels.length,sampleImages:samples.length,labelSize:'40x20mm',artifacts:output}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
