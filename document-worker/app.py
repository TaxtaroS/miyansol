"""PaperMate-derived document worker for fast PDF text extraction on Vercel."""

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
import fitz
import re

app = FastAPI()


class OrderItem(BaseModel):
    sequence: int
    source_name: str
    quantity: int
    sku: str | None = None
    matched_name: str | None = None


class OrderPreviewRequest(BaseModel):
    vendor: str
    filename: str
    items: list[OrderItem]


@app.get("/document-api/health")
def health():
    return {"ok": True, "engine": "pymupdf"}


@app.post("/document-api/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="빈 PDF 파일입니다.")

    try:
        pages = []
        with fitz.open(stream=content, filetype="pdf") as document:
            for page_number, page in enumerate(document, start=1):
                text = page.get_text("text") or ""
                pages.append(
                    {
                        "page_number": page_number,
                        "source_label": f"Page {page_number}",
                        "text": text,
                    }
                )
        return {
            "engine": "papemate-pymupdf",
            "pages": pages,
            "text": "\n".join(page["text"] for page in pages),
        }
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"PDF를 읽지 못했습니다: {error}") from error


def _draw_order_page(document, request: OrderPreviewRequest, page_number: int):
    page = document.new_page(width=595, height=842)
    page.insert_text((36, 42), "MIYANSOL", fontname="helv", fontsize=18, color=(0.05, 0.12, 0.23))
    page.insert_text((135, 42), "주문서", fontname="korea", fontsize=18, color=(0.05, 0.12, 0.23))
    page.insert_text((36, 66), f"거래처: {request.vendor}", fontname="korea", fontsize=10)
    page.insert_text((300, 66), f"원본: {request.filename}", fontname="korea", fontsize=8)
    page.insert_text((520, 42), f"{page_number}", fontname="helv", fontsize=9)
    page.draw_line((36, 78), (559, 78), color=(0.10, 0.35, 0.65), width=1.5)
    return page


@app.post("/document-api/order-preview")
def order_preview(request: OrderPreviewRequest):
    """PaperMate-style source units rendered as a normalized MIYANSOL order PDF."""
    document = fitz.open()
    page_number = 1
    page = _draw_order_page(document, request, page_number)
    columns = [36, 70, 160, 260, 500, 559]
    y = 92

    def draw_header(current_page, top):
        current_page.draw_rect((36, top, 559, top + 24), color=(0.12, 0.27, 0.48), fill=(0.12, 0.27, 0.48))
        labels = ["순서", "상품코드", "원문 / 매칭 상품", "수량"]
        boxes = [(36, top, 70, top + 24), (70, top, 160, top + 24), (160, top, 500, top + 24), (500, top, 559, top + 24)]
        for label, box in zip(labels, boxes):
            current_page.insert_textbox(box, label, fontname="korea", fontsize=8, color=(1, 1, 1), align=1)
        return top + 24

    y = draw_header(page, y)
    if not request.items:
        page.insert_textbox((50, y + 24, 545, y + 100), "자동으로 인식된 품목이 없습니다. 화면 아래의 수동 출고 입력에서 품목과 수량을 추가해 주세요.", fontname="korea", fontsize=11, align=1)
    else:
        for item in request.items:
            if y + 48 > 810:
                page_number += 1
                page = _draw_order_page(document, request, page_number)
                y = draw_header(page, 92)
            row_bottom = y + 48
            fill = (0.97, 0.98, 1.0) if item.sequence % 2 == 0 else (1, 1, 1)
            page.draw_rect((36, y, 559, row_bottom), color=(0.82, 0.86, 0.91), fill=fill, width=0.5)
            for x in columns[1:-1]:
                page.draw_line((x, y), (x, row_bottom), color=(0.82, 0.86, 0.91), width=0.5)
            page.insert_textbox((36, y + 5, 70, row_bottom), str(item.sequence), fontname="helv", fontsize=8, align=1)
            page.insert_textbox((73, y + 5, 157, row_bottom), item.sku or "-", fontname="korea", fontsize=7, align=1)
            source_font = "korea" if re.search(r"[가-힣]", item.source_name) else "helv"
            page.insert_textbox((164, y + 5, 496, y + 23), item.source_name, fontname=source_font, fontsize=8)
            if item.matched_name and item.matched_name != item.source_name:
                page.insert_textbox((164, y + 24, 496, row_bottom), f"→ {item.matched_name}", fontname="korea", fontsize=8)
            page.insert_textbox((500, y + 5, 559, row_bottom), str(item.quantity), fontname="helv", fontsize=9, align=1)
            y = row_bottom

    total = sum(item.quantity for item in request.items)
    page.insert_text((410, min(y + 28, 828)), f"총 수량: {total}", fontname="korea", fontsize=10)
    output = document.tobytes(garbage=4, deflate=True)
    document.close()
    return Response(output, media_type="application/pdf", headers={"Content-Disposition": "inline; filename=order-preview.pdf"})
