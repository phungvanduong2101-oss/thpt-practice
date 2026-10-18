'use strict';

(() => {
  const get = id => document.getElementById(id);
  const form = get('examForm');
  if (!form) return;

  const PICKER_SIZE = 5;

  const TYPES = {
    mcq: 'ABCD',
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
  let exams = [];

  let editingId = null;
  let deletingId = null;
  let selectedIds = [];
  let currentSubject = '';
  let pickerPage = 1;
  let busy = false;

  let currentModal = null;
  let previousFocus = null;
  const modalStack = [];


  const subjectById = id =>
    subjects.find(item => idOf(item) === idOf(id));

  const topicById = id =>
    topics.find(item => idOf(item) === idOf(id));

  const questionById = id =>
    questions.find(item => idOf(item) === idOf(id));



  function normalise(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function icon(name) {
    return `
      <svg class="icon" aria-hidden="true">
        <use href="#i-${name}"/>
      </svg>
    `;
  }

  function questionText(question) {
    if (!question) return 'Câu hỏi không còn tồn tại';

    if (question.contentText) return question.contentText;

    const element = document.createElement('div');
    element.innerHTML = question.content?.html || '';

    element.querySelectorAll('.ql-formula[data-value]').forEach(node => {
      node.textContent = node.dataset.value || '';
    });

    return element.textContent.trim() || 'Câu hỏi có nội dung định dạng';
  }

  function preview(question) {
    const text = questionText(question);
    return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  }

  function setError(message = '') {
    get('examFormError').textContent = message;
    get('examFormError').hidden = !message;
  }



  // Modal có thể mở xem trước từ cửa sổ chọn câu hỏi.
  function showModal(modal) {
    if (!modal || modal === currentModal) return;

    const trigger = document.activeElement;

    if (currentModal) {
      modalStack.push({
        modal: currentModal,
        focus: previousFocus,
      });

      currentModal.hidden = true;
    }

    previousFocus = trigger;
    currentModal = modal;
    modal.hidden = false;

    document.body.classList.add('examadmin-modal-open');
    modal.querySelector('button, input, select')?.focus();
  }

  function closeModal() {
    if (busy || !currentModal) return;

    const closingModal = currentModal;
    const focusToRestore = previousFocus;

    closingModal.hidden = true;

    if (closingModal.id === 'deleteModal') {
      deletingId = null;
    }

    const parent = modalStack.pop();

    if (parent) {
      currentModal = parent.modal;
      previousFocus = parent.focus;
      currentModal.hidden = false;
    } else {
      currentModal = null;
      previousFocus = null;
      document.body.classList.remove('examadmin-modal-open');
    }

    if (focusToRestore?.isConnected) {
      focusToRestore.focus();
    }
  }

  // Chỉ đổ môn học vào form biên tập.
  // Bộ lọc môn học bên danh sách do Pug render.
  function fillSubjects() {
    get('examSubject').innerHTML =
      '<option value="">Chọn môn học</option>' +
      subjects.map(subject => `
        <option value="${escapeHtml(idOf(subject))}">
          ${escapeHtml(subject.name)}${subject.active ? '' : ' (Đã ẩn)'}
        </option>
      `).join('');
  }

  // Backend đã lọc và phân trang exams.
  // Không sửa thống kê, bộ lọc hoặc phân trang do Pug render.
  function renderExamList() {
    get('examList').innerHTML = exams.map(exam => `
      <article class="examadmin-item"
        data-id="${escapeHtml(idOf(exam))}">
        <span class="examadmin-item-icon">
          ${icon('clipboard')}
        </span>

        <div>
          <h3 class="examadmin-item-title">
            ${escapeHtml(exam.title)}
          </h3>

          <div class="examadmin-item-meta">
            <span class="examadmin-tag">
              ${escapeHtml(
                subjectById(exam.subjectId)?.name ||
                'Môn không còn tồn tại'
              )}
            </span>

            <span class="examadmin-tag examadmin-tag--${
              exam.status === 'published' ? 'published' : 'draft'
            }">
              ${exam.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
            </span>
          </div>

          <p class="examadmin-item-desc">
            ${escapeHtml(exam.description || 'Chưa có mô tả.')}
          </p>

          <div class="examadmin-item-meta">
            <span>${exam.questionIds?.length || 0} câu hỏi</span>
            <span class="examadmin-dot">•</span>
            <span>${escapeHtml(exam.duration)} phút</span>
          </div>
        </div>

        <div class="examadmin-item-actions">
          <button type="button"
            class="examadmin-icon-button"
            data-action="edit"
            title="Sửa đề thi"
            aria-label="Sửa đề thi">
            ${icon('edit')}
          </button>

          <button type="button"
            class="examadmin-icon-button examadmin-icon-button--danger"
            data-action="delete"
            title="Xóa đề thi"
            aria-label="Xóa đề thi">
            ${icon('trash')}
          </button>
        </div>
      </article>
    `).join('');
  }

  // Phân trang riêng cho modal chọn câu hỏi.
  function renderPickerPager(totalPages) {
    const container = get('pickerPagination');

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    const pages = [...new Set([
      1,
      pickerPage - 1,
      pickerPage,
      pickerPage + 1,
      totalPages,
    ])]
      .filter(page => page >= 1 && page <= totalPages)
      .sort((a, b) => a - b);

    let previous = 0;

    const numbers = pages.map(page => {
      const gap = page - previous > 1
        ? '<span aria-hidden="true">…</span>'
        : '';

      previous = page;

      return `
        ${gap}
        <button type="button"
          class="page-button ${page === pickerPage ? 'is-active' : ''}"
          data-page="${page}"
          aria-label="Trang ${page}"
          ${page === pickerPage ? 'aria-current="page"' : ''}>
          ${page}
        </button>
      `;
    }).join('');

    container.innerHTML = `
      <button type="button"
        class="page-button"
        data-page="${pickerPage - 1}"
        ${pickerPage === 1 ? 'disabled' : ''}
        aria-label="Trang trước">
        ${icon('left')}
      </button>

      ${numbers}

      <button type="button"
        class="page-button"
        data-page="${pickerPage + 1}"
        ${pickerPage === totalPages ? 'disabled' : ''}
        aria-label="Trang tiếp">
        ${icon('chevron')}
      </button>
    `;
  }

  function renderSelected() {
    get('pickedCount').textContent = `${selectedIds.length} câu hỏi`;
    get('pickedScore').textContent =
      'Thứ tự bên dưới là thứ tự trong đề';

    get('pickerSelectedCount').textContent = selectedIds.length;
    get('pickedEmpty').hidden = selectedIds.length > 0;
    get('openPickerButton').disabled = busy || !currentSubject;

    get('pickedList').innerHTML = selectedIds.map((id, index) => {
      const question = questionById(id);

      return `
        <div class="examadmin-picked" data-id="${escapeHtml(id)}">
          <span class="examadmin-picked-index">${index + 1}</span>

          <div class="examadmin-picked-main">
            <strong>${escapeHtml(preview(question))}</strong>

            <small>
              ${escapeHtml(TYPES[question?.type] || 'Không tìm thấy')}
              · ${escapeHtml(
                topicById(question?.topicId)?.name ||
                'Chuyên đề không còn tồn tại'
              )}
            </small>
          </div>

          <div class="examadmin-picked-actions">
            <button type="button"
              data-preview-question="${escapeHtml(id)}"
              title="Xem nội dung đầy đủ"
              aria-label="Xem nội dung đầy đủ"
              ${question ? '' : 'disabled'}>
              ${icon('search')}
            </button>

            <button type="button"
              data-action="up"
              aria-label="Đưa câu hỏi lên"
              ${index === 0 ? 'disabled' : ''}>
              ↑
            </button>

            <button type="button"
              data-action="down"
              aria-label="Đưa câu hỏi xuống"
              ${index === selectedIds.length - 1 ? 'disabled' : ''}>
              ↓
            </button>

            <button type="button"
              data-action="remove"
              aria-label="Bỏ câu hỏi">
              ×
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function resetForm(focus = false) {
    editingId = null;
    selectedIds = [];
    currentSubject = '';

    form.reset();
    setError();

    get('examFormTitle').textContent = 'Tạo đề thi mới';
    get('saveExamText').textContent = 'Lưu đề thi';

    renderSelected();

    if (focus) {
      get('examEditorPanel').scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      get('examTitle').focus({ preventScroll: true });
    }
  }

  function editExam(exam) {
    resetForm();

    editingId = idOf(exam);
    currentSubject = idOf(exam.subjectId);
    selectedIds = (exam.questionIds || []).map(idOf);

    get('examTitle').value = exam.title || '';
    get('examSubject').value = currentSubject;
    get('examDuration').value = exam.duration;
    get('examDescription').value = exam.description || '';
    get('examStatus').value = exam.status;

    get('examFormTitle').textContent = 'Chỉnh sửa đề thi';
    get('saveExamText').textContent = 'Cập nhật đề thi';

    renderSelected();

    get('examEditorPanel').scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    get('examTitle').focus({ preventScroll: true });
  }

  function filteredPickerQuestions() {
    const keyword = normalise(get('pickerSearch').value);
    const topicId = get('pickerTopic').value;
    const type = get('pickerType').value;
    const bloom = get('pickerBloom').value;

    return questions.filter(question =>
      idOf(question.subjectId) === currentSubject &&
      question.published === true &&
      !question.groupId &&
      (topicId === 'all' || idOf(question.topicId) === topicId) &&
      (type === 'all' || question.type === type) &&
      (bloom === 'all' || String(question.bloomLevel) === bloom) &&
      (!keyword || normalise(
        `${questionText(question)} ${
          topicById(question.topicId)?.name || ''
        }`
      ).includes(keyword))
    );
  }

  function renderPicker() {
    const result = filteredPickerQuestions();
    const totalPages = Math.max(
      1,
      Math.ceil(result.length / PICKER_SIZE)
    );

    pickerPage = Math.max(1, Math.min(pickerPage, totalPages));

    const start = (pickerPage - 1) * PICKER_SIZE;

    get('pickerSummary').textContent =
      `${result.length} câu hỏi phù hợp`;

    get('pickerSelectedCount').textContent = selectedIds.length;

    get('pickerResults').innerHTML = result.length
      ? result.slice(start, start + PICKER_SIZE).map(question => {
        const id = idOf(question);
        const selected = selectedIds.includes(id);

        return `
          <article class="examadmin-bank-card">
            <div class="examadmin-bank-main">
              <div class="examadmin-bank-top">
                <span class="examadmin-chip examadmin-chip--blue">
                  ${escapeHtml(TYPES[question.type] || '')}
                </span>

                <span class="examadmin-chip">
                  ${escapeHtml(
                    topicById(question.topicId)?.name ||
                    'Chuyên đề không còn tồn tại'
                  )}
                </span>

                <span class="examadmin-chip">
                  Bloom ${escapeHtml(question.bloomLevel)}
                  · ${escapeHtml(BLOOM[question.bloomLevel] || '')}
                </span>
              </div>

              <p>${escapeHtml(preview(question))}</p>
            </div>

            <div class="exam-preview-actions">
              <button type="button"
                class="button button--secondary"
                data-preview-question="${escapeHtml(id)}">
                Xem trước
              </button>

              <button type="button"
                class="examadmin-bank-add ${
                  selected ? 'is-selected' : ''
                }"
                data-pick="${escapeHtml(id)}"
                aria-pressed="${selected}">
                ${selected ? '✓ Đã chọn' : '＋ Thêm vào đề'}
              </button>
            </div>
          </article>
        `;
      }).join('')
      : `
        <div class="examadmin-empty">
          <strong>Không tìm thấy câu hỏi phù hợp</strong>
          <p>Thử đổi bộ lọc hoặc thêm câu hỏi đã xuất bản.</p>
        </div>
      `;

    renderPickerPager(totalPages);
  }

  function openPicker() {
    if (!currentSubject || busy) return;

    get('pickerSearch').value = '';
    get('pickerType').value = 'all';
    get('pickerBloom').value = 'all';

    get('pickerTopic').innerHTML =
      '<option value="all">Tất cả chuyên đề</option>' +
      topics
        .filter(topic => idOf(topic.subjectId) === currentSubject)
        .map(topic => `
          <option value="${escapeHtml(idOf(topic))}">
            ${escapeHtml(topic.name)}
          </option>
        `).join('');

    get('pickerSubjectInfo').textContent =
      `Môn: ${subjectById(currentSubject)?.name || ''}` +
      ' · Câu hỏi đã xuất bản';

    pickerPage = 1;
    renderPicker();
    showModal(get('pickerModal'));
  }


  function previewFullQuestion(id) {
    const question = questionById(id);
    if (!question) return;

    const modal = get('examQuestionPreviewModal');
    const body = get('examQuestionPreviewBody');

    const subject = subjectById(question.subjectId);
    const topic = topicById(question.topicId);

    let answers = '';

    if (question.type === 'fill') {
      answers = `
        <div class="preview-answer preview-correct">
          <strong>Đáp án chấp nhận</strong>
          <div>
            ${escapeHtml((question.acceptedAnswers || []).join(' | '))}
          </div>
        </div>
      `;
    } else {
      answers = (question.options || []).map(option => {
        const isMcq = question.type === 'mcq';

        const correct = isMcq
          ? question.correctAnswer === option.key
          : option.isCorrect === true;

        const label = isMcq
          ? (correct ? '✓ Đáp án đúng' : '')
          : (
            option.isCorrect === true
              ? 'Đúng'
              : option.isCorrect === false
                ? 'Sai'
                : 'Chưa có đáp án'
          );

        return `
          <div class="preview-answer ${
            correct ? 'preview-correct' : ''
          }">
            <strong>
              ${escapeHtml(option.key)}.
              ${escapeHtml(label)}
            </strong>

            <div class="preview-html">
              ${option.content?.html || ''}
            </div>
          </div>
        `;
      }).join('');
    }

    body.innerHTML = `
      <div class="preview-metadata">
        <span class="question-pill question-pill--subject">
          ${escapeHtml(subject?.name || 'Môn không còn tồn tại')}
        </span>

        <span class="question-pill question-pill--type">
          ${escapeHtml(TYPES[question.type] || '')}
        </span>

        <span class="question-pill question-pill--bloom">
          Bloom ${escapeHtml(question.bloomLevel)}
          · ${escapeHtml(BLOOM[question.bloomLevel] || '')}
        </span>
      </div>

      <p>
        ${escapeHtml(topic?.name || 'Chuyên đề không còn tồn tại')}
      </p>

      <div class="preview-content preview-html">
        ${question.content?.html ||
          escapeHtml(question.contentText || '')}
      </div>

      <div class="preview-label">Phương án và đáp án</div>

      <div class="preview-answers">
        ${answers}
      </div>

      ${question.explanation?.html ? `
        <div class="preview-label">Lời giải / giải thích</div>
        <div class="preview-solution preview-html">
          ${question.explanation.html}
        </div>
      ` : ''}
    `;

    showModal(modal);
    renderFormulas(body);
  }

  function collectExam() {
    const title = get('examTitle').value.trim().replace(/\s+/g, ' ');
    const subjectId = get('examSubject').value;
    const duration = Number(get('examDuration').value);
    const description = get('examDescription').value.trim();
    const status = get('examStatus').value;

    const subject = subjectById(subjectId);
    const original = exams.find(exam => idOf(exam) === editingId);

    if (title.length < 5 || title.length > 120) {
      throw new Error('Tên đề thi cần từ 5 đến 120 ký tự.');
    }

    if (!subject || (
      !subject.active && subjectId !== idOf(original?.subjectId)
    )) {
      throw new Error('Vui lòng chọn môn học đang hoạt động.');
    }

    if (!Number.isInteger(duration) || duration < 1 || duration > 300) {
      throw new Error('Thời gian phải là số nguyên từ 1 đến 300 phút.');
    }

    if (description.length > 500) {
      throw new Error('Mô tả không được vượt quá 500 ký tự.');
    }

    if (!['draft', 'published'].includes(status)) {
      throw new Error('Trạng thái không hợp lệ.');
    }

    if (status === 'published' && !selectedIds.length) {
      throw new Error('Đề xuất bản phải có ít nhất một câu hỏi.');
    }

    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new Error('Đề thi có câu hỏi bị trùng.');
    }

    const valid = selectedIds.every(id => {
      const question = questionById(id);

      return question &&
        idOf(question.subjectId) === subjectId &&
        question.published === true &&
        !question.groupId;
    });

    if (!valid) {
      throw new Error(
        'Có câu hỏi không còn hợp lệ, chưa xuất bản hoặc sai môn. ' +
        'Hãy bỏ câu đó khỏi đề.'
      );
    }

    return {
      title,
      subjectId,
      duration,
      description,
      status,
      questionIds: [...selectedIds],
    };
  }

  // Tạo / cập nhật đề thi.
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;

    try {
      setError();
      const payload = collectExam();

      busy = true;
      get('saveExamButton').disabled = true;
      get('openPickerButton').disabled = true;

      const data = await request(
        editingId
          ? `/admin/exams/${encodeURIComponent(editingId)}`
          : '/admin/exams/create',
        editingId ? 'PATCH' : 'POST',
        payload
      );

      if (!data) return;

      alert(data.message || 'Lưu đề thi thành công!');
      window.location.reload();
    } catch (error) {
      setError(error.message);
    } finally {
      busy = false;
      get('saveExamButton').disabled = false;
      get('openPickerButton').disabled = !currentSubject;
    }
  });

  get('examSubject').addEventListener('change', event => {
    if (busy) {
      event.target.value = currentSubject;
      return;
    }

    const next = event.target.value;

    if (
      next !== currentSubject &&
      selectedIds.length &&
      !confirm('Đổi môn học sẽ bỏ các câu hỏi đã chọn. Tiếp tục?')
    ) {
      event.target.value = currentSubject;
      return;
    }

    if (next !== currentSubject) selectedIds = [];

    currentSubject = next;
    setError();
    renderSelected();
  });

  for (const id of ['newExamButton', 'resetExamButton']) {
    get(id).addEventListener('click', () => {
      if (!busy) resetForm(true);
    });
  }



  get('openPickerButton').addEventListener('click', openPicker);

  for (const id of [
    'closePickerButton',
    'donePickerButton',
    'cancelDeleteButton',
    'closeExamQuestionPreview',
    'doneExamQuestionPreview',
  ]) {
    get(id).addEventListener('click', closeModal);
  }

  for (const id of [
    'pickerSearch',
    'pickerTopic',
    'pickerType',
    'pickerBloom',
  ]) {
    get(id).addEventListener(
      id === 'pickerSearch' ? 'input' : 'change',
      () => {
        pickerPage = 1;
        renderPicker();
      }
    );
  }

  get('pickerPagination').addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if (!button || button.disabled || busy) return;

    const page = Number(button.dataset.page);
    if (!Number.isSafeInteger(page) || page < 1) return;

    pickerPage = page;
    renderPicker();
  });

  get('pickerResults').addEventListener('click', event => {
    if (busy) return;

    const previewButton = event.target.closest(
      'button[data-preview-question]'
    );

    if (previewButton) {
      previewFullQuestion(previewButton.dataset.previewQuestion);
      return;
    }

    const button = event.target.closest('button[data-pick]');
    if (!button) return;

    const id = button.dataset.pick;
    const question = questionById(id);

    if (
      !question ||
      idOf(question.subjectId) !== currentSubject ||
      question.published !== true ||
      question.groupId
    ) return;

    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter(item => item !== id)
      : [...selectedIds, id];

    renderSelected();
    renderPicker();

    get('pickerResults')
      .querySelector(`button[data-pick="${id}"]`)
      ?.focus();
  });

  get('pickedList').addEventListener('click', event => {
    if (busy) return;

    const previewButton = event.target.closest(
      'button[data-preview-question]'
    );

    if (previewButton) {
      if (!previewButton.disabled) {
        previewFullQuestion(previewButton.dataset.previewQuestion);
      }
      return;
    }

    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;

    const row = button.closest('[data-id]');
    if (!row) return;

    const index = selectedIds.indexOf(row.dataset.id);
    if (index < 0) return;

    const action = button.dataset.action;

    if (action === 'remove') {
      selectedIds.splice(index, 1);
    } else if (action === 'up' && index > 0) {
      [selectedIds[index - 1], selectedIds[index]] =
        [selectedIds[index], selectedIds[index - 1]];
    } else if (action === 'down' && index < selectedIds.length - 1) {
      [selectedIds[index + 1], selectedIds[index]] =
        [selectedIds[index], selectedIds[index + 1]];
    }

    renderSelected();
  });

  get('examList').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy) return;

    const row = button.closest('[data-id]');
    if (!row) return;

    const exam = exams.find(item => idOf(item) === row.dataset.id);
    if (!exam) return;

    if (button.dataset.action === 'edit') {
      editExam(exam);
    } else if (button.dataset.action === 'delete') {
      deletingId = idOf(exam);

      get('deleteMessage').textContent =
        `Bạn có chắc muốn xóa “${exam.title}”?`;

      showModal(get('deleteModal'));
    }
  });

  get('confirmDeleteButton').addEventListener('click', async () => {
    if (!deletingId || busy) return;

    const id = deletingId;

    try {
      busy = true;
      get('confirmDeleteButton').disabled = true;
      get('cancelDeleteButton').disabled = true;

      const data = await request(
        `/admin/exams/${encodeURIComponent(id)}`,
        'DELETE'
      );

      if (!data) return;

      alert(data.message || 'Xóa đề thi thành công!');
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      busy = false;
      get('confirmDeleteButton').disabled = false;
      get('cancelDeleteButton').disabled = false;
      closeModal();
    }
  });

  for (const id of [
    'pickerModal',
    'examQuestionPreviewModal',
    'deleteModal',
  ]) {
    const modal = get(id);

    modal.addEventListener('click', event => {
      if (event.target === modal && currentModal === modal) {
        closeModal();
      }
    });
  }

  document.addEventListener('keydown', event => {
    if (!currentModal) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const controls = [...currentModal.querySelectorAll(
      'button, input, select, textarea, a[href]'
    )].filter(element =>
      !element.disabled && element.getClientRects().length
    );

    if (!controls.length) {
      event.preventDefault();
      return;
    }

    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;

    if (!currentModal.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function boot() {
    get('saveExamButton').disabled = true;
    get('openPickerButton').disabled = true;

    try {
      const element = get('examPageData');

      if (!element) {
        throw new Error('Thiếu #examPageData trong Pug.');
      }

      const data = JSON.parse(element.dataset.bootstrap);

      for (const key of ['subjects', 'topics', 'questions', 'exams']) {
        if (!Array.isArray(data[key])) {
          throw new Error(`Dữ liệu ${key} không hợp lệ.`);
        }
      }

      subjects = data.subjects;
      topics = data.topics;
      questions = data.questions;
      exams = data.exams;

      fillSubjects();
      resetForm();
      renderExamList();

      get('saveExamButton').disabled = false;
    } catch (error) {
      setError(error.message);
    }
  }

  boot();
})();