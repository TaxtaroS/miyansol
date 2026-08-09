import ExcelJS from 'exceljs';
import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';

export type ParsedOrderRow={name:string;quantity:number};

const productHeaders=/상품명|품명|제품명|상품|품목|옵션|product|item/i;
const quantityHeaders=/주문수량|출고수량|수량|qty|quantity|count/i;
const ignored=/^(합계|총계|총\s|total|수량|상품명|품명|제품명|순번|번호)/i;

function clean(value:string){return value.replace(/\s+/g,' ').replace(/^[\-•·\d.)\s]+/,'').trim()}
function positiveInt(value:unknown){const number=Number(String(value??'').replace(/,/g,'').match(/\d+/)?.[0]);return Number.isInteger(number)&&number>0&&number<=100000?number:0}
function cellText(cell:ExcelJS.Cell){try{return cell.text?.trim()||''}catch{const value=cell.value;if(value==null)return '';if(typeof value==='string'||typeof value==='number')return String(value).trim();if(typeof value==='object'){if('result' in value)return String(value.result??'').trim();if('text' in value)return String(value.text??'').trim();if('richText' in value&&Array.isArray(value.richText))return value.richText.map(part=>part.text||'').join('').trim()}return ''}}

export function rowsFromText(text:string):ParsedOrderRow[]{
  const rows:ParsedOrderRow[]=[];
  for(const original of text.split(/\r?\n/)){
    const line=clean(original);if(!line||ignored.test(line))continue;
    const match=line.match(/^(.+?)(?:\s*[|,\t]\s*|\s{2,}|\s+[xX*]\s*|\s+)(\d{1,6})\s*(?:개|EA|PCS)?$/i);
    if(!match)continue;const name=clean(match[1]);const quantity=positiveInt(match[2]);
    if(name&&!ignored.test(name)&&quantity)rows.push({name,quantity});
  }
  return mergeRows(rows);
}

function mergeRows(rows:ParsedOrderRow[]){const map=new Map<string,ParsedOrderRow>();for(const row of rows){const key=row.name.toLowerCase().replace(/\s/g,'');const current=map.get(key);if(current)current.quantity+=row.quantity;else map.set(key,{...row})}return [...map.values()]}

async function readExcel(buffer:Buffer){
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const rows:ParsedOrderRow[]=[];let raw='';
  workbook.eachSheet(sheet=>{const data:string[][]=[];sheet.eachRow(row=>{const values:string[]=[];for(let column=1;column<=sheet.columnCount;column++)values.push(cellText(row.getCell(column)));data.push(values);raw+=values.join('\t')+'\n'});
    let header=-1,nameIndex=-1,quantityIndex=-1;
    for(let index=0;index<Math.min(20,data.length);index++){const candidate=data[index];const n=candidate.findIndex(value=>productHeaders.test(value));const q=candidate.findIndex(value=>quantityHeaders.test(value));if(n>=0&&q>=0){header=index;nameIndex=n;quantityIndex=q;break}}
    for(let index=header>=0?header+1:0;index<data.length;index++){const line=data[index];let name='';let quantity=0;if(header>=0){name=clean(line[nameIndex]||'');quantity=positiveInt(line[quantityIndex])}else{let qIndex=-1;for(let cell=line.length-1;cell>=0;cell--){if(positiveInt(line[cell])>0){qIndex=cell;break}}if(qIndex>0){quantity=positiveInt(line[qIndex]);name=clean(line.slice(0,qIndex).filter(Boolean).join(' '))}}if(name&&!ignored.test(name)&&quantity)rows.push({name,quantity})}
  });return {rows:mergeRows(rows),raw};
}

async function readPdf(buffer:Buffer){
  const parser=new PDFParse({data:buffer});
  let worker:Awaited<ReturnType<typeof createWorker>>|null=null;
  try{
    const result=await parser.getText();
    const textRaw=result.text||'';
    const textRows=rowsFromText(textRaw);
    if(textRows.length)return {rows:textRows,raw:textRaw};

    // Scanned PDFs contain no selectable text. Render up to 20 pages and OCR them.
    const screenshots=await parser.getScreenshot({desiredWidth:1600,first:20,imageBuffer:true,imageDataUrl:false});
    worker=await createWorker('kor+eng');
    const pageTexts:string[]=[];
    for(const page of screenshots.pages){
      if(!page.data)continue;
      const recognized=await worker.recognize(Buffer.from(page.data));
      if(recognized.data.text)pageTexts.push(recognized.data.text);
    }
    const ocrRaw=pageTexts.join('\n');
    return {rows:rowsFromText(ocrRaw),raw:[textRaw,ocrRaw].filter(Boolean).join('\n')};
  }finally{
    if(worker)await worker.terminate();
    await parser.destroy();
  }
}
async function readImage(buffer:Buffer){const worker=await createWorker('kor+eng');try{const result=await worker.recognize(buffer);const raw=result.data.text||'';return {rows:rowsFromText(raw),raw}}finally{await worker.terminate()}}

export async function readOrderFile(file:{buffer:Buffer;mimetype:string;originalname:string}){
  const extension=file.originalname.split('.').pop()?.toLowerCase();
  if(extension==='xlsx')return readExcel(file.buffer);
  if(extension==='pdf'||file.mimetype==='application/pdf')return readPdf(file.buffer);
  if(['jpg','jpeg','png','webp','bmp'].includes(extension||'')||file.mimetype.startsWith('image/'))return readImage(file.buffer);
  throw new Error(`${file.originalname}: 지원하지 않는 파일 형식입니다.`);
}

function normalized(value:string){return value.toLowerCase().replace(/기본백|미니백|피어백|백|bag|long|mini|large|small|라지|스몰/gi,'').replace(/[^a-z0-9가-힣]/g,'')}
function bigrams(value:string){const set=new Set<string>();for(let i=0;i<value.length-1;i++)set.add(value.slice(i,i+2));return set}
function similarity(a:string,b:string){if(a===b)return 1;if(!a||!b)return 0;if(a.includes(b)||b.includes(a)){const ratio=Math.min(a.length,b.length)/Math.max(a.length,b.length);return .65+.35*ratio}const aa=bigrams(a),bb=bigrams(b);let common=0;for(const token of aa)if(bb.has(token))common++;return (2*common)/(aa.size+bb.size||1)}

export function matchProduct(name:string,products:Array<{id:number;name:string;catalog_name?:string|null;sku:string}>) {
  const source=normalized(name);let best:{id:number;score:number}|null=null;
  for(const product of products){const score=Math.max(similarity(source,normalized(product.name)),similarity(source,normalized(product.catalog_name||'')),similarity(source,normalized(product.sku)));if(!best||score>best.score)best={id:product.id,score}}
  return best&&best.score>=.72?best:null;
}
