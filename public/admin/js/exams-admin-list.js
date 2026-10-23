'use strict';
(() => {
  const get = id => document.getElementById(id);
  if (!get('examList')) return;
  const pageData = get('examPageData');
  const { subjects, exams } = JSON.parse(pageData.dataset.bootstrap);
  const baseUrl = '/admin/exams';
  const idOf = value => String(value?._id ?? value ?? '');
  const subjectById = id => subjects.find(item => idOf(item) === idOf(id));
  let busy = false, deletingId = null, currentModal = null, previousFocus = null;
  const modalStack = [];
  function icon(name) {
    return `
      <svg class="icon" aria-hidden="true">
        <use href="#i-${name}"/>
      </svg>
    `;
  }
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
  get('examList').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || busy) return;

    const row = button.closest('[data-id]');
    if (!row) return;

    const exam = exams.find(item => idOf(item) === row.dataset.id);
    if (!exam) return;

    if (button.dataset.action === 'edit') {
      window.location.assign(`/admin/exams/${encodeURIComponent(idOf(exam))}/edit`);
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

  get('cancelDeleteButton').addEventListener('click', closeModal);
  get('deleteModal').addEventListener('click', event => { if(event.target === get('deleteModal')) closeModal(); });
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

  renderExamList();
})();
