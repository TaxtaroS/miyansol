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

export async function readOrderImage(file: File, onProgress: (progress: number) => void) {
  progressListener = onProgress;
  try {
    const worker = await getWorker();
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const result = await worker.recognize(file);
    return result.data.text.trim();
  } finally {
    progressListener = null;
  }
}
