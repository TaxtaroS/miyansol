import type { ParsedOrderRow } from "./order-reader.js";

const PROMPT = `너는 MIYANSOL 재고관리 회사의 주문서와 피킹시트를 판독한다.
첨부 문서에서 실제로 주문하거나 출고할 상품명과 수량만 추출하라.

판독 규칙:
- 문서는 단순 표, 여러 소표가 붙은 격자, 사이트별 목록, 손글씨 수량이 섞인 피킹시트일 수 있다.
- 취소선, X, 취소 또는 제외 표시가 명확한 행은 제외한다.
- 인쇄된 상품명 옆이나 대응 수량 칸의 손글씨 숫자를 같은 행으로 연결한다.
- S/L, 미니/라지처럼 크기 열이 나뉜 표는 크기를 상품명에 포함한다.
- 수량이 없는 단순 주문 목록은 1로 처리한다.
- 정자 표기, 체크, T, 획 표기가 명확하면 수량으로 환산한다. 확신이 없으면 quantity=1, needsReview=true로 둔다.
- 2(D/P) 같은 메모는 숫자 2를 수량으로 읽되 needsReview=true로 둔다.
- 상품명은 줄임말, 영문, 번호를 포함해 원문 그대로 보존한다.
- 제목, 날짜, 사이트명, 합계, 박스 번호, SKU만 있는 값은 상품으로 만들지 않는다.
- 같은 상품이 여러 곳에 반복되어도 행을 합치지 않는다.
- 보이지 않는 값은 추측하지 않는다.`;

type GeminiResult = { name?: unknown; quantity?: unknown; needsReview?: unknown; note?: unknown };

export async function readOrderWithGemini(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}): Promise<{ rows: ParsedOrderRow[]; raw: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const mimeType = file.mimetype || (file.originalname.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  if (!(mimeType === "application/pdf" || mimeType.startsWith("image/"))) return null;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType, data: file.buffer.toString("base64") } },
          { text: PROMPT },
        ] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              required: ["name", "quantity", "needsReview", "note"],
              properties: {
                name: { type: "STRING" },
                quantity: { type: "INTEGER", minimum: 1 },
                needsReview: { type: "BOOLEAN" },
                note: { type: "STRING" },
              },
            },
          },
        },
      }),
    },
  );
  const payload = await response.json() as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!response.ok) throw new Error(`Gemini 문서 판독 실패: ${payload.error?.message || response.status}`);
  const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "[]";
  const parsed = JSON.parse(raw) as GeminiResult[];
  const rows = parsed.flatMap((row): ParsedOrderRow[] => {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const quantity = Math.max(0, Math.round(Number(row.quantity)));
    if (!name || !quantity) return [];
    return [{
      name,
      quantity,
      needsReview: row.needsReview === true,
      note: typeof row.note === "string" ? row.note.trim() : "",
    }];
  });
  return { rows, raw };
}
