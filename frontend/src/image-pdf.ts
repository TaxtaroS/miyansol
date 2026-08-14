function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function imageToPdfUrl(file: File) {
  const { jsPDF } = await import("jspdf");
  const bitmap = await createImageBitmap(file);
  const landscape = bitmap.width > bitmap.height;
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 5;
  const scale = Math.min((pageWidth - margin * 2) / bitmap.width, (pageHeight - margin * 2) / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  bitmap.close();
  const dataUrl = await readAsDataUrl(file);
  pdf.addImage(dataUrl, file.type.includes("png") ? "PNG" : "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, "FAST");
  return URL.createObjectURL(pdf.output("blob"));
}
