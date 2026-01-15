const express = require("express");
const { uploadCourseFiles } = require("../middlewares/multerConfig");
const {
  createCourse,
  getCourse,
  getAllCourses,
  getTrainerCourses,
  updateCourse,
  enrollCourse,
  getEnrolledCourses,
  deleteCourse,
  updateCourseApproval,
  getPendingCourses,
} = require("../controllers/courseController");
const protect = require("../middlewares/authMiddleware");
const watermarkPdfs = require("../middlewares/pdfWatermark");
const mongoose = require("mongoose");

const router = express.Router();

// ✅ Create Course (Trainer Only)
router.post(
  "/create-course",
  protect(["trainer"]),
  (req, res, next) => {
    uploadCourseFiles(req, res, (err) => {
      if (err) {
        console.error("Multer Error:", err.message || err);
        return res.status(400).json({
          success: false,
          message: err.message || "File upload error",
        });
      }
      next();
    });
  },
  watermarkPdfs(),
  createCourse
);

//  ✅ Get All Approved Courses (Public)
router.get("/all-approved", getAllCourses);

/**
 * ✅ Approve or Reject a Course (Admin Only)
 */
router.put("/approval/:courseId", protect(["admin"]), updateCourseApproval);

/**
 * ✅ Get Pending Courses (Admin Only)
 */
router.get("/pending", protect(["admin"]), getPendingCourses);

// ✅ Get Trainer's Courses (Trainer Only)
router.get("/trainer", protect(["trainer", "admin"]), getTrainerCourses);
router.delete("/:courseId", protect(["trainer", "admin"]), deleteCourse);

// ✅ Enroll in a Course (Learner Only)
router.post(
  "/enroll/:courseId",
  protect(["learner", "trainer", "admin"]),
  enrollCourse
);

// ✅ Get Enrolled Courses for Learner
router.get(
  "/enrolled",
  protect(["learner", "trainer", "admin"]),
  getEnrolledCourses
);

// ✅ Partial Update Course (Trainer & Admin Only)
router.put(
  "/:courseId",
  protect(["admin", "trainer"]),
  async (req, res, next) => {
    const { courseId } = req.params;

    // ✅ Validate if courseId is a valid MongoDB ObjectId
    if (!mongoose.isValidObjectId(courseId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid course ID" });
    }

    next();
  },
  uploadCourseFiles,
  watermarkPdfs(),
  updateCourse
);

// ✅ Get Single Course by ID (Logged-in Users Only)
router.get(
  "/:id",
  async (req, res, next) => {
    const { id } = req.params;

    // Validate if the ID is a valid ObjectId
    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid course ID" });
    }
    next();
  },
  getCourse
);

module.exports = router;
