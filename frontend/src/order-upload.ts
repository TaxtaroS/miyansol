// Leave space for multipart headers under the hosting request-size limit.
export const MAX_ORDER_FILE_BYTES = 4_000_000;
export function orderMimeType(file: {type:string;name:string}) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return ({pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",bmp:"image/bmp",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"} as Record<string,string>)[extension] || file.type;
}

export async function prepareOrderUpload(file: File): Promise<File> {
  const type = orderMimeType(file);
  if (!file.size) throw new Error("빈 파일입니다.");
  if (type.startsWith("image/") && (file.size > MAX_ORDER_FILE_BYTES || type === "image/bmp")) {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("사진을 준비할 수 없습니다.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      for (const quality of [0.95, 0.9, 0.85]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= MAX_ORDER_FILE_BYTES) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {type:"image/jpeg"});
      }
    } finally { bitmap.close(); }
    throw new Error("사진 용량이 큽니다. 글자가 선명하게 보이도록 나누어 올려 주세요.");
  }
  if (file.size > MAX_ORDER_FILE_BYTES) throw new Error("파일은 4MB 이하로 올려 주세요. 큰 PDF는 페이지를 나누어 주세요.");
  return new File([file], file.name, {type});
}

export async function orderResponse<T>(response: Response): Promise<T> {
  if (response.status === 413) throw new Error("파일 용량이 서버 업로드 한도를 초과했습니다. 파일을 나누어 올려 주세요.");
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`주문서 서버 응답 오류 (${response.status}). 잠시 후 다시 시도해 주세요.`); }
  if (!response.ok) throw new Error(data.message || `주문서 처리 실패 (${response.status})`);
  return data as T;
}
