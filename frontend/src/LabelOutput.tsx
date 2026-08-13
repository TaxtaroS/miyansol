import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import './LabelVendorManagement.css';
import { majorCategory as dashboardMajorCategory, majorOrder } from './product-categories';

type Vendor = { id: number; vendor: string; count: number };
type Label = { id: number; vendor: string; category: string; product_name: string; barcode: string | null; image_path: string | null; template_data: string | string[] | null; product_id: number | null; dashboard_name: string | null; catalog_name: string | null };
type QueueItem = Label & { quantity: number };

const categoryOrder: readonly string[] = majorOrder;
const vendorSamples: Record<string,string> = {
  '셀메이트':'/uploads/label-samples/sellmate.png',
  '영풍 이요샵':'/uploads/label-samples/youngpoong-eyoshop.png',
  '중국_미국라벨':'/uploads/label-samples/china-usa-export.png',
  '신라_온라인_제주점_라벨':'/uploads/label-samples/shilla-online-jeju.png',
  '신세계_온라인_명동점_인천공항_라벨':'/uploads/label-samples/shinsegae-online.png',
  '신세계온라인 샘플라벨':'/uploads/label-samples/shinsegae-online.png',
  '교보영풍':'/uploads/label-samples/kyobo-youngpoong.png',
  '롯데_온라인 라벨':'/uploads/label-samples/lotte-online.png',
  '면세점_제주_부산_부산항_용두산_김해라벨':'/uploads/label-samples/duty-free.png',
};

function majorCategory(label: Label) {
  if (label.product_id && label.dashboard_name) {
    return dashboardMajorCategory({name:label.dashboard_name,catalog_name:label.catalog_name || undefined});
  }
  const category = (label.category || '').replace(/\s/g, '').toLowerCase();
  const name = label.product_name.replace(/\s/g, '').toLowerCase();
  if (label.vendor.includes('셀메이트') && (category === 'l' || category === 's' || name.includes('basicbag') || name.includes('기본백'))) return '기본백';
  if (category === 'l' || category === 's') return '기본백';
  if (category === 'mini' || category.includes('미니백')) return '미니백';
  if (category === 'heart' || category.includes('하트백')) return '하트백';
  if (category.includes('피어미니') || category.includes('피어백')) return '피어백';
  if (category.includes('라군')) return '라군 빅백';
  if (category.includes('아코디언')) return '아코디언백';
  if (category.includes('브릭')) return '브릭백';
  if (category.includes('memori') || category.includes('메모리')) return '메모리백';
  if (category.includes('퀼팅') || category.includes('퀄팅')) return '퀼팅 파우치';
  if (category.includes('미니파우치') || name.includes('미니파우치')) return '미니 파우치';
  if (category.includes('스퀘어3')) return '스퀘어 3파우치';
  if (category.includes('스퀘어파우치a')) return '스퀘어 파우치 A';
  if (category.includes('스퀘어파우치b')) return '스퀘어 파우치 B';
  if (category.includes('mandu') || category.includes('만두')) return '만두백';
  if (category.includes('밍크')) return '밍크백';
  if (category.includes('어그')) return '어그백';
  if (category.includes('호피')) return '호피백';
  if (category.includes('멍미')) return '멍미참';
  if (category.includes('플라워키') || category.includes('꽃키') || category.includes('키모양') || (label.template_data||'').includes('MSFK')) return '플라워키';
  if (category.includes('꽃')) return '꽃참';
  if (category.includes('하트참')) return '하트참';
  if (category.includes('타월참') || name.includes('타월참')) return '타월참';
  if (category.includes('럭키')) return '럭키참';
  if (category.includes('미니구슬')) return '미니참';
  if (category.includes('롱구슬') || category === '구슬') return '롱참';
  if (category.includes('로프스트랩')) return '로프 스트랩';
  if (category.includes('핸드폰')) return '핸드폰 스트랩';
  if (category.includes('로프참')) return '로프참';
  if (name.includes('기본백')) return '기본백';
  return '기타';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[character] || character));
}

function barcodeSvg(value: string, options: {fontSize?:number;height?:number;width?:number;format?:'EAN13'|'CODE128';font?:string;fontOptions?:string} = {}) {
  if (!value.trim()) return '<div class="no-barcode">바코드 번호 미등록</div>';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    const format = options.format || (/^\d{13}$/.test(value) ? 'EAN13' : 'CODE128');
    JsBarcode(svg, value, {format, displayValue:true, font:options.font||'Arial', fontOptions:options.fontOptions||'', fontSize:options.fontSize||15, height:options.height||70, margin:0, width:options.width||2, textMargin:0});
    svg.setAttribute('preserveAspectRatio','none');
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return `<div class="no-barcode">${escapeHtml(value)}</div>`;
  }
}

function vendorKind(vendor: string) {
  if (vendor.includes('신라')) return 'shilla';
  if (vendor.includes('롯데')) return 'lotte';
  if (vendor.includes('신세계')) return 'shinsegae';
  if (vendor.includes('중국') || vendor.includes('미국')) return 'export';
  if (vendor.includes('면세점')) return 'dutyfree';
  if (vendor.includes('교보') || vendor.includes('영풍')) return 'retail';
  return 'standard';
}

function templateValues(item: QueueItem) {
  if (Array.isArray(item.template_data)) return item.template_data.map(String);
  try {
    const values = JSON.parse(item.template_data || '[]');
    return Array.isArray(values) ? values.map(String) : [];
  } catch { return []; }
}

function displayCode(item: Label) {
  const values = templateValues(item as QueueItem);
  return item.barcode || values.find(value => /^[A-Z0-9-]{6,}$/i.test(value)) || '';
}

function displayProductName(item: Label) {
  const size = /^[ls]$/i.test(item.category.trim()) ? item.category.trim().toUpperCase() : '';
  return size && !new RegExp(`\\s${size}$`, 'i').test(item.product_name) ? `${item.product_name} ${size}` : item.product_name;
}

function productKey(item: Label) {
  return `${item.category}::${item.product_name}`;
}

function fitFont(value: string, maximum: number, minimum: number, capacity: number) {
  const width = [...value].reduce((sum, character) => sum + (/[^\x00-\xff]/.test(character) ? 1 : 0.58), 0);
  if (!width) return maximum;
  return Math.max(minimum, Math.min(maximum, Number((maximum * capacity / width).toFixed(2))));
}

function labelMarkup(item: QueueItem, copy: number) {
  const values = templateValues(item);
  const name = escapeHtml(item.product_name);
  const kind = vendorKind(item.vendor);
  const first = escapeHtml(values[0] || item.product_name);
  const second = escapeHtml(values[1] || item.barcode || '');
  const third = escapeHtml(values[2] || '');
  if (kind === 'retail') return `<article class="label retail" data-copy="${copy}"><div class="retail-title" style="font-size:${fitFont(values[0] || item.product_name,7.1,4.3,19)}pt">${first}</div><div class="retail-price" style="font-size:${fitFont(values[2] || '',7,4.8,19)}pt">${third}</div><div class="retail-bars">${barcodeSvg(values[1] || item.barcode || '',{format:'CODE128',fontSize:16,height:60,width:1.7})}</div></article>`;
  if (kind === 'shilla') return `<article class="label shilla" data-copy="${copy}"><div class="shilla-code" style="font-size:${fitFont(values[1] || '',10.2,7.2,12.5)}pt">${second}</div><div class="shilla-title" style="font-size:${fitFont(values[0] || item.product_name,5.8,3.7,31)}pt">${first}</div><div class="shilla-bars">${barcodeSvg(values[1] || '',{fontSize:17,height:68,width:2})}</div></article>`;
  if (kind === 'shinsegae') return `<article class="label shinsegae" data-copy="${copy}"><div class="plain-code" style="font-size:${fitFont(values[1] || '',10.5,6.2,9)}pt">${second}</div><div class="plain-title" style="font-size:${fitFont(values[0] || item.product_name,6.6,3.8,15)}pt">${first}</div></article>`;
  if (kind === 'lotte') return `<article class="label lotte" data-copy="${copy}"><div class="plain-code" style="font-size:${fitFont(values[1] || '',11.5,6.5,9)}pt">${second}</div><div class="plain-title" style="font-size:${fitFont(values[0] || item.product_name,6.5,3.9,28)}pt">${first}</div></article>`;
  if (kind === 'export') return `<article class="label export" data-copy="${copy}"><div class="export-brand">${first}</div><div class="export-title">${second}</div><div class="export-code">${third}</div></article>`;
  if (kind === 'dutyfree') return `<article class="label dutyfree" data-copy="${copy}"><div class="dutyfree-title">${first}</div></article>`;
  if (item.vendor.includes('셀메이트')) return `<article class="label standard sellmate" data-copy="${copy}"><div class="standard-brand">[miyansol]&nbsp; ${escapeHtml(values[0] || '')}</div><div class="standard-title">${escapeHtml(values[1] || item.product_name)}</div><div class="standard-bars">${barcodeSvg(item.barcode || '',{format:'CODE128',fontSize:18,height:50,width:1.55,font:'Arial',fontOptions:''})}</div></article>`;
  return `<article class="label standard" data-copy="${copy}"><div class="standard-brand">[miyansol]</div><div class="standard-title">${name}</div><div class="standard-bars">${barcodeSvg(item.barcode || '')}</div></article>`;
}

function printQueueDocument(queue: QueueItem[]) {
  if (!queue.length) return false;
  const pages = queue.flatMap(item => Array.from({length:item.quantity}, (_, index) => labelMarkup(item, index + 1))).join('');
  const popup = window.open('', '_blank', 'popup=yes,width=920,height=720');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>MIYANSOL 라벨 일괄출력</title><style>
    *{box-sizing:border-box}html,body{margin:0;background:#eee;font-family:Arial,'Malgun Gothic',sans-serif}.label{position:relative;width:40mm;height:20mm;padding:.35mm .25mm;background:#fff;color:#000;overflow:hidden;break-after:page;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.label:last-child{break-after:auto;page-break-after:auto}.label>div{width:100%;white-space:nowrap;overflow:hidden;text-overflow:clip}.no-barcode{font-size:5pt}.retail{justify-content:flex-start;padding:.2mm .35mm 0}.retail-title{height:3.7mm;line-height:3.7mm;letter-spacing:-.12mm}.retail-price{height:3.2mm;line-height:3.2mm}.retail-bars{height:12.6mm;width:100%}.retail-bars svg{display:block;width:100%!important;height:100%!important;max-width:none}.shilla{justify-content:flex-start;padding:.15mm .25mm 0}.shilla-code{height:3.9mm;font-weight:700;line-height:3.9mm;letter-spacing:-.12mm}.shilla-title{height:2.7mm;font-weight:500;line-height:2.7mm;letter-spacing:-.14mm}.shilla-bars{height:13.1mm;width:100%;overflow:visible}.shilla-bars svg{display:block;width:100%!important;height:100%!important;max-width:none}.plain-code,.plain-title{padding:0;line-height:1.08}.plain-code{font-weight:700}.lotte{gap:2.3mm}.lotte .plain-title{font-weight:700;letter-spacing:-.13mm}.shinsegae{gap:2.1mm}.shinsegae .plain-title{font-weight:500;letter-spacing:-.12mm}.export{gap:1.25mm}.export-brand{font-size:9.4pt;font-weight:700}.export-title{font-size:5.4pt;font-weight:700;letter-spacing:-.12mm}.export-code{font-size:9.2pt;font-weight:700}.dutyfree-title{font-size:7.1pt;line-height:1;letter-spacing:-.12mm}.standard-brand{font-size:7.3pt;font-weight:700}.standard-title{font-size:5.5pt;font-weight:700;letter-spacing:-.12mm}.standard-bars{height:10.8mm;width:100%}.standard-bars svg{display:block;width:100%!important;height:100%!important;max-width:none}@media screen{body{padding:10mm}.label{margin:0 auto 28mm;box-shadow:0 2px 12px #0002;transform:scale(2);transform-origin:top center}}@media print{html,body{background:#fff}.label{margin:0;box-shadow:none}@page{size:40mm 20mm;margin:0}}
    .retail{padding:.25mm .55mm .15mm}.retail-title{height:3.5mm;line-height:3.5mm}.retail-price{height:3mm;line-height:3mm}.retail-bars{height:12.15mm;padding:0 .65mm .65mm;overflow:hidden}.retail-bars svg{overflow:visible}.lotte{padding-left:.08mm;padding-right:.08mm}.lotte .plain-title{width:100%;max-width:none;letter-spacing:-.18mm}.sellmate{justify-content:flex-start;padding:.35mm 1.75mm 1.1mm;font-family:Arial,'Malgun Gothic',sans-serif}.sellmate .standard-brand{height:3.45mm;line-height:3.45mm;font-size:8.05pt;font-weight:700;letter-spacing:-.08mm;transform:scaleX(1.055);transform-origin:center}.sellmate .standard-title{height:3.65mm;line-height:3.65mm;font-size:7.15pt;font-weight:700;letter-spacing:-.08mm;transform:scaleX(1.14);transform-origin:center}.sellmate .standard-bars{height:10.2mm;padding:0 .25mm;overflow:hidden}.sellmate .standard-bars svg{width:100%!important;height:100%!important}.sellmate .standard-bars svg text{font-weight:400;letter-spacing:.08mm;transform:scaleX(.88);transform-box:fill-box;transform-origin:center}
    @media screen{.label.sellmate{width:377px;height:194px;transform:none;padding:5px 18px 11px;margin:0 auto 20px}.sellmate .standard-brand{height:34px;line-height:34px;font-size:33px;font-weight:700;letter-spacing:-.5px;transform:scaleX(1.055);transform-origin:center}.sellmate .standard-title{height:36px;line-height:36px;font-size:32px;font-weight:700;letter-spacing:-.5px;transform:scaleX(1.14);transform-origin:center}.sellmate .standard-bars{height:91px;padding:0 3px}.sellmate .standard-bars svg{width:100%!important;height:100%!important}.sellmate .standard-bars svg text{font-weight:400;letter-spacing:.6px;transform:scaleX(.88);transform-box:fill-box;transform-origin:center}}
  </style></head><body>${pages}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));<\/script></body></html>`);
  popup.document.close();
  return true;
}

export default function LabelOutput() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [vendor, setVendor] = useState('');
  const [major, setMajor] = useState('');
  const [product, setProduct] = useState('');
  const [search, setSearch] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState('');
  const [sampleOpen, setSampleOpen] = useState(false);

  const loadVendors=()=>fetch('/api/labels/vendors').then(r => r.json()).then(setVendors);
  useEffect(() => { void loadVendors(); }, []);
  useEffect(() => { fetch(`/api/labels?vendor=${encodeURIComponent(vendor)}&search=${encodeURIComponent(search)}`).then(r => r.json()).then(setLabels); }, [vendor, search]);

  const majors = useMemo(() => {
    const available = new Set<string>(labels.map(majorCategory));
    return [...categoryOrder.filter(value => available.has(value)), ...[...available].filter(value => !categoryOrder.includes(value)).sort((a,b)=>a.localeCompare(b,'ko-KR'))];
  }, [labels]);
  const products = useMemo(() => {const unique=new Map<string,string>();for(const label of labels.filter(label => !major || majorCategory(label) === major))unique.set(productKey(label),displayProductName(label));return [...unique].map(([key,name])=>({key,name})).sort((a,b)=>a.name.localeCompare(b.name,'ko-KR',{numeric:true}))}, [labels, major]);
  const results = useMemo(() => labels.filter(label => (!major || majorCategory(label) === major) && (!product || productKey(label) === product)).sort((a,b) => displayProductName(a).localeCompare(displayProductName(b),'ko-KR',{numeric:true}) || a.category.localeCompare(b.category,'ko-KR',{numeric:true})), [labels, major, product]);
  const samplePath = vendorSamples[vendor];
  const addLabelVendor=async()=>{const name=window.prompt('추가할 라벨 공급처명을 입력해 주세요.','');if(!name?.trim())return;const response=await fetch('/api/labels/vendors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});const data=await response.json();setMessage(response.ok?'라벨 공급처를 추가했습니다.':data.message);if(response.ok){await loadVendors();setVendor(data.vendor);setMajor('');setProduct('')}};
  const editLabelVendor=async()=>{const selected=vendors.find(item=>item.vendor===vendor);if(!selected){setMessage('수정할 라벨 공급처를 먼저 선택해 주세요.');return}const name=window.prompt('라벨 공급처명을 수정해 주세요.',selected.vendor);if(!name?.trim()||name.trim()===selected.vendor)return;const response=await fetch(`/api/labels/vendors/${selected.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()})});const data=await response.json();setMessage(response.ok?'라벨 공급처명을 수정했습니다.':data.message);if(response.ok){setVendor(data.vendor);setMajor('');setProduct('');await loadVendors()}};

  const add = (label: Label) => setQueue(current => {
    const found = current.find(item => item.id === label.id);
    return found ? current.map(item => item.id === label.id ? {...item, quantity: item.quantity + 1} : item) : [...current, {...label, quantity: 1}];
  });
  const updateQuantity = (id: number, quantity: number) => setQueue(current => current.map(item => item.id === id ? {...item, quantity: Math.max(1, quantity || 1)} : item));
  const printAll = () => {
    if (!queue.length) { setMessage('인쇄 대기목록에 품목을 먼저 추가해 주세요.'); return; }
    const total = queue.reduce((sum,item)=>sum+item.quantity,0);
    setMessage(`총 ${total}매를 공급처 원본 디자인으로 한 번에 만들었습니다.`);
    if (!printQueueDocument(queue)) setMessage('인쇄창이 차단되었습니다. 주소창 오른쪽에서 팝업을 허용한 뒤 다시 눌러주세요.');
  };

  return <div className="barcode-page">
    <div className="panel barcode-search-panel">
      <h2>바코드 상품 선택</h2>
      <p>공급처를 먼저 선택하고 대분류, 상품 순서로 좁혀 인쇄 대기목록에 추가하세요.</p>
      <div className="barcode-filter-grid">
        <strong>공급처 선택</strong>
        <div className="label-vendor-control"><select value={vendor} onChange={e=>{setVendor(e.target.value);setMajor('');setProduct('')}}><option value="">전체 공급처</option>{vendors.map(item=><option value={item.vendor} key={item.id}>{item.vendor} ({item.count})</option>)}</select><button type="button" onClick={()=>void addLabelVendor()}><Plus size={15}/> 추가</button><button type="button" onClick={()=>void editLabelVendor()} disabled={!vendor}><Pencil size={15}/> 수정</button></div>
        <strong>대분류</strong>
        <select value={major} onChange={e=>{setMajor(e.target.value);setProduct('')}}><option value="">전체 대분류</option>{majors.map(value=><option key={value}>{value}</option>)}</select>
        <strong>상품</strong>
        <select value={product} onChange={e=>setProduct(e.target.value)}><option value="">전체 상품</option>{products.map(value=><option value={value.key} key={value.key}>{value.name}</option>)}</select>
        <strong>통합검색</strong>
        <div className="barcode-search-input"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="상품명 또는 바코드"/></div>
      </div>
      <div className="vendor-sample-bar"><strong>선택 공급처 라벨 샘플</strong>{samplePath?<button className="vendor-sample-button" onClick={()=>setSampleOpen(true)}><img src={samplePath} alt={`${vendor} 라벨 샘플`}/><span><b>{vendor}</b><small>이미지를 누르면 크게 확인할 수 있습니다.</small></span></button>:<span className="vendor-sample-guide">주요 공급처를 선택하면 대표 라벨이 표시됩니다.</span>}</div>
      <div className="barcode-results"><div className="result-count">검색 결과 {results.length}개</div><div className="table"><table><thead><tr><th>공급처</th><th>대분류</th><th>상품명</th><th>라벨 코드</th><th></th></tr></thead><tbody>{results.map(label=><tr key={label.id}><td>{label.vendor}</td><td>{majorCategory(label)}</td><td>{displayProductName(label)}</td><td>{displayCode(label)||'-'}</td><td><button className="queue-add" onClick={()=>add(label)}><Plus size={16}/> 대기목록 추가</button></td></tr>)}</tbody></table></div></div>
    </div>
    <div className="panel print-queue-panel">
      <div className="queue-heading"><div><h2>인쇄 대기목록</h2><p>{queue.length}개 품목 · 총 {queue.reduce((sum,item)=>sum+item.quantity,0)}매 · 한 번에 출력</p></div><div><button className="queue-clear" onClick={()=>setQueue([])} disabled={!queue.length}>전체 비우기</button><button className="primary batch-print" onClick={printAll} disabled={!queue.length}><Printer size={18}/> 전체 라벨 인쇄</button></div></div>
      {!queue.length?<div className="empty-queue">위 상품 목록에서 필요한 라벨을 대기목록에 추가해 주세요.</div>:<div className="table queue-table"><table><thead><tr><th>순서</th><th>공급처</th><th>대분류</th><th>상품명</th><th>라벨 코드</th><th>출력 매수</th><th></th></tr></thead><tbody>{queue.map((item,index)=><tr key={item.id}><td>{index+1}</td><td>{item.vendor}</td><td>{majorCategory(item)}</td><td>{displayProductName(item)}</td><td>{displayCode(item)||'-'}</td><td><input type="number" min="1" value={item.quantity} onChange={e=>updateQuantity(item.id,Number(e.target.value))}/></td><td><button className="queue-remove" onClick={()=>setQueue(current=>current.filter(row=>row.id!==item.id))} title="삭제"><Trash2 size={17}/></button></td></tr>)}</tbody></table></div>}
      {message&&<div className="notice">{message}</div>}
    </div>
    {sampleOpen&&samplePath&&<div className="label-sample-overlay" onMouseDown={()=>setSampleOpen(false)}><div className="label-sample-popup" onMouseDown={event=>event.stopPropagation()}><button onClick={()=>setSampleOpen(false)}>×</button><h2>{vendor} 라벨 샘플</h2><img src={samplePath} alt={`${vendor} 라벨 샘플 크게 보기`}/></div></div>}
  </div>;
}
