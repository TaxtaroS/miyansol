# MIYANSOL document worker

PaperMate의 `PyMuPDF` PDF 페이지 추출 방식을 MIYANSOL 주문서 분석용으로 분리한 Vercel Python 서비스입니다.

- PDF 페이지별 텍스트 추출
- 원본 PDF는 Node API가 Neon에 보관
- 이미지 OCR은 MIYANSOL Node 서비스가 담당

PaperMate의 Docker 전용 LibreOffice/Tesseract 코드는 Vercel에서 시스템 패키지를 설치할 수 없어 실행 경로에서 제외했습니다.
