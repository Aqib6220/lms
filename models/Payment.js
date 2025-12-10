const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema({
    chapter: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course" }, // Keep for easy querying
    title: { type: String, required: true },
    description: { type: String },
    videoUrl: { type: String }, // Cloudinary / Mux URL
    videoType: { type: String, enum: ["upload", "youtube"], default: "upload" },
    notesUrl: { type: String }, // PDF notes URL (Cloudinary)
    duration: { type: String }, // Lesson duration (e.g., "45 minutes")
    order: { type: Number, default: 0 }, // Lesson Order within chapter
    isFreePreview: { type: Boolean, default: false }, // Free preview lesson
    unlocked: { type: Boolean, default: false }, // Unlock after previous completion
    subtitles: { type: String }, // Optional
}, { timestamps: true });

module.exports = mongoose.model("Lesson", lessonSchema);
