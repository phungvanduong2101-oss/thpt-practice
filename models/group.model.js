const mongoose = require("mongoose");

const { Schema } = mongoose;

const groupSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    memberIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Account",
        },
      ],
      default: [],
    },

    pendingMemberIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Account",
        },
      ],
      default: [],
    },

    // Có nhận thêm yêu cầu tham gia hay không.
    acceptingMembers: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Group", groupSchema, "groups");