/** PaperMate의 문서 정제·표 숫자 정규화 방식을 주문서 OCR에 맞게 옮긴 모듈입니다. */
export function cleanOcrText(value:string){
  return String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/[·•◦]+/g,' ').replace(/[│┃¦]/g,'|').replace(/\s+/g,' ').replace(/^[\-–—•◈\d.)\s]+/,'').trim();
}

export function normalizeOrderQuantity(value:unknown){
  const text=String(value??'').trim().replace(/,/g,'').replace(/(개|EA|PCS)$/i,'').trim();
  const corrected=text.replace(/^[iIlL][oO]$/,'10').replace(/^[oO]$/,'0');
  const match=corrected.match(/\d{1,6}/);const quantity=Number(match?.[0]||0);
  return Number.isInteger(quantity)&&quantity>0&&quantity<=100000?quantity:0;
}

export function splitOcrCells(line:string){
  if(line.includes('|'))return line.split('|').map(cleanOcrText).filter(Boolean);
  return line.split(/\t|\s{2,}/).map(cleanOcrText).filter(Boolean);
}

export function normalizeDocumentLine(value:string){
  return String(value||'')
    .normalize('NFKC')
    .replace(/[│┃¦]/g,'|')
    .replace(/[‘’`]/g,"'")
    .replace(/[“”]/g,'"')
    .replace(/\b(?:O|o)(?=\d)|(?<=\d)(?:O|o)\b/g,'0')
    .replace(/\b(?:I|l)(?=\d)|(?<=\d)(?:I|l)\b/g,'1')
    .replace(/[ \t]+/g,' ')
    .trim();
}
