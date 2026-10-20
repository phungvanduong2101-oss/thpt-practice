'use strict';

(() => {
  const get = id => document.getElementById(id);
  const form = get('questionForm');
  if (!form) return;

  const KEYS = ['A', 'B', 'C', 'D'];

  const TYPES = {
    mcq: 'Trắc nghiệm ABCD',
    truefalse: 'Đúng / Sai',
    fill: 'Điền đáp số',
  };

  const BLOOM = {
    1: 'Nhớ',
    2: 'Hiểu',
    3: 'Vận dụng',
    4: 'Phân tích',
    5: 'Đánh giá',
    6: 'Sáng tạo',
  };

  let subjects = [];
  let topics = [];
  let questions = [];

  let editingId = null;
  let deletingId = null;
  let busy = false;
  let currentModal = null;
  let previousFocus = null;

  const editors = new Map();



  function plainText(html) {
    const element = document.createElement('div');
    element.innerHTML = html || '';
    return element.textContent || '';
  }


  function setError(message = '') {
    get('formError').textContent = message;
    get('formError').hidden = !message;
  }


  // Quill / chế độ dự phòng
  function createEditor(id, small = false) {
    const target = get(id);

    if (typeof window.Quill === 'function' && window.katex) {
      const instance = new window.Quill(target, {
        theme: 'snow',
        placeholder: 'Nhập nội dung...',
        modules: {
          toolbar: small
            ? [['bold', 'italic'], ['formula'], ['clean']]
            : [
              [{ header: [false, 2, 3] }],
              ['bold', 'italic', 'underline'],
              [{ list: 'ordered' }, { list: 'bullet' }],
              ['formula'],
              ['clean'],
            ],
        },
      });

      editors.set(id, { instance, quill: true });
      return;
    }

    const fallback = document.createElement('div');
    fallback.className = 'fallback-editor';
    fallback.contentEditable = 'true';
    fallback.setAttribute('role', 'textbox');
    fallback.setAttribute('aria-multiline', 'true');

    target.appendChild(fallback);
    editors.set(id, { instance: fallback, quill: false });

    get('editorOfflineNote').hidden = false;
  }

  function readEditor(id) {
    const editor = editors.get(id);

    if (editor.quill) {
      const instance = editor.instance;
      const hasFormula = instance.root.querySelector('.ql-formula');

      return {
        html: instance.root.innerHTML,
        delta: instance.getContents(),
        text: instance.getText().trim() || (hasFormula ? '[Công thức]' : ''),
      };
    }

    const text = editor.instance.innerText.trim();

    return {
      html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
      delta: null,
      text,
    };
  }

  function writeEditor(id, content = {}) {
    const editor = editors.get(id);

    if (!editor.quill) {
      editor.instance.textContent = plainText(content.html);
      return;
    }

    const delta = content.delta;
    const ops = Array.isArray(delta) ? delta : delta?.ops;

    if (Array.isArray(ops) && ops.length) {
      editor.instance.setContents({ ops }, 'silent');
    } else {
      editor.instance.setText('', 'silent');

      if (content.html) {
        editor.instance.clipboard.dangerouslyPasteHTML(
          content.html,
          'silent'
        );
      }
    }
  }

  function buildOptions() {
    ['mcq', 'tf'].forEach(prefix => {
      const parent = get(prefix === 'mcq' ? 'mcqOptions' : 'tfOptions');

      parent.innerHTML = KEYS.map(key => {
        const control = prefix === 'mcq'
          ? `
            <label class="option-choice">
              <input type="radio" name="correctMcq" value="${key}"
                ${key === 'A' ? 'checked' : ''}>
              Đáp án đúng
            </label>
          `
          : `
            <div class="option-choice option-choice--tf">
              <label>
                <input type="radio" name="tf-${key}" value="true" checked>
                Đúng
              </label>
              <label>
                <input type="radio" name="tf-${key}" value="false">
                Sai
              </label>
            </div>
          `;

        return `
          <div class="option-editor-row">
            <span class="option-label">
              ${prefix === 'tf' ? key.toLowerCase() : key}
            </span>
            <div class="option-editor-shell">
              <div id="${prefix}Opt${key}"
                class="rich-editor rich-editor--option"></div>
            </div>
            ${control}
          </div>
        `;
      }).join('');
    });

    createEditor('questionContent');
    createEditor('questionExplanation');

    for (const prefix of ['mcq', 'tf']) {
      for (const key of KEYS) {
        createEditor(`${prefix}Opt${key}`, true);
      }
    }
  }

  // Các lựa chọn môn học / chuyên đề


  function fillQuestionTopics(subjectId, selectedId = '') {
    const available = topics.filter(topic =>
      idOf(topic.subjectId) === subjectId
    );

    get('questionTopic').innerHTML =
      '<option value="">Chọn chuyên đề</option>' +
      available.map(topic => `
        <option value="${escapeHtml(topic._id)}">
          ${escapeHtml(topic.name)}${topic.active ? '' : ' (Đã ẩn)'}
        </option>
      `).join('');

    get('questionTopic').disabled = !subjectId;
    get('questionTopic').value = selectedId;
  }



  function updateTypeUI() {
    const type = get('questionType').value;

    get('mcqAnswers').hidden = type !== 'mcq';
    get('tfAnswers').hidden = type !== 'truefalse';
    get('fillAnswers').hidden = type !== 'fill';
  }

  function clearForm(focus = false) {
    editingId = null;
    form.reset();
    setError();

    for (const id of editors.keys()) {
      writeEditor(id);
    }

    fillQuestionTopics('');
    updateTypeUI();

    get('formTitle').textContent = 'Tạo câu hỏi mới';
    get('saveButtonText').textContent = 'Lưu câu hỏi';

    if (focus) {
      get('editorPanel').scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      get('questionSubject').focus();
    }
  }

  // Payload khớp question.model.js
  function collectQuestion() {
    const subjectId = get('questionSubject').value;
    const topicId = get('questionTopic').value;
    const type = get('questionType').value;

    const subject = subjects.find(item => idOf(item) === subjectId);
    const topic = topics.find(item => idOf(item) === topicId);
    const original = questions.find(item => idOf(item) === editingId);

    if (!subject) {
      throw new Error('Vui lòng chọn môn học.');
    }

    if (!subject.active && subjectId !== idOf(original?.subjectId)) {
      throw new Error('Môn học đã bị ẩn.');
    }

    if (!topic || idOf(topic.subjectId) !== subjectId) {
      throw new Error('Chọn chuyên đề thuộc đúng môn học.');
    }

    if (!topic.active && topicId !== idOf(original?.topicId)) {
      throw new Error('Chuyên đề đã bị ẩn.');
    }

    const content = readEditor('questionContent');

    if (!content.text) {
      throw new Error('Vui lòng nhập nội dung câu hỏi.');
    }

    const options = [];
    let correctAnswer = '';
    let acceptedAnswers = [];

    if (type === 'mcq' || type === 'truefalse') {
      const prefix = type === 'mcq' ? 'mcq' : 'tf';

      for (const key of KEYS) {
        const option = readEditor(`${prefix}Opt${key}`);

        if (!option.text) {
          throw new Error(`Chưa nhập nội dung phương án ${key}.`);
        }

        options.push({
          key,
          content: {
            html: option.html,
            delta: option.delta,
          },
          isCorrect: type === 'truefalse'
            ? form.querySelector(
              `input[name="tf-${key}"]:checked`
            )?.value === 'true'
            : null,
        });
      }

      if (type === 'mcq') {
        correctAnswer = form.querySelector(
          'input[name="correctMcq"]:checked'
        )?.value;

        if (!correctAnswer) {
          throw new Error('Chọn một đáp án đúng.');
        }
      }
    } else if (type === 'fill') {
      acceptedAnswers = get('fillCorrectAnswer').value
        .split('|')
        .map(value => value.trim())
        .filter(Boolean);

      if (!acceptedAnswers.length) {
        throw new Error('Vui lòng nhập đáp án đúng.');
      }
    } else {
      throw new Error('Loại câu hỏi không hợp lệ.');
    }

    const explanation = readEditor('questionExplanation');

    return {
      subjectId,
      topicId,
      type,
      bloomLevel: Number(get('questionBloom').value),
      content: {
        html: content.html,
        delta: content.delta,
      },
      contentText: content.text,
      options,
      correctAnswer,
      acceptedAnswers,
      explanation: {
        html: explanation.text ? explanation.html : '',
        delta: explanation.text ? explanation.delta : null,
      },
      published: get('questionStatus').value === 'published',
    };
  }

  function startEdit(question) {
    clearForm();
    editingId = idOf(question);

    get('questionSubject').value = idOf(question.subjectId);
    fillQuestionTopics(
      idOf(question.subjectId),
      idOf(question.topicId)
    );

    get('questionType').value = question.type;
    get('questionBloom').value = String(question.bloomLevel);
    get('questionStatus').value =
      question.published ? 'published' : 'draft';

    writeEditor('questionContent', question.content);
    writeEditor('questionExplanation', question.explanation);

    if (question.type === 'mcq' || question.type === 'truefalse') {
      const prefix = question.type === 'mcq' ? 'mcq' : 'tf';

      for (const key of KEYS) {
        const option = question.options.find(item => item.key === key);
        writeEditor(`${prefix}Opt${key}`, option?.content);

        const selector = question.type === 'mcq'
          ? `input[name="correctMcq"][value="${key}"]`
          : `input[name="tf-${key}"][value="${option?.isCorrect === true}"]`;

        const radio = form.querySelector(selector);

        if (radio && (
          question.type === 'truefalse' ||
          question.correctAnswer === key
        )) {
          radio.checked = true;
        }
      }
    } else {
      get('fillCorrectAnswer').value =
        question.acceptedAnswers.join(' | ');
    }

    updateTypeUI();

    get('formTitle').textContent = 'Chỉnh sửa câu hỏi';
    get('saveButtonText').textContent = 'Cập nhật câu hỏi';

    get('editorPanel').scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  // Search / filter / phân trang



  // Xem trước
  function openModal(modal) {
    previousFocus = document.activeElement;
    currentModal = modal;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    modal.querySelector('button')?.focus();
  }

  function closeModal() {
    if (busy || !currentModal) return;

    currentModal.hidden = true;
    currentModal = null;
    deletingId = null;
    document.body.style.overflow = '';

    previousFocus?.focus();
    previousFocus = null;
  }

  function previewQuestion(question) {
    let answers = '';

    if (question.type === 'fill') {
      answers = `
        <div class="preview-answer preview-correct">
          <b>Đáp án chấp nhận</b>
          ${escapeHtml(question.acceptedAnswers.join(' | '))}
        </div>
      `;
    } else {
      answers = question.options.map(option => {
        const correct = question.type === 'mcq'
          ? question.correctAnswer === option.key
          : option.isCorrect;

        const label = question.type === 'truefalse'
          ? `${option.key.toLowerCase()}. (${correct ? 'Đúng' : 'Sai'})`
          : `${option.key}. ${correct ? '✓ Đáp án đúng' : ''}`;

        return `
          <div class="preview-answer ${correct ? 'preview-correct' : ''}">
            <b>${escapeHtml(label)}</b>
            <div class="preview-html">${option.content.html}</div>
          </div>
        `;
      }).join('');
    }

    get('previewBody').innerHTML = `
      <div class="preview-content preview-html">
        ${question.content.html}
      </div>
      <div class="preview-label">Phương án trả lời</div>
      <div class="preview-answers">${answers}</div>
      ${question.explanation?.html ? `
        <div class="preview-label">Lời giải</div>
        <div class="preview-solution preview-html">
          ${question.explanation.html}
        </div>
      ` : ''}
    `;

    renderFormulas(get('previewBody'));

    openModal(get('previewModal'));
  }

  // Events
  get('questionSubject').addEventListener('change', event => {
    fillQuestionTopics(event.target.value);
  });

  get('questionType').addEventListener('change', updateTypeUI);

  for (const id of ['newQuestionButton', 'resetButton']) {
    get(id).addEventListener('click', () => {
      if (!busy) clearForm(true);
    });
  }

  get('previewButton').addEventListener('click', () => {
    try {
      setError();
      previewQuestion(collectQuestion());
    } catch (error) {
      setError(error.message);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;

    try {
      setError();
      const payload = collectQuestion();
      const id = editingId;

      busy = true;
      get('saveButton').disabled = true;

      const data = await request(
        id
          ? `/admin/questions/${encodeURIComponent(id)}`
          : '/admin/questions/create',
        id ? 'PATCH' : 'POST',
        payload
      );

      if (!data) return;
      sessionStorage.setItem('questionFormSelections', JSON.stringify({
        subjectId: get('questionSubject').value,
        topicId: get('questionTopic').value,
        type: get('questionType').value,
        bloomLevel: get('questionBloom').value,
        status: get('questionStatus').value,
      }));
      alert(data.message);
      window.location.reload();
    } catch (error) {
      setError(error.message);
    } finally {
      busy = false;
      get('saveButton').disabled = false;
    }
  });


  get('questionList').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy) return;

    const row = button.closest('[data-id]');
    const question = questions.find(item => idOf(item) === row?.dataset.id);
    if (!question) return;

    if (button.dataset.action === 'edit') {
      startEdit(question);
    } else if (button.dataset.action === 'preview') {
      previewQuestion(question);
    } else if (button.dataset.action === 'delete') {
      deletingId = idOf(question);

      get('deleteDescription').textContent =
        `Bạn có chắc muốn xóa câu hỏi “${(
          question.contentText || plainText(question.content.html)
        ).slice(0, 100)}”?`;

      openModal(get('deleteModal'));
    }
  });

  get('confirmDelete').addEventListener('click', async () => {
    if (!deletingId || busy) return;

    try {
      busy = true;
      get('confirmDelete').disabled = true;
      get('cancelDelete').disabled = true;

      const data = await request(
        `/admin/questions/${encodeURIComponent(deletingId)}`,
        'DELETE'
      );

      if (!data) return;

      alert(data.message);
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      busy = false;
      get('confirmDelete').disabled = false;
      get('cancelDelete').disabled = false;
      closeModal();
    }
  });

  for (const id of ['closePreview', 'donePreview', 'cancelDelete']) {
    get(id).addEventListener('click', closeModal);
  }

  for (const id of ['previewModal', 'deleteModal']) {
    get(id).addEventListener('click', event => {
      if (event.target === get(id)) closeModal();
    });
  }

  document.addEventListener('keydown', event => {
    if (!currentModal) return;

    if (event.key === 'Escape') closeModal();

    if (event.key === 'Tab') {
      const buttons = [...currentModal.querySelectorAll('button')]
        .filter(button => !button.disabled);

      if (!buttons.length) {
        event.preventDefault();
        return;
      }

      const first = buttons[0];
      const last = buttons[buttons.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  function boot() {
    get('saveButton').disabled = true;

    try {
      const element = get('questionPageData');

      if (!element) {
        throw new Error(
          'Thiếu #questionPageData. Kiểm tra lại questions.pug.'
        );
      }

      const data = JSON.parse(element.dataset.bootstrap);

      if (
        !Array.isArray(data.subjects) ||
        !Array.isArray(data.topics) ||
        !Array.isArray(data.questions)
      ) {
        throw new Error('Dữ liệu trang câu hỏi không hợp lệ.');
      }

      subjects = data.subjects;
      topics = data.topics;
      questions = data.questions;

      buildOptions();
      clearForm();

      const saved = sessionStorage.getItem('questionFormSelections');

      if (saved) {
        const selections = JSON.parse(saved);

        get('questionSubject').value = selections.subjectId;

        fillQuestionTopics(
          selections.subjectId,
          selections.topicId
        );

        get('questionType').value = selections.type;
        get('questionBloom').value = selections.bloomLevel;
        get('questionStatus').value = selections.status;

        updateTypeUI();

        sessionStorage.removeItem('questionFormSelections');
      }

      get('saveButton').disabled = false;
    } catch (error) {
      console.error(error);
      setError(error.message);
    }
  }

  boot();
})();

const link = document.querySelector('#pagination a');
console.log(link?.outerHTML);
console.log(link && getComputedStyle(link).pointerEvents);
console.log(document.getElementById('pagination')?.outerHTML);


// readEditor() → collectQuestion() → request() 
console.table(
  [...document.querySelectorAll('#pagination a')].map(a => ({
    text: a.textContent.trim(),
    href: a.getAttribute('href'),
    display: getComputedStyle(a).display,
    visibility: getComputedStyle(a).visibility,
    width: a.getBoundingClientRect().width,
  }))
);