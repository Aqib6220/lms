const Course = require("../models/Course");
const Chapter = require("../models/Chapter");
const Lesson = require("../models/Lesson");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const isUserEnrolled = async (userId, courseId) => {
  if (!userId) return false;
  const user = await User.findById(userId).select("enrolledCourses");
  return user?.enrolledCourses?.includes(courseId);
};

// Helper: destroy a Cloudinary resource (best-effort) by URL
const destroyCloudinaryResourceByUrl = async (url, resourceTypeGuess) => {
  if (!url || typeof url !== "string") return;
  try {
    const publicIdWithExt = url.split("/").pop();
    const publicId = publicIdWithExt.split(".")[0];
    let resource_type = resourceTypeGuess || "image";
    if (
      url.includes("/video/") ||
      publicIdWithExt.match(/\.mp4|\.mov|\.webm|\.mkv|\.avi/i)
    ) {
      resource_type = "video";
    } else if (url.includes("/raw/") || publicIdWithExt.match(/\.pdf|\.csv/i)) {
      resource_type = "raw";
    } else {
      resource_type = "image";
    }

    const folderCandidates =
      resource_type === "video"
        ? ["lesson_videos"]
        : resource_type === "raw"
        ? ["lesson_notes", "course_documents"]
        : [
            "course_images",
            "user_profiles",
            "course_thumbnails",
            "lesson_notes",
          ];

    // Try with folder + publicId, then fallback to publicId alone
    for (const folder of folderCandidates) {
      try {
        await cloudinary.uploader.destroy(`${folder}/${publicId}`, {
          resource_type,
        });
        return;
      } catch (err) {
        // ignore and try next
      }
    }
    // Final fallback
    await cloudinary.uploader.destroy(publicId, { resource_type });
  } catch (err) {
    console.error(
      "Failed to destroy Cloudinary resource:",
      url,
      err?.message || err
    );
  }
};

// ✅ Create Course (Trainers Only, Requires Admin Approval)
const createCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      price,
      duration,
      prerequisites,
      courseLevel,
      certificationAvailable,
      syllabus: syllabusRaw,
      language,
      board,
      classLevel,
      subject,
      targetAudience,
    } = req.body;
    const syllabusPdf = req.files?.courseSyllabusPdf?.[0]?.path || null;

    const notesPdf = req.files?.courseNotesPdf?.[0]?.path || null;

    const previousPapersPdf =
      req.files?.coursePreviousPapersPdf?.[0]?.path || null;

    // Course-level multiple notes files and metadata
    const courseNoteFiles = req.files?.courseNotes || [];
    let courseNotesMeta = [];
    try {
      courseNotesMeta = Array.isArray(req.body.courseNotesMeta)
        ? req.body.courseNotesMeta
        : JSON.parse(req.body.courseNotesMeta || "[]");
    } catch (err) {
      courseNotesMeta = [];
    }

    const courseNotes = courseNoteFiles.map((f, idx) => ({
      title:
        (courseNotesMeta[idx] && courseNotesMeta[idx].title) ||
        courseNotesMeta[idx] ||
        `Note ${idx + 1}`,
      url: f?.path || f?.secure_url || null,
    }));

    // Previous year papers (multiple) files and metadata
    const previousPaperFiles = req.files?.previousPapers || [];
    let previousPapersMeta = [];
    try {
      previousPapersMeta = Array.isArray(req.body.previousPapersMeta)
        ? req.body.previousPapersMeta
        : JSON.parse(req.body.previousPapersMeta || "[]");
    } catch (err) {
      previousPapersMeta = [];
    }

    const previousPapers = previousPaperFiles.map((f, idx) => ({
      title: (previousPapersMeta[idx] && previousPapersMeta[idx].title) || previousPapersMeta[idx] || `Paper ${idx + 1}`,
      url: f?.path || f?.secure_url || null,
    }));

    // Parse chapters data from form
    const chaptersRaw = req.body.chapters;
    let chaptersData = [];
    try {
      chaptersData = Array.isArray(chaptersRaw)
        ? chaptersRaw
        : JSON.parse(chaptersRaw || "[]");
    } catch (e) {
      chaptersData = [];
    }

    // ✅ Ensure user is a trainer
    const trainer = await User.findById(req.user.id);
    if (!trainer || trainer.role !== "trainer") {
      return res
        .status(403)
        .json({ success: false, message: "Only trainers can create courses" });
    }

    // ✅ Upload Files (Multer)
    const thumbnail = req.files?.thumbnail?.[0]?.path || null;

    // Debug uploaded files (helpful during development)
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        "Uploaded files for createCourse:",
        JSON.stringify(req.files, null, 2)
      );
    }

    // Helper: best-effort cleanup of uploaded files on validation failure
    const cleanupUploadedFiles = async () => {
      try {
        if (!req.files) return;
        const fileEntries = Object.values(req.files).flat();
        for (const f of fileEntries) {
          try {
            const url = f?.path || f?.secure_url || f?.url;
            if (!url) continue;
            const publicId = url.split("/").pop().split(".")[0];
            const resource_type =
              f.mimetype && f.mimetype.startsWith("video/")
                ? "video"
                : f.mimetype && f.mimetype.startsWith("image/")
                ? "image"
                : "raw";

            const folders =
              resource_type === "video"
                ? ["lesson_videos"]
                : [
                    "course_images",
                    "user_profiles",
                    "course_thumbnails",
                    "lesson_notes",
                  ];
            let destroyed = false;
            for (const folder of folders) {
              try {
                await cloudinary.uploader.destroy(`${folder}/${publicId}`, {
                  resource_type,
                });
                destroyed = true;
                break;
              } catch (err) {}
            }
            if (!destroyed) {
              try {
                await cloudinary.uploader.destroy(publicId, { resource_type });
              } catch (err) {
                console.error(
                  "Failed to cleanup uploaded file:",
                  url,
                  err?.message || err
                )
              }
            }
          } catch (err) {
            console.error("Error while attempting to cleanup a file:", err);
          }
        }
      } catch (err) {
        console.error("Cleanup failed:", err);
      }
    };

    // ✅ Validate Inputs
    if (
      !title ||
      !description ||
      !category ||
      !price ||
      !duration ||
      !courseLevel ||
      !thumbnail
    ) {
      await cleanupUploadedFiles();
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    // ✅ Parse & Validate Syllabus
    let syllabus = [];
    try {
      syllabus = Array.isArray(syllabusRaw)
        ? syllabusRaw
        : JSON.parse(syllabusRaw || "[]");
      syllabus.forEach((item) => {
        if (!item.title || !item.description) {
          throw new Error(
            "Each syllabus item must have a title and description."
          );
        }
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid syllabus format: " + err.message,
      });
    }
// changing the cmmit
    // ✅ Create Course (Pending Approval)
    const course = new Course({
      title,
      description,
      category,
      trainer: trainer._id,
      thumbnail,
      price,
      duration,
      prerequisites,
      courseLevel,
      certificationAvailable,
      syllabus,
      language,
      board,
      classLevel,
      subject,
      targetAudience,
      courseDocuments: {
        syllabusPdf,
        notesPdf,
        previousPapersPdf,
      },
      status: "pending",
      courseNotes,
      previousPapers,
    });

    await course.save();
    // console.log("Course saved successfully:", course._id);

    // ✅ Create Chapters and Lessons
    try {
      // console.log(
      //   "Creating chapters, data:",
      //   JSON.stringify(chaptersData, null, 2)
      // );
      const allFiles = req.files || {};
      const videoFiles = allFiles.lessonVideos || [];
      const pdfFiles = allFiles.lessonNotes || [];

      let videoIndex = 0;
      let pdfIndex = 0;

      for (let chapterIdx = 0; chapterIdx < chaptersData.length; chapterIdx++) {
        const chapterMeta = chaptersData[chapterIdx];

        // Create Chapter
        const newChapter = new Chapter({
          course: course._id,
          title: chapterMeta.title || `Chapter ${chapterIdx + 1}`,
          description: chapterMeta.description || "",
          order: chapterIdx,
        });

        await newChapter.save();
        course.chapters = course.chapters || [];
        course.chapters.push(newChapter._id);

        // Create Lessons for this Chapter
        const lessonsData = chapterMeta.lessons || [];
        for (let lessonIdx = 0; lessonIdx < lessonsData.length; lessonIdx++) {
          const lessonMeta = lessonsData[lessonIdx];

          // Get video URL
          let videoUrl = null;
          if (lessonMeta.videoType === "upload" && videoFiles[videoIndex]) {
            videoUrl =
              videoFiles[videoIndex]?.path ||
              videoFiles[videoIndex]?.secure_url;
            videoIndex++;
          } else if (
            lessonMeta.videoType === "youtube" &&
            lessonMeta.videoUrl
          ) {
            videoUrl = lessonMeta.videoUrl;
          }

          // Get notes URL
          let notesUrl = null;
          if (lessonMeta.hasNotes === "true" && pdfFiles[pdfIndex]) {
            notesUrl =
              pdfFiles[pdfIndex]?.path || pdfFiles[pdfIndex]?.secure_url;
            pdfIndex++;
          }

          const newLesson = new Lesson({
            chapter: newChapter._id,
            course: course._id,
            title: lessonMeta.title || `Lesson ${lessonIdx + 1}`,
            description: lessonMeta.description || "",
            videoUrl,
            videoType: lessonMeta.videoType || "upload",
            notesUrl,
            duration: lessonMeta.duration || "",
            order: lessonIdx,
            isFreePreview:
              lessonMeta.isFreePreview === "true" ||
              lessonMeta.isFreePreview === true,
          });

          await newLesson.save();
          newChapter.lessons = newChapter.lessons || [];
          newChapter.lessons.push(newLesson._id);
          course.lessons = course.lessons || [];
          course.lessons.push(newLesson._id);
        }

        await newChapter.save();
      }

      await course.save();
    } catch (err) {
      console.error(
        "Failed to create chapters/lessons during course creation:",
        err.message || err
      );
    }

    return res.status(201).json({
      success: true,
      message: "Course created successfully and is pending admin approval",
      course,
    });
  } catch (error) {
    console.error("Error creating course:", error.message || error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create course",
    });
  }
};

// ✅ Approve or Reject Course (Admins Only)
const updateCourseApproval = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status, rejectionReason } = req.body;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can approve or reject courses" });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    if (status === "rejected" && !rejectionReason) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    course.status = status;
    course.approvedBy = req.user.id;
    course.approvalDate = new Date();
    course.rejectionReason = status === "rejected" ? rejectionReason : null;

    await course.save();

    return res.status(200).json({
      success: true,
      message: `Course ${status} successfully`,
      course,
    });
  } catch (error) {
    console.error("Error updating course approval:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get All Approved Courses
const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({ status: "approved" })
      .populate("trainer", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "All approved courses fetched successfully",
      courses,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Pending Courses (Admins Only)
const getPendingCourses = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can view pending courses" });
    }

    const courses = await Course.find({ status: "pending" })
      .populate("trainer", "name email")
      .populate({
        path: "lessons",
        select: "title videoUrl description order unlocked subtitles", // include needed fields
      });
    return res.status(200).json({ success: true, courses });
  } catch (error) {
    console.error("Error fetching pending courses:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate({
        path: "chapters",
        options: { sort: { order: 1, createdAt: 1 } },
        populate: {
          path: "lessons",
          options: { sort: { order: 1, createdAt: 1 } },
        },
      })
      .populate({
        path: "lessons",
        options: { sort: { order: 1, createdAt: 1 } },
      })
      .populate("trainer", "name email");
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    const requester = req.user || {};
    const isApproved = course.status === "approved";
    const isPrivileged =
      requester.role === "admin" ||
      (requester.id &&
        course.trainer &&
        requester.id.toString() === course.trainer._id?.toString());

    if (!isApproved && !isPrivileged) {
      return res
        .status(403)
        .json({ success: false, message: "This course is not available" });
    }

    res.status(200).json({ success: true, course });
  } catch (error) {
    console.error("Error fetching course:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateCourse = async (req, res, next) => {
  // We'll use a mongoose transaction to ensure DB atomicity and then delete Cloudinary resources after commit
  let session;
  try {
    const courseId = req.params.courseId;

    // Debug: print received files (if any) when handling update
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        "Received files for updateCourse:",
        JSON.stringify(req.files, null, 2)
      );
    }

    // Parse common fields from body
    const {
      title,
      description,
      category,
      thumbnail,
      price,
      duration,
      prerequisites,
      courseLevel,
      certificationAvailable,
      language,
      board,
      classLevel,
      subject,
      targetAudience,
      chapters, // Expecting array of chapters with lessons
      syllabus, // Array of syllabus items
      removedCourseNoteIds, // JSON array of course note _ids to remove
      removedPreviousPaperIds, // JSON array
      removeThumbnail, // "true" or "false"
    } = req.body;

    // detect uploaded course-level files
    const uploadedThumbnail = req.files?.thumbnail?.[0]?.path || null;
    const uploadedSyllabusPdf = req.files?.courseSyllabusPdf?.[0]?.path || null;
    const uploadedNotesPdf = req.files?.courseNotesPdf?.[0]?.path || null;
    const uploadedPreviousPapersPdf =
      req.files?.coursePreviousPapersPdf?.[0]?.path || null;
    const uploadedCourseNotesFiles = req.files?.courseNotes || [];

    // Start a mongoose session/transaction
    const mongoose = require("mongoose");
    session = await mongoose.startSession();
    session.startTransaction();

    // Keep a list of old files we will delete after commit
    const filesToDelete = [];

    // Find the course inside the session
    const course = await Course.findById(courseId).session(session);
    if (!course) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Course not found" });
    }

    // Handle explicit thumbnail removal
    if (removeThumbnail === "true") {
      if (course.thumbnail) filesToDelete.push({ url: course.thumbnail, type: "image" });
      course.thumbnail = null;
    }

    // Update basic fields (no file deletion here yet)
    course.title = title || course.title;
    course.description = description || course.description;
    course.category = category || course.category;

    // If a new thumbnail file was uploaded, queue the old one for deletion and set the new
    if (uploadedThumbnail) {
      if (course.thumbnail && course.thumbnail !== uploadedThumbnail) {
        filesToDelete.push({ url: course.thumbnail, type: "image" });
      }
      course.thumbnail = uploadedThumbnail;
    } else {
      course.thumbnail = thumbnail || course.thumbnail;
    }

    course.price = price !== undefined ? price : course.price;
    course.duration = duration || course.duration;
    course.prerequisites = prerequisites || course.prerequisites;
    course.courseLevel = courseLevel || course.courseLevel;
    course.certificationAvailable =
      certificationAvailable !== undefined
        ? certificationAvailable
        : course.certificationAvailable;
    course.language = language || course.language;
    course.board = board || course.board;
    course.classLevel = classLevel || course.classLevel;
    course.subject = subject || course.subject;
    course.targetAudience = targetAudience || course.targetAudience;

    // Update course documents if new files are uploaded and queue replaced files
    const existingDocs = course.courseDocuments || {};
    if (uploadedSyllabusPdf && existingDocs.syllabusPdf && existingDocs.syllabusPdf !== uploadedSyllabusPdf) {
      filesToDelete.push({ url: existingDocs.syllabusPdf, type: "raw" });
    }
    if (uploadedNotesPdf && existingDocs.notesPdf && existingDocs.notesPdf !== uploadedNotesPdf) {
      filesToDelete.push({ url: existingDocs.notesPdf, type: "raw" });
    }
    if (uploadedPreviousPapersPdf && existingDocs.previousPapersPdf && existingDocs.previousPapersPdf !== uploadedPreviousPapersPdf) {
      filesToDelete.push({ url: existingDocs.previousPapersPdf, type: "raw" });
    }

    course.courseDocuments = {
      syllabusPdf: uploadedSyllabusPdf || existingDocs.syllabusPdf || null,
      notesPdf: uploadedNotesPdf || existingDocs.notesPdf || null,
      previousPapersPdf:
        uploadedPreviousPapersPdf || existingDocs.previousPapersPdf || null,
    };

    // Handle removal of course-level notes (if IDs provided)
    const removedCourseNotes = JSON.parse(removedCourseNoteIds || "[]");
    if (Array.isArray(removedCourseNotes) && removedCourseNotes.length > 0) {
      course.courseNotes = course.courseNotes || [];
      // collect urls for notes to delete
      course.courseNotes.forEach((note) => {
        if (removedCourseNotes.includes(String(note._id))) {
          if (note.url) filesToDelete.push({ url: note.url, type: "raw" });
        }
      });
      // filter them out from the document
      course.courseNotes = course.courseNotes.filter(
        (note) => !removedCourseNotes.includes(String(note._id))
      );
    }

    // Handle removal of previous papers (if IDs provided)
    const removedPrevPapers = JSON.parse(removedPreviousPaperIds || "[]");
    if (Array.isArray(removedPrevPapers) && removedPrevPapers.length > 0) {
      course.previousPapers = course.previousPapers || [];
      course.previousPapers.forEach((paper) => {
        if (removedPrevPapers.includes(String(paper._id))) {
          if (paper.url) filesToDelete.push({ url: paper.url, type: "raw" });
        }
      });
      course.previousPapers = course.previousPapers.filter(
        (paper) => !removedPrevPapers.includes(String(paper._id))
      );
    }

    // Handle newly uploaded course-level notes (append to existing course.courseNotes)
    try {
      let courseNotesMeta = [];
      try {
        courseNotesMeta = Array.isArray(req.body.courseNotesMeta)
          ? req.body.courseNotesMeta
          : JSON.parse(req.body.courseNotesMeta || "[]");
      } catch (err) {
        courseNotesMeta = [];
      }

      if (uploadedCourseNotesFiles && uploadedCourseNotesFiles.length > 0) {
        course.courseNotes = course.courseNotes || [];
        uploadedCourseNotesFiles.forEach((f, idx) => {
          const title =
            (courseNotesMeta[idx] && courseNotesMeta[idx].title) ||
            courseNotesMeta[idx] ||
            `Note ${course.courseNotes.length + 1}`;
          const url = f?.path || f?.secure_url || null;
          course.courseNotes.push({ title, url });
        });
      }
    } catch (err) {
      console.error("Error appending new course notes:", err?.message || err);
    }

    // Handle newly uploaded previous year papers (append to existing course.previousPapers)
    try {
      let previousPapersMeta = [];
      try {
        previousPapersMeta = Array.isArray(req.body.previousPapersMeta)
          ? req.body.previousPapersMeta
          : JSON.parse(req.body.previousPapersMeta || "[]");
      } catch (err) {
        previousPapersMeta = [];
      }

      const uploadedPreviousPapers = req.files?.previousPapers || [];
      if (uploadedPreviousPapers && uploadedPreviousPapers.length > 0) {
        course.previousPapers = course.previousPapers || [];
        uploadedPreviousPapers.forEach((f, idx) => {
          const title = (previousPapersMeta[idx] && previousPapersMeta[idx].title) || previousPapersMeta[idx] || `Paper ${course.previousPapers.length + 1}`;
          const url = f?.path || f?.secure_url || null;
          course.previousPapers.push({ title, url });
        });
      }
    } catch (err) {
      console.error("Error appending previous year papers:", err?.message || err);
    }


    // Handle syllabus
    if (syllabus) {
      course.syllabus = Array.isArray(syllabus)
        ? syllabus
        : JSON.parse(syllabus);
    }
    // Handle chapters and lessons
    if (chapters) {
      let parsedChapters = Array.isArray(chapters)
        ? chapters
        : JSON.parse(chapters); // Parse if sent as string

      const chapterIds = [];

      const allFiles = req.files || {};
      if (process.env.NODE_ENV !== "production") {
        console.debug(
          "allFiles in updateCourse:",
          JSON.stringify(allFiles, null, 2)
        );
      }
      const videoFiles = allFiles.lessonVideos || [];
      const pdfFiles = allFiles.lessonNotes || [];
      let videoIndex = 0;
      let pdfIndex = 0;
      // Build a map for uploaded videos from the provided lessonVideoMappings
      let lessonVideoMappings = [];
      try {
        lessonVideoMappings = Array.isArray(req.body.lessonVideoMappings)
          ? req.body.lessonVideoMappings
          : JSON.parse(req.body.lessonVideoMappings || "[]");
      } catch (err) {
        lessonVideoMappings = [];
      }

      // Map: 'chIdx-lessonIdx' => video file object (from videoFiles order)
      const videoMap = {};
      lessonVideoMappings.forEach((m, idx) => {
        if (
          m &&
          typeof m.chapterIndex !== "undefined" &&
          typeof m.lessonIndex !== "undefined"
        ) {
          videoMap[`${m.chapterIndex}-${m.lessonIndex}`] = videoFiles[idx];
        }
      });

      for (let chIdx = 0; chIdx < parsedChapters.length; chIdx++) {
        const ch = parsedChapters[chIdx];
        let chapter;

        // Check if chapter exists
        if (ch._id) {
          chapter = await Chapter.findByIdAndUpdate(
            ch._id,
            { title: ch.title, description: ch.description, order: ch.order },
            { new: true, session }
          );
        } else {
          chapter = await new Chapter({
            title: ch.title,
            description: ch.description,
            order: ch.order,
            course: course._id,
          }).save({ session });
          const lessonIds = [];
          for (let lIdx = 0; lIdx < ch.lessons.length; lIdx++) {
            const l = ch.lessons[lIdx];
            let lesson;
            if (l._id) {
              // Preserve existing video/notes unless a new upload is provided
              const existingLesson = await Lesson.findById(l._id);
              let newVideoUrl = existingLesson?.videoUrl || "";
              let newNotesUrl = existingLesson?.notesUrl || null;
              // If mapping exists for this exact chapter/lesson index, use it
              const mapKey = `${chIdx}-${lIdx}`;
              if (l.videoType === "upload" && videoMap[mapKey]) {
                if (process.env.NODE_ENV !== "production") {
                  console.debug(
                    `Mapping uploaded video to existing lesson ${l._id} via mapping ${mapKey}:`,
                    videoMap[mapKey]?.path || videoMap[mapKey]?.secure_url
                  );
                }
                newVideoUrl =
                  videoMap[mapKey]?.path ||
                  videoMap[mapKey]?.secure_url ||
                  newVideoUrl;
              } else if (l.videoType === "upload" && videoFiles[videoIndex]) {
                // Fallback to sequential mapping if no explicit mapping provided
                if (process.env.NODE_ENV !== "production") {
                  console.debug(
                    `Mapping uploaded video to existing lesson ${l._id} sequentially:`,
                    videoFiles[videoIndex]?.path ||
                      videoFiles[videoIndex]?.secure_url
                  );
                }
                newVideoUrl =
                  videoFiles[videoIndex]?.path ||
                  videoFiles[videoIndex]?.secure_url ||
                  newVideoUrl;
                videoIndex++;
              } else if (l.videoType === "youtube" && l.videoUrl) {
                newVideoUrl = l.videoUrl;
              }

              if (l.hasNotes === "true" && pdfFiles[pdfIndex]) {
                newNotesUrl =
                  pdfFiles[pdfIndex]?.path ||
                  pdfFiles[pdfIndex]?.secure_url ||
                  newNotesUrl;
                pdfIndex++;
              } else if (l.notesUrl) {
                newNotesUrl = l.notesUrl;
              }
              // If the existing resource is being replaced by a new URL, delete the old one
              // Instead of deleting immediately inside the transaction, collect URLs to delete after commit
              try {
                if (
                  existingLesson.videoUrl &&
                  newVideoUrl &&
                  existingLesson.videoUrl !== newVideoUrl
                ) {
                  filesToDelete.push({ url: existingLesson.videoUrl, type: "video" });
                }
                if (
                  existingLesson.notesUrl &&
                  newNotesUrl &&
                  existingLesson.notesUrl !== newNotesUrl
                ) {
                  filesToDelete.push({ url: existingLesson.notesUrl, type: "raw" });
                }
              } catch (err) {
                console.error(
                  "Error collecting replaced lesson resource for deletion:",
                  err?.message || err
                );
              }
              lesson = await Lesson.findByIdAndUpdate(
                l._id,
                {
                  title: l.title,
                  description: l.description,
                  videoUrl: newVideoUrl,
                  videoType: l.videoType,
                  notesUrl: newNotesUrl,
                  duration: l.duration,
                  order: l.order,
                  isFreePreview: l.isFreePreview,
                  subtitles: l.subtitles,
                  chapter: chapter._id,
                  course: course._id,
                },
                { new: true, session }
              );
            } else {
              const mapKeyNew = `${chIdx}-${lIdx}`;
              let videoUrl = null;
              if (l.videoType === "upload" && videoMap[mapKeyNew]) {
                videoUrl =
                  videoMap[mapKeyNew]?.path ||
                  videoMap[mapKeyNew]?.secure_url ||
                  null;
              } else if (l.videoType === "upload" && videoFiles[videoIndex]) {
                videoUrl =
                  videoFiles[videoIndex]?.path ||
                  videoFiles[videoIndex]?.secure_url ||
                  null;
                videoIndex++;
              } else if (l.videoType === "youtube" && l.videoUrl) {
                videoUrl = l.videoUrl;
              }

              let notesUrl = null;
              if (l.hasNotes === "true" && pdfFiles[pdfIndex]) {
                notesUrl =
                  pdfFiles[pdfIndex]?.path ||
                  pdfFiles[pdfIndex]?.secure_url ||
                  null;
                pdfIndex++;
              } else if (l.notesUrl) {
                notesUrl = l.notesUrl;
              }

              lesson = await new Lesson({
                ...l,
                chapter: chapter._id,
                course: course._id,
                videoUrl,
                notesUrl,
              }).save({ session });
            }
            lessonIds.push(lesson._id);
          }

          // Update chapter with lessons
          chapter.lessons = lessonIds;
          await chapter.save();
        }

        chapterIds.push(chapter._id);
      }

      // Update course with chapters
      course.chapters = chapterIds;
    }

    // Save the updated course inside the transaction
    await course.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // After successful commit, perform best-effort deletion of old external files
    for (const f of filesToDelete) {
      try {
        await destroyCloudinaryResourceByUrl(f.url, f.type);
      } catch (err) {
        console.error("Failed to destroy Cloudinary resource after commit:", f.url, err?.message || err);
      }
    }

    res.status(200).json({ message: "Course updated successfully", course });
  } catch (error) {
    console.error("Error updating course:", error);
    try {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
    } catch (err) {
      console.error("Error aborting transaction:", err);
    }
    res.status(500).json({ message: "Error updating course", error: error?.message || error });
  }
};

const deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // ✅ Find course by ID
    const course = await Course.findById(courseId);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    // ✅ Ensure only the trainer who created it or an admin can delete
    if (
      req.user.role !== "admin" &&
      course.trainer.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to delete this course",
      });
    }

    // ✅ Delete associated lessons first
    await Lesson.deleteMany({ course: courseId });

    // ✅ Delete the course
    await Course.findByIdAndDelete(courseId);

    return res
      .status(200)
      .json({ success: true, message: "Course deleted successfully" });
  } catch (error) {
    console.error("Error deleting course:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete course",
      error: error.message,
    });
  }
};

const getTrainerCourses = async (req, res) => {
  try {
    const trainerId = req.user.id;

    const trainer = await User.findById(trainerId);
    if (!trainer || trainer.role !== "trainer") {
      return res.status(403).json({
        success: false,
        message: "Only trainers can access their courses",
      });
    }

    const courses = await Course.find({
      trainer: trainerId,
      status: "approved",
    }).populate("lessons");

    return res.status(200).json({
      success: true,
      courses,
    });
  } catch (error) {
    console.error("Error fetching trainer courses:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const enrollCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    // ✅ Find the course by ID
    const course = await Course.findById(courseId);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    // ✅ Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ✅ Check if user is a learner
    if (user.role !== "learner") {
      return res.status(403).json({
        success: false,
        message: "Only learners can enroll in courses",
      });
    }

    // ✅ Check if already enrolled
    if (user.enrolledCourses.includes(courseId)) {
      return res
        .status(400)
        .json({ success: false, message: "Already enrolled in this course" });
    }

    // ✅ Enroll user in the course
    user.enrolledCourses.push(courseId);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Enrolled in course successfully",
      enrolledCourses: user.enrolledCourses,
    });
  } catch (error) {
    console.error("Error enrolling in course:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
const getEnrolledCourses = async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ Get the user with enrolled courses populated
    const user = await User.findById(userId)
      .populate("enrolledCourses", "title description category trainer")
      .select("fullName enrolledCourses");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Enrolled courses fetched successfully",
      enrolledCourses: user.enrolledCourses,
    });
  } catch (error) {
    console.error("Error fetching enrolled courses:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createCourse,
  getAllCourses,
  getCourse,
  deleteCourse,
  getTrainerCourses,
  updateCourse,
  enrollCourse,
  getEnrolledCourses,
  getPendingCourses,
  updateCourseApproval,
};
