'use strict';

(() => {
  const get = id => document.getElementById(id);

  const form = get('subjectForm');
  if (!form) return;

  const nameInput = get('subjectName');
  const codeInput = get('subjectCode');
  const descriptionInput = get('subjectDescription');

  let codeEditedManually = false;
  let editingId = null;
  let deletingId = null;

  function toCode(value) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 15);
  }

  function setError(input, errorId, message) {
    get(errorId).textContent = message;
    input.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function clearErrors() {
    setError(nameInput, 'nameError', '');
    setError(codeInput, 'codeError', '');
  }

  function updatePreview() {
    get('previewName').textContent =
      nameInput.value.trim() || 'Tên môn học';

    get('previewCode').textContent =
      codeInput.value.trim() || 'MAMON';

    get('descriptionCount').textContent =
      descriptionInput.value.length;
  }

  function clearForm(focus = false) {
    form.reset();
    codeEditedManually = false;
    editingId = null;
    clearErrors();

    get('formTitle').textContent = 'Tạo môn học mới';
    get('formSubtitle').textContent =
      'Nhập thông tin để thêm môn học vào hệ thống.';
    get('saveButtonText').textContent = 'Thêm môn học';

    get('saveButton')
      .querySelector('use')
      ?.setAttribute('href', '#i-plus');

    updatePreview();

    if (focus) {
      get('formPanel').scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      nameInput.focus({ preventScroll: true });
    }
  }

  function validate() {
    clearErrors();

    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    const code = codeInput.value.trim().toUpperCase();

    let valid = true;

    if (name.length < 2 || name.length > 80) {
      setError(
        nameInput,
        'nameError',
        'Tên môn học cần từ 2 đến 80 ký tự.'
      );
      valid = false;
    }

    if (!/^[A-Z][A-Z0-9_]{1,14}$/.test(code)) {
      setError(
        codeInput,
        'codeError',
        'Mã môn gồm 2–15 ký tự, bắt đầu bằng chữ; chỉ dùng A–Z, số và _.'
      );
      valid = false;
    }

    if (!valid) {
      form.querySelector('[aria-invalid="true"]')?.focus();
    }

    return valid;
  }

  nameInput.addEventListener('input', () => {
    if (!codeEditedManually) {
      codeInput.value = toCode(nameInput.value);
    }

    setError(nameInput, 'nameError', '');
    updatePreview();
  });

  codeInput.addEventListener('input', () => {
    codeEditedManually = true;

    codeInput.value = codeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');

    setError(codeInput, 'codeError', '');
    updatePreview();
  });

  descriptionInput.addEventListener('input', updatePreview);

  get('resetButton').addEventListener('click', () => {
    clearForm(true);
  });

  get('newSubjectButton').addEventListener('click', () => {
    clearForm(true);
  });

  async function request(url, method, payload) {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });

    if (response.redirected) {
      window.location.href = response.url;
      return null;
    }

    const data = await response.json();

    if (!response.ok || data.code !== 'success') {
      throw new Error(data.message || 'Thao tác thất bại!');
    }

    return data;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const button = get('saveButton');
    if (button.disabled || !validate()) return;

    const payload = {
      name: nameInput.value.trim().replace(/\s+/g, ' '),
      code: codeInput.value.trim().toUpperCase(),
      description: descriptionInput.value.trim(),
      active: get('subjectActive').checked,
    };

    const url = editingId
      ? `/admin/subjects/${encodeURIComponent(editingId)}`
      : '/admin/subjects/create';

    try {
      button.disabled = true;

      const data = await request(
        url,
        editingId ? 'PATCH' : 'POST',
        payload
      );

      if (!data) return;

      alert(data.message);
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  });


  const deleteModal = get('deleteModal');
  const confirmDeleteButton = get('confirmDelete');

  function closeDelete() {
    deleteModal.hidden = true;
    deletingId = null;
  }

  get('subjectRows').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    if (button.dataset.action === 'edit') {
      editingId = button.dataset.id;
      codeEditedManually = true;

      nameInput.value = button.dataset.name || '';
      codeInput.value = button.dataset.code || '';
      descriptionInput.value = button.dataset.description || '';
      get('subjectActive').checked = button.dataset.active === 'true';

      clearErrors();
      updatePreview();

      get('formTitle').textContent = 'Chỉnh sửa môn học';
      get('formSubtitle').textContent =
        `Cập nhật thông tin môn ${nameInput.value}.`;
      get('saveButtonText').textContent = 'Lưu thay đổi';

      get('saveButton')
        .querySelector('use')
        ?.setAttribute('href', '#i-save');

      get('formPanel').scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      nameInput.focus({ preventScroll: true });
    }

    if (button.dataset.action === 'delete') {
      deletingId = button.dataset.id;

      get('deleteDescription').textContent =
        'Bạn có chắc muốn xóa môn học này? Thao tác không thể hoàn tác.';

      deleteModal.hidden = false;
      get('cancelDelete').focus();
    }
  });

  get('cancelDelete').addEventListener('click', closeDelete);

  deleteModal.addEventListener('click', event => {
    if (event.target === deleteModal && !confirmDeleteButton.disabled) {
      closeDelete();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !confirmDeleteButton.disabled) {
      closeDelete();
    }
  });

  confirmDeleteButton.addEventListener('click', async () => {
    if (!deletingId || confirmDeleteButton.disabled) return;

    const id = deletingId;

    try {
      confirmDeleteButton.disabled = true;
      get('cancelDelete').disabled = true;

      const data = await request(
        `/admin/subjects/${encodeURIComponent(id)}`,
        'DELETE'
      );

      if (!data) return;

      alert(data.message);
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      confirmDeleteButton.disabled = false;
      get('cancelDelete').disabled = false;
      closeDelete();
    }
  });

  // Đổi trạng thái → gửi form tìm kiếm, quay về trang 1
  get('statusFilter')?.addEventListener('change', event => {
    event.target.form.requestSubmit();
  });

  clearForm();

})();

