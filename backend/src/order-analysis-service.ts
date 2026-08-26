import { matchProduct, readOrderFile, rowsFromText, type ParsedOrderRow } from "./order-reader";
import { readOrderWithGemini } from "./gemini-order-reader";

export type AnalysisProduct = { id: number; name: string; catalog_name: string | null; sku: string; aliases: string | null };
export type AnalyzedOrderItem = { sourceName: string; quantity: number; productId: number | null; confidence: number };

/**
 * 주문서 분석 전담 파이프라인.
 * 1) PDF/Excel/사진에서 문자와 표 행 추출
 * 2) 상품코드·정식명·거래처 별칭으로 실제 상품 매칭
 * 3) 자동 확정하지 못한 항목은 검토 대상으로 반환
 */
export async function analyzeOrderFile(
  file: { buffer: Buffer; mimetype: string; originalname: string },
  products: AnalysisProduct[],
  browserOcrText?: string,
) {
  const suppliedText = browserOcrText?.trim() || "";
  const supplied = suppliedText.length > 0;
  let engine = "table-ocr+alias-matcher";
  let extracted: { raw: string; rows: ParsedOrderRow[] } | undefined;
  try {
    const gemini = await readOrderWithGemini(file);
    if (gemini) {
      extracted = gemini;
      engine = "gemini-vision+alias-matcher";
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Gemini order reading failed; using OCR fallback",
      filename: file.originalname,
      error: error instanceof Error ? error.message : String(error),
    }));
    if (process.env.GEMINI_API_KEY?.trim()) throw error;
  }
  if (!extracted && supplied) {
    extracted = { raw: suppliedText, rows: rowsFromText(suppliedText) };
    engine = "browser-ocr+alias-matcher";
  }
  if (!extracted) {
    extracted = await readOrderFile(file);
    engine = "ocr-fallback+alias-matcher";
  }
  const items: AnalyzedOrderItem[] = extracted.rows.map(row => {
    const matched = matchProduct(row.name, products);
    return {
      sourceName: row.note ? `${row.name} [${row.note}]` : row.name,
      quantity: row.quantity,
      productId: row.needsReview ? null : matched?.id ?? null,
      confidence: row.needsReview ? 0 : matched?.score ?? 0,
    };
  });
  return {
    rawText: extracted.raw,
    items,
    extractedCount: items.length,
    unmatchedCount: items.filter(item => item.productId === null).length,
    status: items.length > 0 && items.every(item => item.productId !== null) ? "READY" as const : "REVIEW" as const,
    engine,
  };
}
