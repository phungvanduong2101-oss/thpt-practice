module.exports = function gradeAttempt(attempt, answerMap) {
  const questions = attempt.questions;
  const maxScore = attempt.maxScore;
  const questionMaxScore = maxScore / questions.length;

  let totalScore = 0;
  const gradedAnswers = [];

  for (const question of questions) {
    let answer = answerMap.get(String(question.questionId));

    if (answer === undefined || answer === null) {
      answer = null;
    }

    let ratio = 0;

    if (question.type === "mcq") {
      if (
        typeof answer === "string" &&
        answer !== "" &&
        answer === question.correctAnswer
      ) {
        ratio = 1;
      }
    }

    if (question.type === "truefalse") {
      if (
        answer !== null &&
        typeof answer === "object" &&
        !Array.isArray(answer)
      ) {
        let correctCount = 0;

        for (const option of question.options) {
          if (
            typeof answer[option.key] === "boolean" &&
            answer[option.key] === option.isCorrect
          ) {
            correctCount++;
          }
        }

        if (question.options.length > 0) {
          ratio = correctCount / question.options.length;
        }
      }
    }

    if (question.type === "fill") {
      const accepted = [
        question.correctAnswer,
        ...(question.acceptedAnswers || []),
      ];

      if (
        typeof answer === "string" &&
        answer !== "" &&
        accepted.includes(answer)
      ) {
        ratio = 1;
      }
    }

    const score = ratio * questionMaxScore;

    totalScore += score;

    gradedAnswers.push({
      questionId: question.questionId,
      type: question.type,
      answer,
      score,
      maxScore: questionMaxScore,
    });
  }

  return { gradedAnswers, totalScore };
};
