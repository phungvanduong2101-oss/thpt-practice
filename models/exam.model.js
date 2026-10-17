const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },

    // Thời gian làm bài, tính bằng phút
    duration: {
      type: Number,
      required: true,
      min: 1,
      max: 300,
      validate: {
        validator: Number.isInteger,
        message: "Thời gian làm bài phải là số nguyên!",
      },
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },

    questionIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Question",
        },
      ],
      default: [],
      validate: {
        validator: ids =>
          new Set(ids.map(id => id.toString())).size === ids.length,
        message: "Không được thêm trùng câu hỏi trong một đề!",
      },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    // null: đề hệ thống; có ID: đề của nhóm
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Exam = mongoose.model("Exam", examSchema, "exams");

module.exports = Exam;