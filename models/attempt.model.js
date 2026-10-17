const mongoose = require("mongoose");

const { Schema } = mongoose;

const richTextSchema = new Schema(
  {
    html: {
      type: String,
      default: "",
    },
    delta: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const optionSnapshotSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
    },

    content: {
      type: richTextSchema,
      required: true,
    },

    // Đáp án từng mệnh đề Đúng/Sai.
    isCorrect: {
      type: Boolean,
      default: null,
    },
  },
  { _id: false }
);

// Bản sao câu hỏi tại thời điểm bắt đầu làm bài.
const questionSnapshotSchema = new Schema(
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

    content: {
      type: richTextSchema,
      required: true,
    },

    contentText: {
      type: String,
      default: "",
    },

    options: {
      type: [optionSnapshotSchema],
      default: [],
    },

    correctAnswer: {
      type: String,
      default: "",
    },

    acceptedAnswers: {
      type: [String],
      default: [],
    },

    explanation: {
      type: richTextSchema,
      default: () => ({}),
    },
  },
  { _id: false }
);

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

    score: {
      type: Number,
      required: true,
      min: 0,
    },

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

    // Giữ tên đề tại thời điểm bắt đầu.
    examTitle: {
      type: String,
      required: true,
      trim: true,
    },

    // Thời lượng quy định, đơn vị phút.
    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: ["in_progress", "submitted"],
      default: "in_progress",
      required: true,
    },

    // Giữ nguyên thứ tự câu hỏi trong đề lúc bắt đầu.
    questions: {
      type: [questionSnapshotSchema],
      default: [],
      validate: {
        validator: questions => questions.length > 0,
        message: "Bài làm phải có ít nhất một câu hỏi.",
      },
    },

    answers: {
      type: [answerSchema],
      default: [],
    },

    totalQuestions: {
      type: Number,
      required: true,
      min: 1,
    },

    // Chưa nộp bài thì chưa có điểm.
    score: {
      type: Number,
      default: null,
      min: 0,
    },

    maxScore: {
      type: Number,
      default: 10,
      min: 0,
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },

    submittedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Attempt", attemptSchema, "attempts");