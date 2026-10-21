'use strict';

(() => {
  const get = id => document.getElementById(id);
  const form = get('questionForm');
  if (!form) return;

  const baseUrl = get('questionPageData').dataset.baseUrl;
  const settingsKey =
    `question-settings:${get('questionPageData').dataset.accountId}`;

  const KEYS = ['A', 'B', 'C', 'D'];

  let subjects = [];
  let topics = [];
  let questions = [];

  let editingId = null;
  let deletingId = null;
  let busy = false;
  let uploadingImage = false;
  let currentModal = null;
  let previousFocus = null;

  const editors = new Map();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function plainText(html) {
    const element = document.createElement('div');
    element.innerHTML = html || '';
    return element.textContent || '';
  }

  function idOf(value) {
    return String(value?._id ?? value ?? '');
  }

  function setError(message = '') {
    get('formError').textContent = message;
    get('formError').hidden = !message;
  }

  async function request(url, method = 'GET', payload) {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(payload !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(payload !== undefined
        ? { body: JSON.stringify(payload) }
        : {}),
    });

    if (response.redirected) {
      window.location.href = response.url;
      throw new Error('Phiên đăng nhập đã thay đổi.');
    }

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      throw new Error(
        `Server không trả JSON (HTTP ${response.status}). Kiểm tra route.`
      );
    }

    const data = await response.json();

    if (!response.ok || data.code !== 'success') {
      throw new Error(data.message || 'Thao tác thất bại!');
    }

    return data;
  }

  // Upload ảnh cho nội dung, lời giải và các phương án.
  async function uploadEditorImage(quill, file) {
    if (!file || busy || uploadingImage) return;

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('Ảnh không được vượt quá 2 MB.');
      return;
    }

    const range = quill.getSelection(true);
    const index = range?.index ?? quill.getLength() - 1;

    const body = new FormData();
    body.append('image', file);

    uploadingImage = true;
    get('saveButton').disabled = true;
    quill.enable(false);
    setError('Đang tải ảnh lên...');

    try {
      const response = await fetch(`${baseUrl}/images`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body,
      });

      if (response.redirected) {
        throw new Error(
          'Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.'
        );
      }

      const contentType =
        response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        throw new Error(
          `Server không trả JSON (HTTP ${response.status}). Kiểm tra route upload ảnh.`
        );
      }

      const data = await response.json();

      if (
        !response.ok ||
        typeof data.url !== 'string' ||
        !data.url
      ) {
        throw new Error(data.message || 'Upload ảnh thất bại.');
      }

      // Bật editor trước khi chèn ảnh với source 'user'.
      quill.enable(true);
      quill.insertEmbed(index, 'image', data.url, 'user');
      quill.setSelection(index + 1, 0, 'silent');

      setError();
    } catch (error) {
      setError(error.message || 'Không thể tải ảnh lên.');
    } finally {
      uploadingImage = false;
      quill.enable(true);
      quill.focus();
      get('saveButton').disabled = busy;
    }
  }

  function bindEditorImages(instance) {
    // Chọn ảnh từ toolbar.
    instance.getModule('toolbar').addHandler('image', () => {
      if (busy || uploadingImage) return;

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,image/gif';

      input.addEventListener('change', () => {
        uploadEditorImage(instance, input.files[0]);
      });

      input.click();
    });

    // Dán file ảnh từ clipboard bằng Ctrl+V.
    instance.root.addEventListener('paste', event => {
      const items = [...(event.clipboardData?.items || [])];

      const image = items.find(item =>
        item.kind === 'file' &&
        item.type.startsWith('image/')
      );

      if (!image) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (busy || uploadingImage) return;

      uploadEditorImage(instance, image.getAsFile());
    }, true);

    // Cho phép thả file vào editor.
    instance.root.addEventListener('dragover', event => {
      const types = [...(event.dataTransfer?.types || [])];

      if (types.includes('Files')) {
        event.preventDefault();
      }
    }, true);

    // Upload ảnh được kéo thả.
    instance.root.addEventListener('drop', event => {
      const files = [...(event.dataTransfer?.files || [])];

      if (!files.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (busy || uploadingImage) return;

      const image = files.find(file =>
        file.type.startsWith('image/')
      );

      if (image) {
        uploadEditorImage(instance, image);
      } else {
        setError('Vui lòng chọn file ảnh.');
      }
    }, true);
  }

  // Quill / chế độ dự phòng.
  function createEditor(id, small = false) {
    const target = get(id);

    if (typeof window.Quill === 'function' && window.katex) {
      const instance = new window.Quill(target, {
        theme: 'snow',
        placeholder: 'Nhập nội dung...',
        modules: {
          toolbar: small
            ? [
                ['bold', 'italic'],
                ['formula', 'image'],
                ['clean'],
              ]
            : [
                [{ header: [false, 2, 3] }],
                ['bold', 'italic', 'underline'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['formula', 'image'],
                ['clean'],
              ],
        },
      });

      bindEditorImages(instance);

      editors.set(id, {
        instance,
        quill: true,
      });

      return;
    }

    const fallback = document.createElement('div');
    fallback.className = 'fallback-editor';
    fallback.contentEditable = 'true';
    fallback.setAttribute('role', 'textbox');
    fallback.setAttribute('aria-multiline', 'true');

    target.appendChild(fallback);

    editors.set(id, {
      instance: fallback,
      quill: false,
    });

    get('editorOfflineNote').hidden = false;
  }

  function readEditor(id) {
    const editor = editors.get(id);

    if (editor.quill) {
      const instance = editor.instance;
      const hasFormula =
        instance.root.querySelector('.ql-formula');
      const hasImage = instance.root.querySelector('img');

      return {
        html: instance.root.innerHTML,
        delta: instance.getContents(),
        text:
          instance.getText().trim() ||
          (hasFormula ? '[Công thức]' : '') ||
          (hasImage ? '[Hình ảnh]' : ''),
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
      const parent = get(
        prefix === 'mcq' ? 'mcqOptions' : 'tfOptions'
      );

      parent.innerHTML = KEYS.map(key => {
        const control = prefix === 'mcq'
          ? `
            <label class="option-choice">
              <input
                type="radio"
                name="correctMcq"
                value="${key}"
                ${key === 'A' ? 'checked' : ''}
              >
              Đáp án đúng
            </label>
          `
          : `
            <div class="option-choice option-choice--tf">
              <label>
                <input
                  type="radio"
                  name="tf-${key}"
                  value="true"
                  checked
                >
                Đúng
              </label>
              <label>
                <input
                  type="radio"
                  name="tf-${key}"
                  value="false"
                >
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
              <div
                id="${prefix}Opt${key}"
                class="rich-editor rich-editor--option"
              ></div>
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

  // Môn học / chuyên đề.
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
    if (busy || uploadingImage) return;

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

  function collectQuestion() {
    if (uploadingImage) {
      throw new Error('Ảnh đang tải lên, vui lòng đợi.');
    }

    const subjectId = get('questionSubject').value;
    const topicId = get('questionTopic').value;
    const type = get('questionType').value;

    const subject = subjects.find(item =>
      idOf(item) === subjectId
    );

    const topic = topics.find(item =>
      idOf(item) === topicId
    );

    const original = questions.find(item =>
      idOf(item) === editingId
    );

    if (!subject) {
      throw new Error('Vui lòng chọn môn học.');
    }

    if (
      !subject.active &&
      subjectId !== idOf(original?.subjectId)
    ) {
      throw new Error('Môn học đã bị ẩn.');
    }

    if (!topic || idOf(topic.subjectId) !== subjectId) {
      throw new Error('Chọn chuyên đề thuộc đúng môn học.');
    }

    if (
      !topic.active &&
      topicId !== idOf(original?.topicId)
    ) {
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
          throw new Error(
            `Chưa nhập nội dung phương án ${key}.`
          );
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

  function clearPersonalForm(focus = false) {
    if (busy || uploadingImage) return;

    clearForm(focus);
    get('questionSubject').disabled = false;
  }

  function startEdit(question) {
    if (busy || uploadingImage) return;

    clearPersonalForm();
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

    if (
      question.type === 'mcq' ||
      question.type === 'truefalse'
    ) {
      const prefix = question.type === 'mcq' ? 'mcq' : 'tf';

      for (const key of KEYS) {
        const option = question.options.find(item =>
          item.key === key
        );

        writeEditor(`${prefix}Opt${key}`, option?.content);

        const selector = question.type === 'mcq'
          ? `input[name="correctMcq"][value="${key}"]`
          : `input[name="tf-${key}"][value="${option?.isCorrect === true}"]`;

        const radio = form.querySelector(selector);

        if (
          radio &&
          (
            question.type === 'truefalse' ||
            question.correctAnswer === key
          )
        ) {
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

  // Modal xem trước / xóa.
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
            <div class="preview-html">
              ${option.content.html}
            </div>
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

    get('previewBody')
      .querySelectorAll('.ql-formula[data-value]')
      .forEach(element => {
        if (window.katex?.render) {
          window.katex.render(
            element.dataset.value,
            element,
            {
              throwOnError: false,
              trust: false,
            }
          );
        }
      });

    openModal(get('previewModal'));
  }

  // Ghi nhớ lựa chọn sau khi lưu.
  function saveQuestionSettings() {
    const settings = {
      subjectId: get('questionSubject').value,
      topicId: get('questionTopic').value,
      type: get('questionType').value,
      bloomLevel: get('questionBloom').value,
      status: get('questionStatus').value,
    };

    try {
      sessionStorage.setItem(
        settingsKey,
        JSON.stringify(settings)
      );
    } catch {
      // Vẫn cho lưu nếu trình duyệt không cho dùng storage.
    }
  }

  function restoreQuestionSettings() {
    try {
      const saved = sessionStorage.getItem(settingsKey);
      if (!saved) return;

      const settings = JSON.parse(saved);

      const subject = subjects.find(item => {
        return (
          idOf(item) === settings.subjectId &&
          item.active
        );
      });

      if (subject) {
        get('questionSubject').value = settings.subjectId;

        const topic = topics.find(item => {
          return (
            idOf(item) === settings.topicId &&
            idOf(item.subjectId) === settings.subjectId &&
            item.active
          );
        });

        const selectedTopicId = topic
          ? settings.topicId
          : '';

        fillQuestionTopics(
          settings.subjectId,
          selectedTopicId
        );
      }

      if (
        ['mcq', 'truefalse', 'fill'].includes(settings.type)
      ) {
        get('questionType').value = settings.type;
      }

      if (
        ['1', '2', '3', '4', '5', '6'].includes(
          settings.bloomLevel
        )
      ) {
        get('questionBloom').value = settings.bloomLevel;
      }

      if (
        ['draft', 'published'].includes(settings.status)
      ) {
        get('questionStatus').value = settings.status;
      }

      updateTypeUI();
    } catch {
      // Dữ liệu nhớ không hợp lệ thì dùng mặc định.
    }
  }

  // Events.
  get('questionSubject').addEventListener('change', event => {
    fillQuestionTopics(event.target.value);
  });

  get('questionType').addEventListener(
    'change',
    updateTypeUI
  );

  for (const id of ['newQuestionButton', 'resetButton']) {
    get(id).addEventListener('click', () => {
      if (!busy && !uploadingImage) {
        clearPersonalForm(true);
      }
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

    if (busy || uploadingImage) return;

    try {
      setError();

      const payload = collectQuestion();
      const id = editingId;

      busy = true;
      get('saveButton').disabled = true;

      const data = await request(
        id
          ? `${baseUrl}/${encodeURIComponent(id)}`
          : `${baseUrl}/create`,
        id ? 'PATCH' : 'POST',
        payload
      );

      saveQuestionSettings();

      alert(data.message);
      window.location.reload();
    } catch (error) {
      setError(error.message);
    } finally {
      busy = false;
      get('saveButton').disabled = uploadingImage;
    }
  });

  // Search dùng form GET, phân trang dùng link Pug.
  const filterForm = get('questionFilterForm');

  get('subjectFilter').addEventListener('change', () => {
    get('topicFilter').value = 'all';
    filterForm.requestSubmit();
  });

  for (
    const id of [
      'topicFilter',
      'typeFilter',
      'bloomFilter',
    ]
  ) {
    get(id).addEventListener('change', () => {
      filterForm.requestSubmit();
    });
  }

  get('questionList').addEventListener('click', event => {
    const button = event.target.closest(
      'button[data-action]'
    );

    if (!button || busy || uploadingImage) return;

    const row = button.closest('[data-id]');

    const question = questions.find(item =>
      idOf(item) === row?.dataset.id
    );

    if (!question) return;

    if (button.dataset.action === 'edit') {
      startEdit(question);
    } else if (button.dataset.action === 'preview') {
      previewQuestion(question);
    } else if (button.dataset.action === 'delete') {
      deletingId = idOf(question);

      get('deleteDescription').textContent =
        `Bạn có chắc muốn xóa câu hỏi “${(
          question.contentText ||
          plainText(question.content.html)
        ).slice(0, 100)}”?`;

      openModal(get('deleteModal'));
    }
  });

  get('confirmDelete').addEventListener('click', async () => {
    if (!deletingId || busy || uploadingImage) return;

    try {
      busy = true;
      get('confirmDelete').disabled = true;
      get('cancelDelete').disabled = true;

      const data = await request(
        `${baseUrl}/${encodeURIComponent(deletingId)}`,
        'DELETE'
      );

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

  for (
    const id of [
      'closePreview',
      'donePreview',
      'cancelDelete',
    ]
  ) {
    get(id).addEventListener('click', closeModal);
  }

  for (const id of ['previewModal', 'deleteModal']) {
    get(id).addEventListener('click', event => {
      if (event.target === get(id)) {
        closeModal();
      }
    });
  }

  document.addEventListener('keydown', event => {
    if (!currentModal) return;

    if (event.key === 'Escape') {
      closeModal();
    }

    if (event.key === 'Tab') {
      const buttons = [
        ...currentModal.querySelectorAll('button'),
      ].filter(button => !button.disabled);

      if (!buttons.length) {
        event.preventDefault();
        return;
      }

      const first = buttons[0];
      const last = buttons[buttons.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
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

      get('subjectFilter').disabled = false;

      clearPersonalForm();
      restoreQuestionSettings();

      get('saveButton').disabled = false;
    } catch (error) {
      console.error(error);
      setError(error.message);
    }
  }

  boot();
})();