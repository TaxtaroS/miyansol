const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));

export function renderOrderDocument(
  order: {vendor: string; filename: string},
  items: Array<{source_name:string;quantity:number;sku:string|null;matched_name:string|null}>,
) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(order.vendor)} 출고 명세서</title>
<style>body{margin:0;background:#edf1f5;color:#172b45;font-family:"Malgun Gothic",Arial,sans-serif}main{max-width:960px;margin:24px auto;padding:32px;background:white}h1{font-size:26px;margin:0 0 16px}p{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border:1px solid #ccd5df;padding:12px 10px;text-align:left;overflow-wrap:anywhere}th{background:#edf3fa}td:last-child{text-align:right;font-weight:bold}.review{color:#9a5300}button{padding:10px 18px;cursor:pointer}footer{margin-top:20px;font-size:12px;color:#526176}@page{size:A4;margin:14mm}@media print{body{background:white}main{margin:0;padding:0;max-width:none}button{display:none}tr{break-inside:avoid}thead{display:table-header-group}}</style></head><body><main>
<button onclick="window.print()">인쇄 / PDF 저장</button><h1>출고 명세서</h1><p><strong>거래처:</strong> ${escapeHtml(order.vendor)}<br><strong>원본:</strong> ${escapeHtml(order.filename)}</p>
<table><thead><tr><th>번호</th><th>원본 상품명 · 판독 메모</th><th>등록 상품 / 코드</th><th>수량</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index+1}</td><td>${escapeHtml(item.source_name)}</td><td>${item.matched_name ? escapeHtml(item.matched_name) : '<span class="review">확인 필요</span>'}<br>${escapeHtml(item.sku)}</td><td>${item.quantity}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="3">합계 · ${items.length}개 품목</th><td>${items.reduce((sum,item)=>sum+item.quantity,0)}</td></tr></tfoot></table>
<footer>원본 주문서와 상품명·수량을 대조한 뒤 출고 내용을 확정해 주세요.</footer></main></body></html>`;
}
