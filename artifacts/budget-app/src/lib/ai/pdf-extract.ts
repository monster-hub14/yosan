/**
 * PDF text extraction using pdfjs-dist (runs server-side only).
 * Extracts all text content from a PDF buffer so it can be passed to the AI
 * extraction step instead of a placeholder string.
 */

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    GlobalWorkerOptions.workerSrc = "";

    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const textParts: string[] = [];

    for (let i = 1; i <= Math.min(numPages, 10); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) textParts.push(pageText);
    }

    await pdf.destroy();

    return textParts.join("\n\n").slice(0, 8000);
  } catch (err) {
    console.error("[pdf-extract] extraction failed:", err);
    return "";
  }
}
