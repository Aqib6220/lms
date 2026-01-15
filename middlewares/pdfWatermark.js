const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const cloudinary = require("../config/cloudinary");
const { addTextWatermarkToPdf } = require("../utils/pdfWaterMark");

// Helper: extract publicId and folder from a Cloudinary URL
function extractPublicIdAndFolder(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean); // remove empties
    // Find upload index
    const uploadIndex = parts.findIndex((p) => p === "upload");
    if (uploadIndex === -1) return { publicId: null, folder: null };

    let idx = uploadIndex + 1; // points to v<version> or folder
    // skip version if present
    if (parts[idx] && parts[idx].startsWith("v")) idx++;

    const fileNameWithExt = parts.pop();
    const publicId = fileNameWithExt.split(".")[0];
    const folder = parts.slice(idx).join("/");
    return { publicId, folder };
  } catch (err) {
    return { publicId: null, folder: null };
  }
}

// Middleware: scans req.files and for any PDF file downloads it, adds watermark text, and re-uploads (overwrite) to Cloudinary
const watermarkPdfs = (options = {}) => {
  const watermarkText = options.text || process.env.PDF_WATERMARK || "MyWebsite";
  const fontSize = options.fontSize || 48;

  return async (req, res, next) => {
    try {
      if (!req.files) return next();

      const fileFields = Object.keys(req.files);
      for (const field of fileFields) {
        const files = req.files[field] || [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const isPdf =
            f.mimetype === "application/pdf" ||
            f.originalname?.toLowerCase().endsWith(".pdf");

          if (!isPdf) continue;

          const url = f.path || f.secure_url || f.url;
          if (!url) continue;

          // Download to temp
          const tmpFile = path.join(os.tmpdir(), `${uuidv4()}.pdf`);
          const response = await axios.get(url, { responseType: "arraybuffer" });
          fs.writeFileSync(tmpFile, Buffer.from(response.data));

          // Watermark
          const watermarkedPath = await addTextWatermarkToPdf(tmpFile, watermarkText, {
            fontSize,
            color: { r: 0.75, g: 0.75, b: 0.75 },
            opacity: 0.15,
            rotateDegrees: -45,
          });

          // Determine target public_id/folder
          const { publicId, folder } = extractPublicIdAndFolder(url);
          const uploadOptions = {
            resource_type: "raw",
            overwrite: true,
            invalidate: true,
            access_mode: "public",
          };
          if (publicId) {
            if (folder) uploadOptions.folder = folder;
            // Use the same public id so it overwrites
            uploadOptions.public_id = publicId;
          }

          // Upload watermarked PDF to Cloudinary (overwrite original if we could get publicId)
          const uploadResult = await cloudinary.uploader.upload(watermarkedPath, uploadOptions);

          // Update file metadata so controllers use the new URL
          f.path = uploadResult.secure_url || uploadResult.url || f.path;
          f.secure_url = uploadResult.secure_url || f.secure_url;

          if (process.env.NODE_ENV !== "production") {
            console.debug(
              "PDF watermark applied:",
              url,
              "->",
              uploadResult.secure_url || uploadResult.url
            );
          }

          // Clean up temp files
          try {
            fs.unlinkSync(tmpFile);
          } catch (e) {}
          try {
            fs.unlinkSync(watermarkedPath);
          } catch (e) {}
        }
      }

      return next();
    } catch (err) {
      console.error("PDF watermarking failed:", err?.message || err);
      // Fail-open: don't block upload, but notify
      return res.status(500).json({ success: false, message: "PDF watermarking failed", error: err?.message || err });
    }
  };
};

module.exports = watermarkPdfs;
