const multer = require("multer");
const fs = require("fs");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const { v4: uuidv4 } = require("uuid");

const generateSafePublicId = (prefix = "upload") => `${prefix}-${uuidv4()}`;

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    /* ---------------- IMAGES ---------------- */
    if (file.mimetype.startsWith("image/")) {
      const folder = req.baseUrl.includes("/courses")
        ? "course_images"
        : "user_profiles";

      return {
        folder,
        public_id: generateSafePublicId("img"),
        resource_type: "image",
        format: file.mimetype.split("/")[1],
        overwrite: true,
        invalidate: true,
      };
    }

    /* ---------------- VIDEOS ---------------- */
    if (file.mimetype.startsWith("video/")) {
      return {
        folder: "lesson_videos",
        public_id: generateSafePublicId("vid"),
        resource_type: "video",
        format: "mp4",
        overwrite: true,
        invalidate: true,
      };
    }

    /* ---------------- CSV ---------------- */
    if (file.mimetype === "text/csv") {
      return {
        folder: "exam_questions",
        public_id: generateSafePublicId("csv"),
        resource_type: "raw",
        access_mode: "public",
        overwrite: true,
        invalidate: true,
      };
    }

    /* ---------------- PDF (UPLOAD + EDIT) ---------------- */
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      const isCoursePdf = req.baseUrl.includes("/courses");

      return {
        folder: isCoursePdf ? "course_pdfs" : "lesson_notes",
        public_id:
          req.body.publicId || generateSafePublicId("pdf"),
        // 👆 pass existing publicId to EDIT pdf
        resource_type: "raw",
        access_mode: "public",
        overwrite: true,     // ✅ REQUIRED FOR EDIT
        invalidate: true,    // ✅ refresh CDN
      };
    }

    throw new Error("Unsupported file type");
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

module.exports = {
  uploadSingle: upload.single("profilePicture"),

  uploadCourseFiles: upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "lessonVideos", maxCount: 50 },
    { name: "lessonNotes", maxCount: 50 },

    // Course-level PDFs
    { name: "courseSyllabusPdf", maxCount: 1 },
    { name: "courseNotesPdf", maxCount: 1 },
    { name: "coursePreviousPapersPdf", maxCount: 1 },

    { name: "courseNotes", maxCount: 50 },
    { name: "previousPapers", maxCount: 50 },
  ]),

  uploadCSV: upload.single("file"),

  uploadPdf: upload.single("pdf"), // ✅ simple PDF route
};
