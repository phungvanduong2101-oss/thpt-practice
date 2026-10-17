const mongoose = require("mongoose");

const { Schema } = mongoose;

// Đáp án học sinh và kết quả chấm từng câu.
const answerSchema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },

    type: {
      type: String,
      enum: ["mcq", "truefalse", "fill"],
      required: true,
    },

    // mcq: "B"
    // truefalse: { A: true, B: false, C: true, D: false }
    // fill: "2.5"
    answer: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // Số điểm đạt được của câu này.
    score: {
      type: Number,
      required: true,
      min: 0,
    },

    // Số điểm tối đa của câu này.
    maxScore: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const attemptSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    examId: {
      type: Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },

    // Giữ tên đề tại thời điểm nộp.
    examTitle: {
      type: String,
      required: true,
      trim: true,
    },

    // Thời lượng quy định của đề, đơn vị phút.
    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    answers: {
      type: [answerSchema],
      default: [],
    },

    // Tổng số câu của đề, kể cả câu bỏ trống.
    totalQuestions: {
      type: Number,
      required: true,
      min: 1,
    },

    // Tổng điểm sau khi server chấm.
    score: {
      type: Number,
      required: true,
      min: 0,
    },

    maxScore: {
      type: Number,
      default: 10,
      min: 0,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attempt", attemptSchema, "attempts");