const Account = require("../../models/account.model"); 
const Subject = require("../../models/subject.model"); 
const Topic = require("../../models/topic.model"); 
const Question = require("../../models/question.model"); 
const Exam = require("../../models/exam.model"); 
  
module.exports.dashboard = async (req, res) => {  
    try { 
    const totalAccounts = await Account.countDocuments().exec(); 
    const totalSubjects = await Subject.countDocuments().exec(); 
    const totalQuestions = await Question.countDocuments({ scope: 'system' }).exec(); 
    const totalExams = await Exam.countDocuments({ scope: 'system' }).exec(); 

    const newestQuestion = await Question.find({ scope: 'system' }).sort({ createdAt: -1 }).limit(3).exec(); 
    const newestExam = await Exam.find({ scope: 'system' }).sort({ createdAt: -1 }).limit(3).populate('subjectId', 'name').exec();
    res.render("admin/dashboard", { 
        title: "Dashboard", 
        activePage: "dashboard", 
        totalAccounts, 
        totalSubjects, 
        totalQuestions, 
        totalExams, 
        newestQuestion, 
        newestExam
    }); 
  } catch(error) { 
    res.json({ code: "error", message: 'Có lỗi xảy ra!' });
    console.log(error);
  }
}