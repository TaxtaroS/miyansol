function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function imageToPdf(file: File, rotation: 0 | 90 | 270 = 0) {
  const { jsPDF } = await import("jspdf");
  const bitmap = await createImageBitmap(file);
  const rotated = rotation !== 0;
  const imageWidth = rotated ? bitmap.height : bitmap.width;
  const imageHeight = rotated ? bitmap.width : bitmap.height;
  const landscape = imageWidth > imageHeight;
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 5;
  const scale = Math.min((pageWidth - margin * 2) / imageWidth, (pageHeight - margin * 2) / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  bitmap.close();
  const dataUrl = await readAsDataUrl(file);
  pdf.addImage(dataUrl, file.type.includes("png") ? "PNG" : "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST", rotation);
  const blob = pdf.output("blob");
  return {blob,url:URL.createObjectURL(blob),name:file.name.replace(/\.[^.]+$/,"")+".pdf"};
}
