const mongoose = require("mongoose");

const latexSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Mã LaTeX thuần, ví dụ: \frac{a}{b}
    code: {
      type: String,
      required: true,
    },

    // HTML được tạo bởi QuillJS + KaTeX
    html: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Latex = mongoose.model("Latex", latexSchema, "latexes");

module.exports = Latex;