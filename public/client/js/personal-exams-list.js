'use strict';

(() => {
  const get = id => document.getElementById(id);
  const examList = get('examList');
  if (!examList) return;

  const baseUrl = '/my/exams';
  const deleteModal = get('deleteModal');
  const confirmButton = get('confirmDeleteButton');
  const cancelButton = get('cancelDeleteButton');

  let busy = false;
  let deletingId = null;
  let previousFocus = null;

  function showModal() {
    previousFocus = document.activeElement;
    deleteModal.hidden = false;

    document.body.classList.add('examadmin-modal-open');
    cancelButton.focus();
  }

  function closeModal() {
    if (busy || deleteModal.hidden) return;

    deleteModal.hidden = true;
    deletingId = null;

    document.body.classList.remove('examadmin-modal-open');

    if (previousFocus?.isConnected) {
      previousFocus.focus();
    }

    previousFocus = null;
  }

  async function deleteExam(id) {
    const response = await fetch(
      `${baseUrl}/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      }
    );

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
      throw new Error(data.message || 'Không thể xóa đề thi.');
    }

    return data;
  }

  examList.addEventListener('click', event => {
    const button = event.target.closest(
      'button[data-action="delete"]'
    );

    if (!button || busy) return;

    const row = button.closest('[data-id]');
    if (!row) return;

    deletingId = row.dataset.id;

    get('deleteMessage').textContent =
      `Bạn có chắc muốn xóa “${button.dataset.title}”?`;

    showModal();
  });

  confirmButton.addEventListener('click', async () => {
    if (!deletingId || busy) return;

    const id = deletingId;

    try {
      busy = true;
      confirmButton.disabled = true;
      cancelButton.disabled = true;

      const data = await deleteExam(id);
      if (!data) return;

      alert(data.message || 'Xóa đề thi thành công!');
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      busy = false;
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      closeModal();
    }
  });

  cancelButton.addEventListener('click', closeModal);

  deleteModal.addEventListener('click', event => {
    if (event.target === deleteModal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', event => {
    if (deleteModal.hidden) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const controls = [...deleteModal.querySelectorAll('button')]
      .filter(element =>
        !element.disabled && element.getClientRects().length
      );

    if (!controls.length) {
      event.preventDefault();
      return;
    }

    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;

    if (!deleteModal.contains(active)) {
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

  for (const id of ['examSubjectFilter', 'examStatusFilter']) {
    get(id)?.addEventListener('change', () => {
      get('examFilterForm').requestSubmit();
    });
  }
})();