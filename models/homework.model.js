const mongoose = require("mongoose");
const Attempt = require("./attempt.model");
const { Schema } = mongoose;
const id = Schema.Types.ObjectId;
const schema = Attempt.schema.clone();
schema.add({
  assignmentId: { type: id, required: true },
  draft: Schema.Types.Mixed,
  savedAt: Date,
  expired: Boolean,
  // Present only for timed homework; immutable after the first start.
  expiresAt: Date,
});
schema.index({ assignmentId: 1, accountId: 1 }, { unique: true });
schema.index({ status: 1, expiresAt: 1 });
const Work = mongoose.model("HomeworkAttempt", schema, "homework_attempts");
const Assignment = mongoose.model(
  "Assignment",
  new Schema(
    {
      groupId: { type: id, index: true },
      title: String,
      due: { type: Date, index: true },
      durationMinutes: {
        type: Number, min: 1,
        validate: { validator: Number.isSafeInteger, message: "Thời lượng phải là số nguyên dương." },
      },
      recipients: [id],
      revoked: [id],
      examId: id,
      subjectId: id,
      questions: [Attempt.schema.path("questions").schema],
      maxScore: { type: Number, default: 10 },
    },
    { timestamps: true },
  ),
);
module.exports = { Work, Assignment };
