const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const { v4: uuidv4 } = require("uuid");

const generateSafePublicId = (prefix = "upload") => `${prefix}-${uuidv4()}`;

// ✅ Dynamic Storage Based on File Type
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folder = "general_uploads";
    let resourceType = "image";

    if (file.mimetype.startsWith("image/")) {
      folder = req.baseUrl.includes("/courses")
        ? "course_images"
        : "user_profiles";
      return {
        folder,
        format: file.mimetype.split("/")[1],
        public_id: generateSafePublicId("img"),
        resource_type: "image",
      };
    }

    if (file.mimetype.startsWith("video/")) {
      folder = "lesson_videos";
      return {
        folder,
        format: "mp4",
        public_id: generateSafePublicId("vid"),
        resource_type: "video",
      };
    }

    // ---------------- CSV ----------------
    if (file.mimetype === "text/csv") {
      folder = "exam_questions";
      return {
        folder,
        public_id: generateSafePublicId("csv"),
        resource_type: "raw", // ✅ Must be 'raw', not 'image'
        access_mode: "public", // ✅ Recommended for direct access
      };
    }

    // ---------------- PDF ----------------
    const isPdfByMime = (file.mimetype || "").toLowerCase().includes("pdf");
    const isPdfByName = (file.originalname || "")
      .toLowerCase()
      .endsWith(".pdf");
    if (isPdfByMime || isPdfByName) {
      folder = "lesson_notes";
      return {
        folder,
        public_id: generateSafePublicId("pdf"),
        resource_type: "raw", // ✅ MUST BE 'raw'
        access_mode: "public", // ✅ Recommended for direct access
      };
    }

    throw new Error("Invalid file type");
  },
});

// ✅ Handle CSV Uploads Along with Other Files
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 50 MB max file size
});

module.exports = {
  uploadSingle: upload.single("profilePicture"),
  uploadCourseFiles: upload.fields([
    { name: "thumbnail", maxCount: 1 },
    // { name: "bannerImage", maxCount: 1 },
    { name: "lessonVideos", maxCount: 50 },
    { name: "lessonNotes", maxCount: 50 }, // ✅ Add PDF notes upload
    // ✅ NEW (Course-level PDFs)
    { name: "courseSyllabusPdf", maxCount: 1 },
    { name: "courseNotesPdf", maxCount: 1 },
    { name: "coursePreviousPapersPdf", maxCount: 1 },
    // Multiple course-level notes (title + PDF) support
    { name: "courseNotes", maxCount: 50 },
  ]),
  uploadCSV: upload.single("file"), // ✅ Add this for CSV uploads
};
