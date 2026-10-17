'use strict';

(() => {
  const get = id => document.getElementById(id);
  const root = document.querySelector('.exam-taking-main');
  if (!root) return;

  const examId = root.dataset.examId;
  const duration = Number(root.dataset.duration);

  const list = get('etQuestionList');
  const cards = [...list.querySelectorAll('.et-question-card')];

  const nav = get('etNavGrid');
  const navButtons = [...nav.querySelectorAll('.et-nav-btn')];

  const startButton = get('etBtnStart');
  const submitButton = get('etBtnSubmit');
  const modal = get('etModalOverlay');
  const resultModal = get('etResultOverlay');
  const confirmButton = get('etModalConfirm');
  const cancelButton = get('etModalCancel');
  const status = get('etSaveStatus');

  let started = false;
  let expired = false;
  let submitting = false;
  let submitted = false;

  let deadline = 0;
  let timer = null;
  let submissionPayload = null;

  modal.hidden = true;
  resultModal.hidden = true;

  function setError(message = '') {
    const element = get('etError');
    element.textContent = message;
    element.hidden = !message;
  }

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function readAnswer(card) {
    if (card.dataset.type === 'mcq') {
      return card.querySelector('input[type="radio"]:checked')?.value
        ?? null;
    }

    if (card.dataset.type === 'fill') {
      return card.querySelector('.et-fill-input').value.trim();
    }

    if (card.dataset.type === 'truefalse') {
      const answer = {};

      card.querySelectorAll('.et-tf-row').forEach(row => {
        const checked = row.querySelector('input[type="radio"]:checked');

        if (checked) {
          answer[row.dataset.optionKey] = checked.value === 'true';
        }
      });

      return answer;
    }

    return null;
  }

  function collectAnswers() {
    return cards.map(card => ({
      questionId: card.dataset.qid,
      answer: readAnswer(card),
    }));
  }

  function isAnswered(card) {
    const answer = readAnswer(card);

    if (card.dataset.type === 'truefalse') {
      const rows = [...card.querySelectorAll('.et-tf-row')];

      return rows.length > 0 && rows.every(row =>
        typeof answer[row.dataset.optionKey] === 'boolean'
      );
    }

    return answer !== null && answer !== '';
  }

  function updateProgress() {
    let answered = 0;

    cards.forEach(card => {
      const complete = isAnswered(card);
      if (complete) answered++;

      navButtons.find(button =>
        button.dataset.qid === card.dataset.qid
      )?.classList.toggle('is-answered', complete);

      card.querySelectorAll('.et-option-label').forEach(label => {
        label.classList.toggle(
          'is-selected',
          Boolean(label.querySelector('input')?.checked)
        );
      });
    });

    const percent = cards.length
      ? Math.round(answered / cards.length * 100)
      : 0;

    get('etProgressCount').textContent =
      `Đã trả lời: ${answered}/${cards.length}`;

    get('etProgressFill').style.width = `${percent}%`;
    get('etProgressPct').textContent = `${percent}%`;
    get('etProgressBar').setAttribute('aria-valuenow', String(percent));

    return answered;
  }

  function setInputsEnabled(enabled) {
    list.querySelectorAll('input, .et-q-flag-btn').forEach(element => {
      element.disabled = !enabled;
    });

    list.querySelectorAll('.et-option-label').forEach(label => {
      label.classList.toggle('et-option-label--disabled', !enabled);
      label.classList.toggle('is-disabled', !enabled);
    });
  }

  function setCurrentQuestion(id) {
    navButtons.forEach(button => {
      const current = button.dataset.qid === id;
      button.classList.toggle('is-current', current);

      if (current) {
        button.setAttribute('aria-current', 'true');
      } else {
        button.removeAttribute('aria-current');
      }
    });
  }

  function formatTime(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const rest = String(seconds % 60).padStart(2, '0');

    return `${minutes}:${rest}`;
  }

  function startTimer() {
    clearInterval(timer);

    function tick() {
      if (submitted) return;

      const remaining = Math.max(
        0,
        Math.ceil((deadline - performance.now()) / 1000)
      );

      const digits = get('etTimerDigits');

      digits.textContent = formatTime(remaining);
      digits.classList.toggle(
        'is-warning',
        remaining <= 300 && remaining > 60
      );
      digits.classList.toggle('is-danger', remaining <= 60);

      if (remaining === 0) {
        expired = true;
        clearInterval(timer);

        setInputsEnabled(false);
        modal.hidden = true;

        get('etTimerHint').textContent = 'Đã hết giờ, đang nộp bài...';

        submitExam();
      }
    }

    timer = window.setInterval(tick, 1000);
    tick();
  }

  function startExam() {
    if (started || !cards.length) return;

    if (!Number.isFinite(duration) || duration <= 0) {
      setError('Thời gian làm bài không hợp lệ.');
      return;
    }

    setError();

    started = true;
    deadline = performance.now() + duration * 60 * 1000;

    startButton.disabled = true;
    startButton.textContent = 'Đang làm bài';
    submitButton.disabled = false;

    get('etTimerHint').textContent = 'Thời gian còn lại';

    setStatus('Đáp án chưa được lưu. Không tải lại hoặc đóng trang.');
    setInputsEnabled(true);
    startTimer();
  }

  async function requestSubmit(payload) {
    let response;

    try {
      response = await fetch('/exams/submit', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error(
        'Không kết nối được server. Giữ trang mở để thử nộp lại.'
      );
    }

    if (response.redirected || response.status === 401) {
      throw new Error(
        'Phiên đăng nhập đã hết. Giữ trang này và đăng nhập lại ở tab khác.'
      );
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      throw new Error(`Server không trả JSON (HTTP ${response.status}).`);
    }

    const data = await response.json();

    if (!response.ok || data.code !== 'success') {
      throw new Error(data.message || 'Nộp bài thất bại!');
    }

    return data;
  }

  function showResult(data) {
    const viewAnswersButton = get('etBtnViewAnswers');

    if (viewAnswersButton && data.attemptId) {
      viewAnswersButton.href = `/exams/${data.attemptId}/result`;
      viewAnswersButton.hidden = false;
    }
    if (
      typeof data.redirectUrl === 'string' &&
      data.redirectUrl.startsWith('/') &&
      !data.redirectUrl.startsWith('//')
    ) {
      window.location.replace(data.redirectUrl);
      return;
    }

    get('etResultSubtitle').textContent =
      data.message || 'Server đã ghi nhận bài làm.';

    get('etResultScore').textContent =
      data.score !== undefined && data.score !== null
        ? `${data.score}/${data.maxScore ?? 10}`
        : '—';

    get('etResultAnswered').textContent =
      `${updateProgress()}/${cards.length}`;

    resultModal.hidden = false;
    resultModal.querySelector('a, button')?.focus();
  }

  async function submitExam() {
    if (!started || submitted || submitting) return;

    if (!submissionPayload) {
      submissionPayload = {
        examId,
        answers: collectAnswers(),
      };
    }

    submitting = true;
    modal.hidden = true;

    submitButton.disabled = true;
    submitButton.textContent = 'Đang nộp...';
    confirmButton.disabled = true;

    setInputsEnabled(false);
    setError();
    setStatus('Đang gửi bài làm...');

    try {
      const data = await requestSubmit(submissionPayload);

      submitted = true;
      clearInterval(timer);

      startButton.textContent = 'Đã nộp bài';
      submitButton.textContent = 'Đã nộp bài';
      get('etTimerHint').textContent = 'Bài làm đã được ghi nhận';

      setStatus('Đã nộp bài thành công.');
      showResult(data);
    } catch (error) {
      setError(error.message);
      setStatus('Chưa nộp thành công. Giữ trang mở và thử lại.');

      submitButton.disabled = false;
      submitButton.textContent = 'Thử nộp lại';
    } finally {
      submitting = false;
      confirmButton.disabled = false;
    }
  }

  function closeConfirm() {
    modal.hidden = true;

    if (!submitButton.disabled) {
      submitButton.focus();
    }
  }

  startButton.addEventListener('click', startExam);

  submitButton.addEventListener('click', () => {
    if (!started || submitted || submitting) return;

    if (expired || submissionPayload) {
      submitExam();
      return;
    }

    const answered = updateProgress();

    get('etModalAnswered').textContent = answered;
    get('etModalWarning').textContent = answered < cards.length
      ? `Còn ${cards.length - answered} câu chưa trả lời đầy đủ.`
      : '';

    modal.hidden = false;
    cancelButton.focus();
  });

  cancelButton.addEventListener('click', closeConfirm);
  confirmButton.addEventListener('click', submitExam);

  modal.addEventListener('click', event => {
    if (event.target === modal) closeConfirm();
  });

  list.addEventListener('input', event => {
    if (
      event.target.matches('input') &&
      started &&
      !expired &&
      !submitted &&
      !submissionPayload
    ) {
      updateProgress();
    }
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('.et-q-flag-btn');

    if (
      !button ||
      button.disabled ||
      !started ||
      expired ||
      submitted ||
      submissionPayload
    ) return;

    const card = button.closest('.et-question-card');
    const flagged = button.getAttribute('aria-pressed') !== 'true';

    button.setAttribute('aria-pressed', String(flagged));
    button.classList.toggle('is-flagged', flagged);

    navButtons.find(item =>
      item.dataset.qid === card.dataset.qid
    )?.classList.toggle('is-flagged', flagged);
  });

  nav.addEventListener('click', event => {
    const button = event.target.closest('.et-nav-btn');
    if (!button) return;

    const card = cards.find(item =>
      item.dataset.qid === button.dataset.qid
    );

    if (!card) return;

    card.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    setCurrentQuestion(card.dataset.qid);
  });

  get('etBtnRetry').addEventListener('click', () => {
    window.location.reload();
  });

  window.addEventListener('offline', () => {
    if (started && !submitted) {
      setError('Mất mạng. Không tải lại hoặc đóng trang.');
    }
  });

  window.addEventListener('online', () => {
    if (!started || submitted || submitting) return;

    if (expired || submissionPayload) {
      submitExam();
    } else {
      setError();
    }
  });

  window.addEventListener('beforeunload', event => {
    if (!started || submitted) return;

    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('keydown', event => {
    const activeModal = !resultModal.hidden
      ? resultModal
      : !modal.hidden
        ? modal
        : null;

    if (!activeModal) return;

    if (event.key === 'Escape' && activeModal === modal) {
      closeConfirm();
      return;
    }

    if (event.key !== 'Tab') return;

    const controls = [...activeModal.querySelectorAll(
      'button:not(:disabled), a[href]'
    )];

    const first = controls[0];
    const last = controls[controls.length - 1];

    if (!first) return;

    if (!activeModal.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  list.querySelectorAll('.ql-formula[data-value]').forEach(element => {
    const latex = element.dataset.value || '';
    element.replaceChildren();

    if (!window.katex?.render) {
      element.textContent = latex;
      return;
    }

    try {
      window.katex.render(latex, element, {
        throwOnError: false,
        trust: false,
      });
    } catch {
      element.textContent = latex;
    }
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setCurrentQuestion(entry.target.dataset.qid);
        }
      });
    }, {
      rootMargin: '-30% 0px -50% 0px',
    });

    cards.forEach(card => observer.observe(card));
  }

  list.querySelectorAll('input[type="radio"]').forEach(input => {
    input.checked = false;
  });

  list.querySelectorAll('.et-fill-input').forEach(input => {
    input.value = '';
  });

  startButton.textContent = 'Bắt đầu làm bài';
  startButton.disabled = !cards.length;
  submitButton.disabled = true;

  setStatus('Chưa bắt đầu làm bài.');
  setInputsEnabled(false);
  updateProgress();

  if (cards[0]) setCurrentQuestion(cards[0].dataset.qid);
})();