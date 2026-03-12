import pdf from "pdf-parse";

export async function getPdfPageCountFromBuffer(
  buffer: Buffer,
): Promise<number> {
  const parsedPdf = await pdf(buffer);

  if (!Number.isInteger(parsedPdf.numpages) || parsedPdf.numpages < 1) {
    throw new Error("Unable to determine PDF page count.");
  }

  return parsedPdf.numpages;
}
