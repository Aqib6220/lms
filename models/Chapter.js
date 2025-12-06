const mongoose = require("mongoose");

const chapterSchema = new mongoose.Schema({
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    title: { type: String, required: true },
    description: { type: String },
    order: { type: Number, default: 0 },
    lessons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lesson" }],
}, { timestamps: true });

module.exports = mongoose.model("Chapter", chapterSchema);

