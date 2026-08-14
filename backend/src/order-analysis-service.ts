import {matchProduct,readOrderFile,rowsFromText} from './order-reader.js';

export type AnalysisProduct={id:number;name:string;catalog_name:string|null;sku:string;aliases:string|null};
export type AnalyzedOrderItem={sourceName:string;quantity:number;productId:number|null;confidence:number};

/**
 * 주문서 분석 전담 파이프라인.
 * 1) PDF/Excel/사진에서 문자와 표 행 추출
 * 2) 상품코드·정식명·거래처 별칭으로 실제 상품 매칭
 * 3) 자동 확정하지 못한 항목은 검토 대상으로 반환
 */
export async function analyzeOrderFile(file:{buffer:Buffer;mimetype:string;originalname:string},products:AnalysisProduct[],browserOcrText?:string){
  const suppliedText=browserOcrText?.trim();
  const extracted=suppliedText?{raw:suppliedText,rows:rowsFromText(suppliedText)}:await readOrderFile(file);
  const items:AnalyzedOrderItem[]=extracted.rows.map(row=>{
    const matched=matchProduct(row.name,products);
    return {sourceName:row.name,quantity:row.quantity,productId:matched?.id??null,confidence:matched?.score??0};
  });
  return {
    rawText:extracted.raw,
    items,
    extractedCount:items.length,
    unmatchedCount:items.filter(item=>item.productId===null).length,
    status:items.length>0&&items.every(item=>item.productId!==null)?'READY' as const:'REVIEW' as const,
    engine:suppliedText?'browser-ocr+alias-matcher':'table-ocr+alias-matcher'
  };
}
