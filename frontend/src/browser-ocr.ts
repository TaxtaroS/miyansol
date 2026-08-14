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
  return canvas;
}

function textScore(text: string, confidence: number) {
  const useful = text.replace(/[^0-9A-Za-z가-힣]/g, "").length;
  const rows = text.split(/\r?\n/).filter((line) => line.trim().length > 2).length;
  return useful + rows * 8 + confidence;
}

export async function readOrderImage(file: File, onProgress: (progress: number) => void) {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  let best = { text: "", score: -1 };
  const rotations: Array<0 | 90 | 270> = [0, 90, 270];
  try {
    for (let attempt = 0; attempt < rotations.length; attempt += 1) {
      const canvas = await prepareImage(file, rotations[attempt]);
      progressListener = (progress) => onProgress((attempt + progress) / rotations.length);
      const result = await worker.recognize(canvas);
      const text = result.data.text.trim();
      const score = textScore(text, result.data.confidence || 0);
      if (score > best.score) best = { text, score };
    }
    onProgress(1);
    if (!best.text) throw new Error("사진에서 문자를 찾지 못했습니다.");
    return best.text;
  } finally {
    progressListener = null;
  }
}
