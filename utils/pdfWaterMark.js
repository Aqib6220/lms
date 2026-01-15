const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function addLogoToPdf(inputPdfPath, logoPath) {
  const pdfBytes = fs.readFileSync(inputPdfPath);
  const logoBytes = fs.readFileSync(logoPath);

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const logoImage = await pdfDoc.embedPng(logoBytes);

  const pages = pdfDoc.getPages();

  pages.forEach((page) => {
    const { width, height } = page.getSize();

    page.drawImage(logoImage, {
      x: width - 120, // right corner
      y: 20, // bottom
      width: 100,
      height: 40,
      opacity: 0.3, // watermark style
    });
  });

  const modifiedPdfBytes = await pdfDoc.save();

  const outputPath = inputPdfPath.replace(".pdf", "_watermarked.pdf");
  fs.writeFileSync(outputPath, modifiedPdfBytes);

  return outputPath;
}

// New: Add text watermark (website name) centered and rotated on each page
async function addTextWatermarkToPdf(inputPdfPath, text = "MyWebsite", opts = {}) {
  const {
    fontSize = 48,
    color = { r: 0.7, g: 0.7, b: 0.7 },
    opacity = 0.18,
    rotateDegrees = -45,
    margin = 0,
  } = opts;

  const pdfBytes = fs.readFileSync(inputPdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  pages.forEach((page) => {
    const { width, height } = page.getSize();

    // Compute centered position
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const x = (width - textWidth) / 2 + margin;
    const y = height / 2;

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
      rotate: degrees(rotateDegrees),
      opacity: opacity, // best-effort: pdf-lib supports opacity for drawing
    });
  });

  const modifiedPdfBytes = await pdfDoc.save();
  const outputPath = inputPdfPath.replace(".pdf", "_watermarked.pdf");
  fs.writeFileSync(outputPath, modifiedPdfBytes);

  return outputPath;
}

module.exports = {
  addLogoToPdf,
  addTextWatermarkToPdf,
};
