const mongoose = require("mongoose");

const richTextSchema = new mongoose.Schema(
  {
    html: {
      type: String,
      default: "",
    },

    delta: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const optionSchema = new mongoose.Schema(
  {
    // A, B, C, D hoặc a, b, c, d
    key: {
      type: String,
      required: true,
      trim: true,
    },

    content: {
      type: richTextSchema,
      required: true,
    },

    // Dùng cho từng mệnh đề của câu Đúng / Sai
    isCorrect: {
      type: Boolean,
      default: null,
    },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },

    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["mcq", "truefalse", "fill"],
      required: true,
    },

    bloomLevel: {
      type: Number,
      enum: [1, 2, 3, 4, 5, 6],
      default: 3,
    },

    content: {
      type: richTextSchema,
      required: true,
    },

    // Văn bản thuần để tìm kiếm, lấy từ editor.getText()
    contentText: {
      type: String,
      trim: true,
      default: "",
    },

    // MCQ: 4 lựa chọn; truefalse: 4 mệnh đề; fill: []
    options: {
      type: [optionSchema],
      default: [],
    },

    // MCQ: key đáp án đúng, ví dụ "A"
    correctAnswer: {
      type: String,
      default: "",
    },

    // Điền đáp số: danh sách đáp án được chấp nhận
    acceptedAnswers: {
      type: [String],
      default: [],
    },

    explanation: {
      type: richTextSchema,
      default: () => ({}),
    },

    published: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    scope: {
      type: String,
      enum: ['system', 'personal'],
      default: 'personal',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Question = mongoose.model(
  "Question",
  questionSchema,
  "questions"
);

module.exports = Question;