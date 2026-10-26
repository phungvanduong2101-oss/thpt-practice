'use strict';

(() => {
  const get = id => document.getElementById(id);
  const form = get('examForm');
  const pageData = get('examPageData');

  if (!form || !pageData) return;

  const baseUrl = pageData.dataset.baseUrl;

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
  let originalExam = null;

  let editingId = null;
  let selectedIds = [];
  let currentSubject = '';
  let busy = false;

  let currentModal = null;
  let previousFocus = null;
  const modalStack = [];

  let pickerRows = [];
  let pickerPage = 1;
  let pickerTotalPages = 1;
  let pickerTotalItems = 0;
  let pickerRequestId = 0;
  let pickerSearchTimer;

  const idOf = value => String(value?._id ?? value ?? '');

  const subjectById = id =>
    subjects.find(subject => idOf(subject) === idOf(id));

  const topicById = id =>
    topics.find(topic => idOf(topic) === idOf(id));

  const questionById = id =>
    questions.find(question => idOf(question) === idOf(id));

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

    element.querySelectorAll('.ql-formula[data-value]')
      .forEach(node => {
        node.textContent = node.dataset.value || '';
      });

    return element.textContent.trim() ||
      'Câu hỏi có nội dung định dạng';
  }

  function preview(question) {
    const text = questionText(question);
    return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  }

  function setError(message = '') {
    get('examFormError').textContent = message;
    get('examFormError').hidden = !message;
  }

  async function request(url, method, payload) {
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
      window.location.assign(response.url);
      return null;
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

  // Giữ modal chọn câu hỏi khi mở modal xem trước.
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

    const focusToRestore = previousFocus;
    currentModal.hidden = true;

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

  function renderSelected() {
    get('pickedCount').textContent = `${selectedIds.length} câu hỏi`;
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
    // Khôi phục giá trị ban đầu được Pug render.
    form.reset();

    editingId = originalExam ? idOf(originalExam) : null;
    currentSubject = get('examSubject').value;
    selectedIds = (originalExam?.questionIds || []).map(idOf);

    setError();
    renderSelected();

    if (focus) {
      get('examEditorPanel').scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      get('examTitle').focus({ preventScroll: true });
    }
  }

  function renderPickerPager() {
    const container = get('pickerPagination');

    if (pickerTotalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    const pages = [...new Set([
      1,
      pickerPage - 1,
      pickerPage,
      pickerPage + 1,
      pickerTotalPages,
    ])]
      .filter(page => page >= 1 && page <= pickerTotalPages)
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
        ${pickerPage === pickerTotalPages ? 'disabled' : ''}
        aria-label="Trang tiếp">
        ${icon('chevron')}
      </button>
    `;
  }

  function canUseQuestion(question) {
    // Quyền sở hữu câu hỏi cá nhân được BE kiểm tra.
    return question.scope === 'system' ||
      question.scope === 'personal';
  }

  async function renderPicker() {
    const requestId = ++pickerRequestId;

    const params = new URLSearchParams({
      subjectId: currentSubject,
      keyword: get('pickerSearch').value.trim(),
      source: get('pickerSource').value,
      topicId: get('pickerTopic').value,
      type: get('pickerType').value,
      bloomLevel: get('pickerBloom').value,
      page: String(pickerPage),
    });

    pickerRows = [];
    get('pickerResults').textContent = 'Đang tải câu hỏi...';
    get('pickerSummary').textContent = 'Đang tải...';
    get('pickerPagination').innerHTML = '';

    try {
      const data = await request(
        `${baseUrl}/questions?${params.toString()}`,
        'GET'
      );

      if (requestId !== pickerRequestId || !data) return;

      pickerRows = data.questions;
      pickerPage = data.currentPage;
      pickerTotalPages = data.totalPages;
      pickerTotalItems = data.totalItems;

      // Giữ câu đã chọn khi chuyển trang hoặc thay bộ lọc.
      const cache = new Map(
        questions.map(question => [idOf(question), question])
      );

      for (const question of pickerRows) {
        cache.set(idOf(question), question);
      }

      questions = [...cache.values()];

      renderPickerRows();
    } catch (error) {
      if (requestId !== pickerRequestId) return;

      pickerRows = [];
      get('pickerResults').textContent = error.message;
      get('pickerSummary').textContent =
        'Không tải được câu hỏi. Đổi bộ lọc để thử lại.';
    }
  }

  function renderPickerRows() {
    get('pickerSummary').textContent =
      `${pickerTotalItems} câu hỏi phù hợp · ` +
      `Trang ${pickerPage}/${pickerTotalPages}`;

    get('pickerSelectedCount').textContent = selectedIds.length;

    get('pickerResults').innerHTML = pickerRows.length
      ? pickerRows.map(question => {
        const id = idOf(question);
        const selected = selectedIds.includes(id);

        return `
          <article class="examadmin-bank-card">
            <div class="examadmin-bank-main">
              <div class="examadmin-bank-top">
                <span class="examadmin-chip">
                  ${question.scope === 'system' ? 'Hệ thống' : 'Của tôi'}
                </span>

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
                class="examadmin-bank-add ${selected ? 'is-selected' : ''}"
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

    renderPickerPager();
  }

  function openPicker() {
    if (!currentSubject || busy) return;

    clearTimeout(pickerSearchTimer);

    get('pickerSearch').value = '';
    get('pickerSource').value = 'all';
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

    showModal(get('pickerModal'));
    renderPicker();
  }

  function renderFormulas(container) {
    container.querySelectorAll('.ql-formula[data-value]')
      .forEach(element => {
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
            displayMode: false,
          });
        } catch {
          element.textContent = latex;
        }
      });
  }

  function previewFullQuestion(id) {
    const question = questionById(id);
    if (!question) return;

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
          : option.isCorrect === true
            ? 'Đúng'
            : option.isCorrect === false
              ? 'Sai'
              : 'Chưa có đáp án';

        return `
          <div class="preview-answer ${correct ? 'preview-correct' : ''}">
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

      <p>${escapeHtml(topic?.name || 'Chuyên đề không còn tồn tại')}</p>

      <div class="preview-content preview-html">
        ${question.content?.html ||
          escapeHtml(question.contentText || '')}
      </div>

      <div class="preview-label">Phương án và đáp án</div>
      <div class="preview-answers">${answers}</div>

      ${question.explanation?.html ? `
        <div class="preview-label">Lời giải / giải thích</div>
        <div class="preview-solution preview-html">
          ${question.explanation.html}
        </div>
      ` : ''}
    `;

    showModal(get('examQuestionPreviewModal'));
    renderFormulas(body);
  }

  function collectExam() {
    const title = get('examTitle').value.trim().replace(/\s+/g, ' ');
    const subjectId = get('examSubject').value;
    const duration = Number(get('examDuration').value);
    const description = get('examDescription').value.trim();
    const status = get('examStatus').value;

    const subject = subjectById(subjectId);

    if (title.length < 5 || title.length > 120) {
      throw new Error('Tên đề thi cần từ 5 đến 120 ký tự.');
    }

    if (!subject || !subject.active) {
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
        canUseQuestion(question);
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
          ? `${baseUrl}/${encodeURIComponent(editingId)}`
          : `${baseUrl}/create`,
        editingId ? 'PATCH' : 'POST',
        payload
      );

      if (!data) return;

      alert(data.message || 'Lưu đề thi thành công!');
      window.location.assign(baseUrl);
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

    if (next !== currentSubject) {
      selectedIds = [];
    }

    currentSubject = next;
    setError();
    renderSelected();
  });

  get('resetExamButton').addEventListener('click', () => {
    if (!busy) resetForm(true);
  });

  get('openPickerButton').addEventListener('click', openPicker);

  for (const id of [
    'closePickerButton',
    'donePickerButton',
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
    'pickerSource',
  ]) {
    get(id).addEventListener(
      id === 'pickerSearch' ? 'input' : 'change',
      () => {
        clearTimeout(pickerSearchTimer);
        pickerPage = 1;

        if (id === 'pickerSearch') {
          ++pickerRequestId;
          pickerRows = [];

          get('pickerResults').textContent = 'Đang tìm kiếm...';
          get('pickerPagination').innerHTML = '';

          pickerSearchTimer = setTimeout(renderPicker, 300);
        } else {
          renderPicker();
        }
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
      !canUseQuestion(question)
    ) return;

    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter(item => item !== id)
      : [...selectedIds, id];

    renderSelected();
    renderPickerRows();

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

    if (button.dataset.action === 'remove') {
      selectedIds.splice(index, 1);
    } else if (button.dataset.action === 'up' && index > 0) {
      [selectedIds[index - 1], selectedIds[index]] =
        [selectedIds[index], selectedIds[index - 1]];
    } else if (
      button.dataset.action === 'down' &&
      index < selectedIds.length - 1
    ) {
      [selectedIds[index + 1], selectedIds[index]] =
        [selectedIds[index], selectedIds[index + 1]];
    }

    renderSelected();
  });

  for (const id of ['pickerModal', 'examQuestionPreviewModal']) {
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
    try {
      const data = JSON.parse(pageData.dataset.bootstrap);

      for (const key of ['subjects', 'topics', 'questions', 'exams']) {
        if (!Array.isArray(data[key])) {
          throw new Error(`Dữ liệu ${key} không hợp lệ.`);
        }
      }

      subjects = data.subjects;
      topics = data.topics;
      questions = data.questions;
      originalExam = data.exams[0] || null;

      resetForm();

      get('saveExamButton').disabled = false;
    } catch (error) {
      setError(error.message);
    }
  }

  boot();
})();