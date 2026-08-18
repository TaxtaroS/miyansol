import ExcelJS from 'exceljs';
import { createWorker, PSM } from 'tesseract.js';
import sharp from 'sharp';
import {cleanOcrText,normalizeDocumentLine,normalizeOrderQuantity,splitOcrCells} from './order-text-normalizer.js';
import {readImageWithPaddle} from './paddle-ocr.js';

export type ParsedOrderRow={name:string;quantity:number;needsReview?:boolean;note?:string};

let imageWorkerPromise:ReturnType<typeof createWorker>|null=null;
function getImageWorker(){
  imageWorkerPromise ||= createWorker('kor+eng');
  return imageWorkerPromise;
}

const productHeaders=/상품명|품명|제품명|상품|품목|옵션|product|item/i;
const quantityHeaders=/주문수량|출고수량|수량|qty|quantity|count/i;
const ignored=/^(합계|총계|총\s|total|수량|상품명|품명|제품명|순번|번호)/i;

function clean(value:string){return cleanOcrText(value)}
function positiveInt(value:unknown){return normalizeOrderQuantity(value)}
function cellText(cell:ExcelJS.Cell){try{return cell.text?.trim()||''}catch{const value=cell.value;if(value==null)return '';if(typeof value==='string'||typeof value==='number')return String(value).trim();if(typeof value==='object'){if('result' in value)return String(value.result??'').trim();if('text' in value)return String(value.text??'').trim();if('richText' in value&&Array.isArray(value.richText))return value.richText.map(part=>part.text||'').join('').trim()}return ''}}

export function rowsFromText(text:string):ParsedOrderRow[]{
  const rows:ParsedOrderRow[]=[];
  for(const original of text.split(/\r?\n/)){
    const line=normalizeDocumentLine(original);if(!line||/^\[Page \d+\]$/i.test(line)||ignored.test(line))continue;
    const cells=splitOcrCells(line);let name='';let quantity=0;
    if(cells.length>=2){
      for(let index=cells.length-1;index>0;index--){
        const candidate=positiveInt(cells[index]);
        if(candidate){quantity=candidate;name=clean(cells.slice(0,index).join(' '));break}
      }
    }
    if(!quantity){
      const match=line.match(/^(.+?)(?:\s+[xX*]\s*|\s+)(\d{1,6})\s*(?:개|EA|PCS)?\s*[|\]\)\\._-]*\s*$/i);
      if(match){name=clean(match[1]);quantity=positiveInt(match[2])}
    }
    if(!name||!quantity)continue;
    name=name.replace(/^\s*(?:\d{1,4}[.)-]?\s+)+/,'').trim();
    const sourceCode=name.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/i)?.[0]||'';
    const brandIndex=name.toLowerCase().lastIndexOf('miyansol');if(brandIndex>=0)name=name.slice(brandIndex).replace(/^miyansol\s+(?:llg|jewe)?\s*/i,'').trim();
    name=name.replace(/[|,;:\s]+$/,'').trim();
    if(sourceCode&&!name.toLowerCase().includes(sourceCode.toLowerCase()))name=`${sourceCode} ${name}`.trim();
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

async function readPdfWithPaperMate(buffer:Buffer,filename:string){
  const host=process.env.DOCUMENT_WORKER_HOST||process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;
  if(!host)return null;
  const body=new FormData();
  body.append('file',new Blob([Uint8Array.from(buffer)]),filename||'order.pdf');
  const baseUrl=host.startsWith('http')?host:`https://${host}`;
  const response=await fetch(`${baseUrl}/document-api/extract-pdf`,{method:'POST',body,signal:AbortSignal.timeout(30000)});
  const contentType=response.headers.get('content-type')||'';
  if(!response.ok||!contentType.includes('application/json'))return null;
  const result=await response.json() as {text?:string;pages?:Array<{text?:string;image_base64?:string}>};
  const raw=result.text||'';
  const textRows=rowsFromText(raw);
  if(textRows.length)return {rows:textRows,raw};

  const scannedPages=(result.pages||[]).filter(page=>page.image_base64);
  if(!scannedPages.length)return {rows:[],raw};
  // Reuse the loaded Korean/English model. Creating it for every PDF was the
  // main source of latency on serverless cold starts.
  const worker=await getImageWorker();
  await worker.setParameters({
    tessedit_pageseg_mode:PSM.SPARSE_TEXT,
    preserve_interword_spaces:'1',
    user_defined_dpi:'300',
  });
  const pageTexts:string[]=[];
  for(const page of scannedPages){
    const source=Buffer.from(page.image_base64!,'base64');
    const image=await sharp(source).grayscale().normalize().sharpen().png().toBuffer();
    const recognized=await worker.recognize(image,{rotateAuto:true});
    if(recognized.data.text)pageTexts.push(recognized.data.text);
  }
  const ocrRaw=pageTexts.join('\n');
  return {rows:rowsFromText(ocrRaw),raw:[raw,ocrRaw].filter(Boolean).join('\n')};
}

async function readPdf(buffer:Buffer,filename:string){
  const paperMate=await readPdfWithPaperMate(buffer,filename);
  // On Vercel the PyMuPDF worker handles both selectable and scanned PDFs.
  // Returning even an empty analysis prevents pdfjs from requiring DOMMatrix.
  if(paperMate)return paperMate;
  const {PDFParse}=await import('pdf-parse');
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
async function enhancedImage(buffer:Buffer){const metadata=await sharp(buffer).metadata();const width=metadata.width||1200,height=metadata.height||1600;return sharp(buffer).extract({left:0,top:Math.round(height*.1),width,height:Math.max(1,Math.round(height*.58))}).resize({width:Math.max(1800,width*3),withoutEnlargement:false}).grayscale().normalize().sharpen().toBuffer()}
async function readImage(buffer:Buffer,extension='jpg'){const paddle=readImageWithPaddle(buffer,extension);if(paddle?.rows.length)return {rows:paddle.rows.map(row=>({name:row.name,quantity:row.quantity})),raw:paddle.raw};const worker=await getImageWorker();await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK,preserve_interword_spaces:'1',user_defined_dpi:'300'});const prepared=await enhancedImage(buffer);const result=await worker.recognize(prepared);const raw=result.data.text||'';return {rows:rowsFromText(raw),raw}}

export async function readOrderFile(file:{buffer:Buffer;mimetype:string;originalname:string}){
  const extension=file.originalname.split('.').pop()?.toLowerCase();
  if(extension==='xlsx')return readExcel(file.buffer);
  if(extension==='pdf'||file.mimetype==='application/pdf')return readPdf(file.buffer,file.originalname);
  if(['jpg','jpeg','png','webp','bmp'].includes(extension||'')||file.mimetype.startsWith('image/'))return readImage(file.buffer,extension||'jpg');
  throw new Error(`${file.originalname}: 지원하지 않는 파일 형식입니다.`);
}

function normalized(value:string){return value.toLowerCase().replace(/기본백|미니백|피어백|백|bag|long|mini|large|small|라지|스몰/gi,'').replace(/[^a-z0-9가-힣]/g,'')}
function bigrams(value:string){const set=new Set<string>();for(let i=0;i<value.length-1;i++)set.add(value.slice(i,i+2));return set}
function similarity(a:string,b:string){if(a===b)return 1;if(!a||!b)return 0;if(a.includes(b)||b.includes(a)){const ratio=Math.min(a.length,b.length)/Math.max(a.length,b.length);return .65+.35*ratio}const aa=bigrams(a),bb=bigrams(b);let common=0;for(const token of aa)if(bb.has(token))common++;return (2*common)/(aa.size+bb.size||1)}

export function normalizeAlias(value:string){return normalized(value)}
export function matchProduct(name:string,products:Array<{id:number;name:string;catalog_name?:string|null;sku:string;aliases?:string|null}>) {
  const source=normalized(name);let best:{id:number;score:number}|null=null;
  for(const product of products){const sku=normalized(product.sku);const skuMatch=sku.length>=4&&source.includes(sku)?.99:0;const aliasScore=(product.aliases||'').split('|||').filter(Boolean).reduce((score,alias)=>Math.max(score,similarity(source,normalized(alias))),0);const score=Math.max(skuMatch,aliasScore,similarity(source,normalized(product.name)),similarity(source,normalized(product.catalog_name||'')),similarity(source,sku));if(!best||score>best.score)best={id:product.id,score}}
  return best&&best.score>=.72?best:null;
}
