const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    thumbnail: { type: String }, // Cloudinary URL
    price: { type: Number, default: 0 }, // 0 for free courses
    duration: { type: String }, // Total duration (e.g., "6 weeks")
    chapters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chapter" }], // Chapters (like Udemy sections)
    lessons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lesson" }], // All lessons for easy access
    prerequisites: [String], // List of prerequisites
    courseLevel: {
      type: String,
      enum: [
        "Semester-1",
        "Semester-2",
        "Semester-3",
        "Semester-4",
        "Semester-5",
        "Semester-5",
        "Semester-6",
        "Semester-6",
        "Semester-7",
      ],
      default: null,
    },
    certificationAvailable: { type: Boolean, default: false },
    reviews: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        comment: String,
        rating: Number,
      },
    ],
    courseDocuments: {
      syllabusPdf: { type: String },
      notesPdf: { type: String },
      previousPapersPdf: { type: String },
    },

    // Course-level notes (multiple PDFs with titles)
    courseNotes: [
      {
        title: { type: String },
        url: { type: String },
      },
    ],

    // Approval workflow
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Admin who approved
    approvalDate: { type: Date },
    rejectionReason: { type: String }, // If rejected, store reason
    trainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // Trainer reference

    // Additional fields
    language: { type: String, default: "English" },
    board: { type: String },
    classLevel: { type: String },
    subject: { type: String },
    targetAudience: { type: String },

    syllabus: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);
