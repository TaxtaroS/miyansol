"""PaperMate-derived document worker for fast PDF text extraction on Vercel."""

from fastapi import FastAPI, File, HTTPException, UploadFile
import fitz

app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True, "engine": "pymupdf"}


@app.post("/extract-pdf")
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
