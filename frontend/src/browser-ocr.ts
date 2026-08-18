import { createWorker, PSM, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((progress: number) => void) | null = null;

function getWorker() {
  workerPromise ||= createWorker("kor+eng", 1, {
    logger(message) {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        progressListener?.(message.progress);
      }
    },
  });
  return workerPromise;
}

async function prepareImage(file: File, rotation: 0 | 90 | 270) {
  const bitmap = await createImageBitmap(file);
  const rotated = rotation !== 0;
  const sourceWidth = rotated ? bitmap.height : bitmap.width;
  const sourceHeight = rotated ? bitmap.width : bitmap.height;
  const scale = Math.min(4, Math.max(1, 2800 / Math.max(sourceWidth, sourceHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("사진 보정 화면을 만들 수 없습니다.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    bitmap,
    -(bitmap.width * scale) / 2,
    -(bitmap.height * scale) / 2,
    bitmap.width * scale,
    bitmap.height * scale,
  );
  bitmap.close();

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
    image.data[index] = contrasted;
    image.data[index + 1] = contrasted;
    image.data[index + 2] = contrasted;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.putImageData(image, 0, 0);

  // Remove the large blank margins common in photographed order sheets.
  const rowInk = new Uint32Array(canvas.height);
  const columnInk = new Uint32Array(canvas.width);
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const value = image.data[(y * canvas.width + x) * 4];
      if (value < 185) {
        rowInk[y] += 1;
        columnInk[x] += 1;
      }
    }
  }
  const activeRows = [...rowInk.keys()].filter((y) => rowInk[y] > canvas.width * 0.004);
  const activeColumns = [...columnInk.keys()].filter((x) => columnInk[x] > canvas.height * 0.003);
  if (activeRows.length < 2 || activeColumns.length < 2) return canvas;
  const marginX = Math.round(canvas.width * 0.025);
  const marginY = Math.round(canvas.height * 0.025);
  const left = Math.max(0, activeColumns[0] - marginX);
  const right = Math.min(canvas.width, activeColumns.at(-1)! + marginX);
  const top = Math.max(0, activeRows[0] - marginY);
  const bottom = Math.min(canvas.height, activeRows.at(-1)! + marginY);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth < canvas.width * 0.35 || cropHeight < canvas.height * 0.2) return canvas;
  const cropScale = Math.min(4, 3000 / Math.max(cropWidth, cropHeight));
  const cropped = document.createElement("canvas");
  cropped.width = Math.round(cropWidth * cropScale);
  cropped.height = Math.round(cropHeight * cropScale);
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) return canvas;
  croppedContext.imageSmoothingEnabled = true;
  croppedContext.imageSmoothingQuality = "high";
  croppedContext.drawImage(canvas, left, top, cropWidth, cropHeight, 0, 0, cropped.width, cropped.height);
  return cropped;
}

function textScore(text: string, confidence: number) {
  const useful = text.replace(/[^0-9A-Za-z가-힣]/g, "").length;
  const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 2).length;
  const brands = (text.match(/MIYANSOL/gi) || []).length;
  const longNumbers = (text.match(/\b\d{8,14}\b/g) || []).length;
  const productCodes = (text.match(/\b[A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*\b/g) || []).length;
  return useful + rows * 8 + confidence + brands * 500 + longNumbers * 80 + productCodes * 60;
}

function uniqueLines(parts: string[]) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    for (const raw of part.split(/\r?\n/)) {
      const line = raw.replace(/[ \t]+/g, " ").trim();
      if (line.length < 2) continue;
      const key = line.toLowerCase().replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function pageChunks(canvas: HTMLCanvasElement) {
  const chunks: HTMLCanvasElement[] = [canvas];
  if (canvas.height < 900) return chunks;
  const overlap = Math.round(canvas.height * 0.06);
  const bandHeight = Math.ceil(canvas.height / 3) + overlap * 2;
  for (let band = 0; band < 3; band += 1) {
    const top = Math.max(0, Math.round((canvas.height * band) / 3) - overlap);
    const bottom = Math.min(canvas.height, top + bandHeight);
    const chunk = document.createElement("canvas");
    chunk.width = canvas.width;
    chunk.height = bottom - top;
    const context = chunk.getContext("2d");
    if (!context) continue;
    context.drawImage(canvas, 0, top, canvas.width, chunk.height, 0, 0, chunk.width, chunk.height);
    chunks.push(chunk);
  }
  return chunks;
}

export async function readOrderPdf(file: File, onProgress: (progress: number) => void) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  const pageTexts: string[] = [];
  const pageCount = Math.min(pdf.numPages, 20);
  let completed = 0;
  const totalJobs = pageCount * 4;
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(3.2, Math.max(1.8, 2600 / Math.max(baseViewport.width, baseViewport.height)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("PDF 페이지 화면을 만들 수 없습니다.");
      await page.render({ canvasContext: context, viewport, canvas }).promise;

      const chunkTexts: string[] = [];
      for (const chunk of pageChunks(canvas)) {
        progressListener = (progress) => onProgress(Math.min(0.99, (completed + progress) / totalJobs));
        const result = await worker.recognize(chunk, { rotateAuto: true });
        if (result.data.text.trim()) chunkTexts.push(result.data.text.trim());
        completed += 1;
      }
      pageTexts.push(`[Page ${pageNumber}]\n${uniqueLines(chunkTexts)}`);
      page.cleanup();
    }
    onProgress(1);
    return { text: pageTexts.join("\n\n"), rotation: 0 as const };
  } finally {
    progressListener = null;
    await pdf.cleanup();
  }
}

export async function readOrderImage(file: File, onProgress: (progress: number) => void) {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  let best: { text: string; score: number; rotation: 0 | 90 | 270 } = { text: "", score: -1, rotation: 0 };
  const rotations: Array<0 | 90 | 270> = [0, 90, 270];
  try {
    for (let attempt = 0; attempt < rotations.length; attempt += 1) {
      const canvas = await prepareImage(file, rotations[attempt]);
      progressListener = (progress) => onProgress((attempt + progress) / rotations.length);
      const result = await worker.recognize(canvas);
      const text = result.data.text.trim();
      const score = textScore(text, result.data.confidence || 0);
      if (score > best.score) best = { text, score, rotation: rotations[attempt] };
    }
    onProgress(1);
    if (!best.text) throw new Error("사진에서 문자를 찾지 못했습니다.");
    return { text: best.text, rotation: best.rotation };
  } finally {
    progressListener = null;
  }
}
