const createLesson = (req, res, next) => {
  // console.log("Create Lesson:", JSON.stringify(req.body, null, 2));
  res.status(501).json({ message: "Not implemented" });
};

const getLessonsByCourse = (req, res, next) => {
  res.status(501).json({ message: "Not implemented" });
};

const updateLesson = (req, res, next) => {
  res.status(501).json({ message: "Not implemented" });
};

const deleteLesson = (req, res, next) => {
  res.status(501).json({ message: "Not implemented" });
};

module.exports = {
  createLesson,
  getLessonsByCourse,
  updateLesson,
  deleteLesson,
};
