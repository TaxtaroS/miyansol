import JsBarcode from 'jsbarcode';
export type RetailLabelItem = {vendor:string;category:string;product_name:string;barcode:string|null;dashboard_name?:string|null;catalog_name?:string|null;template_data?:string|string[]|null};
export function isRetailVendor(vendor:string) { return vendor === '교보영풍' || vendor === '영풍 이요샵'; }
function templateValues(item:RetailLabelItem):string[] {try {const values=Array.isArray(item.template_data)?item.template_data:JSON.parse(item.template_data||'[]');return Array.isArray(values)?values.map(String):[];}catch{return [];}}
export function retailCategory(item: RetailLabelItem) {
  const source = [item.category,item.product_name,item.dashboard_name,item.catalog_name,...templateValues(item)].filter(Boolean).join(' ').toLowerCase().replace(/\s/g,'');
  if (source.includes('basicbag') || source.includes('기본백')) return '기본백';
  if (source.includes('minibag') || source.includes('미니백')) return '미니백';
  if (source.includes('heartbag') || source.includes('하트백')) return '하트백';
  if (source.includes('pierbagmini') || source.includes('minipier') || source.includes('미니피어')) return '피어미니백';
  if (source.includes('pierbag') || source.includes('피어백')) return '피어백';
  if (source.includes('lagoon') || source.includes('라군')) return '라군 빅백';
  if (source.includes('accordion') || source.includes('아코디언')) return '아코디언백';
  if (source.includes('brick') || source.includes('브릭')) return '브릭백';
  if (source.includes('memory') || source.includes('메모리')) return '메모리백';
  if (source.includes('dualbag') || source.includes('듀얼백')) return '듀얼백';
  if (source.includes('minipouch') || source.includes('미니파우치')) return '미니 파우치';
  if (source.includes('quiltingpouch') || source.includes('퀼팅') || source.includes('퀄팅')) return '퀼팅 파우치';
  if (source.includes('square3pouch') || source.includes('스퀘어3')) return '스퀘어 3파우치';
  if (source.includes('squarepoucha') || source.includes('스퀘어파우치a')) return '스퀘어 파우치 A';
  if (source.includes('squarepouchb') || source.includes('스퀘어파우치b')) return '스퀘어 파우치 B';
  if (source.includes('mandubag') || source.includes('만두백')) return '만두백';
  if (source.includes('hopimink') || source.includes('leopardbag') || source.includes('호피백')) return '호피백';
  if (source.includes('minkbag') || source.includes('밍크백')) return '밍크백';
  if (source.includes('uggbag') || source.includes('어그백')) return '어그백';
  if (source.includes('meongmi') || source.includes('멍미')) return '멍미참';
  if (source.includes('flowerkey') || source.includes('플라워키') || source.includes('꽃키')) return '플라워키';
  if (source.includes('flowercharm') || source.includes('꽃참')) return '꽃참';
  if (source.includes('heartcharm') || source.includes('하트참')) return '하트참';
  if (source.includes('towelcharm') || source.includes('타월참') || source.includes('타올참')) return '타월참';
  if (source.includes('luckycharm') || source.includes('럭키참')) return '럭키참';
  if (source.includes('minicharm') || source.includes('미니구슬') || source.includes('미니참')) return '미니참';
  if (source.includes('longcharm') || source.includes('롱구슬') || source.includes('롱참')) return '롱참';
  if (source.includes('ropestrap') || source.includes('로프스트랩')) return '로프 스트랩';
  if (source.includes('hpstrap') || source.includes('핸드폰스트랩')) return '핸드폰 스트랩';
  if (source.includes('solcharm') || source.includes('솔참') || source.includes('술참')) return '솔참';
  if (source.includes('teolsil') || source.includes('털실')) return '털실폼폼';
  if (source.includes('ropecharm') || source.includes('로프참')) return '로프참';
  return '기타';
}

const youngpoongPrices: Record<string,{ default:number; size?:Record<string,number> }> = {
  '기본백': { default: 56000, size: { S: 54000, L: 56000 } },
  '미니백': { default: 64000 },
  '메모리백': { default: 139000 },
  '하트백': { default: 98000 },
  '만두백': { default: 119000 },
  '듀얼백': { default: 149000 },
  '아코디언백': { default: 168000 },
  '어그백': { default: 129000, size: { M: 129000, L: 139000 } },
  '밍크백': { default: 139000, size: { M: 139000, L: 149000 } },
  '호피백': { default: 139000 },
  '미니 파우치': { default: 14000 },
  '퀼팅 파우치': { default: 35000 },
  '스퀘어 파우치 A': { default: 29000 },
  '스퀘어 파우치 B': { default: 58000 },
  '스퀘어 3파우치': { default: 119000 },
  '라군 빅백': { default: 168000 },
  '피어백': { default: 159000 },
  '피어미니백': { default: 149000 },
  '브릭백': { default: 129000 },
  '꽃참': { default: 19000 },
  '플라워키': { default: 19000 },
  '롱참': { default: 26000 },
  '미니참': { default: 26000 },
  '로프참': { default: 29000 },
  '털실폼폼': { default: 29000 },
  '타월참': { default: 19000 },
  '하트참': { default: 19000 },
  '럭키참': { default: 26000 },
  '솔참': { default: 32000 },
  '핸드폰 스트랩': { default: 43000 },
  '멍미참': { default: 43000 },
  '로프 스트랩': { default: 30000 },
};

export function retailPriceText(item: RetailLabelItem) {
  const major = retailCategory(item);
  const source = [item.product_name,item.dashboard_name,item.catalog_name,...templateValues(item)].filter(Boolean).join(' ');
  const size = source.match(/(?:^|\s)([LMS])(?:\s|$)/i)?.[1]?.toUpperCase();
  const priceConfig = youngpoongPrices[major];
  const price = priceConfig ? (size && priceConfig.size ? priceConfig.size[size] ?? priceConfig.default : priceConfig.default) : undefined;
  return price ? `판매가격 : ${price.toLocaleString('ko-KR')}` : '판매가격 확인 필요';
}

export function retailLabelName(item:RetailLabelItem) { return item.dashboard_name || item.product_name; }
function retailEscape(value:string) {return value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));}
export function retailLabelProblem(item:RetailLabelItem) {
  if (retailPriceText(item) === '판매가격 확인 필요') return '판매가격 확인 필요';
  if (!item.barcode?.trim()) return '셀메이트 바코드 확인 필요';
  return '';
}
export function retailLabelMarkup(item:RetailLabelItem,copy=1) {
  const problem=retailLabelProblem(item);
  if(problem) throw new Error(`${retailLabelName(item)}: ${problem}`);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  JsBarcode(svg,item.barcode!,{format:'CODE128',displayValue:true,font:'Arial',fontSize:13,height:48,width:1.5,margin:8,textMargin:1});
  const title=`[미야앤솔] ${retailLabelName(item)}`;
  const context=document.createElement('canvas').getContext('2d')!;
  context.font="700 10px Arial, 'Malgun Gothic', sans-serif";
  const size=Math.min(7.5,7.5*(38*96/25.4-3)/context.measureText(title).width);
  return `<article class="retail-label" data-copy="${copy}"><div class="retail-label-name" style="font-size:${size}pt">${retailEscape(title)}</div><div class="retail-label-price">${retailEscape(retailPriceText(item))}원</div><div class="retail-label-bars">${new XMLSerializer().serializeToString(svg)}</div></article>`;
}
