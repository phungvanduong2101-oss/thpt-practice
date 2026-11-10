const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  reporterId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  targetType: { type: String, enum: ["group", "exam", "post", "post_comment", "exam_comment"], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  scope: { type: String, enum: ["system", "group"], required: true },
  groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },
  recipientId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  reason: { type: String, enum: ["spam", "inappropriate", "incorrect", "copyright", "other"], required: true },
  description: { type: String, trim: true, maxlength: 2000, default: "" },
  snapshot: {
    title: { type: String, maxlength: 200 },
    content: { type: String, maxlength: 2000 },
    url: String,
    groupName: String,
  },
  status: { type: String, enum: ["pending", "reviewing", "resolved", "rejected"], default: "pending" },
  resolution: { type: String, maxlength: 2000, default: "" },
  handledBy: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  handledAt: { type: Date, default: null },
  // Unset on closure, allowing a later report while preventing concurrent duplicates.
  openKey: { type: String },
}, { timestamps: true });
schema.index({ openKey: 1 }, { unique: true, sparse: true });
schema.index({ scope: 1, groupId: 1, status: 1, createdAt: -1 });
schema.index({ reporterId: 1, createdAt: -1 });
module.exports = mongoose.model("Report", schema, "reports");
