const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const uploadPdf=require("../middlewares/multerConfig").uploadPdf;
const express = require("express");
const watermarkPdfs = require("../middlewares/pdfWatermark");
const {
  createLesson,
  getLessonsByCourse,
  updateLesson,
  deleteLesson,
} = require("../controllers/lessonController");

const protect = require("../middlewares/authMiddleware");
const upload = require("../middlewares/multerConfig");

const router = express.Router();

// ✅ Create Lesson for a Course (Trainer Only)
router.post(
  "/create/:courseId",
  protect(["trainer"]),
  upload.single("video"),
  createLesson
);

// ✅ Get All Lessons for a Course
router.get("/:courseId", protect(["trainer", "student"]), getLessonsByCourse);

// ✅ Update Lesson
router.put(
  "/update/:lessonId",
  protect(["trainer"]),
  upload.single("video"),
  uploadPdf,
  watermarkPdfs(),
  updateLesson
);

// ✅ Delete Lesson
router.delete("/delete/:lessonId", protect(["trainer"]), deleteLesson);

module.exports = router;
