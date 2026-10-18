'use strict';

(() => {
  const get = id => document.getElementById(id);

  const form = get('topicForm');
  if (!form) return;

  const subjectInput = get('topicSubject');
  const nameInput = get('topicName');
  const codeInput = get('topicCode');
  const descriptionInput = get('topicDescription');
  const activeInput = get('topicActive');
  const saveButton = get('saveButton');

  const deleteModal = get('deleteModal');
  const cancelDelete = get('cancelDelete');
  const confirmDelete = get('confirmDelete');

  let editingId = null;
  let deletingId = null;
  let manuallyEditedCode = false;
  let previousFocus = null;


  function setError(input, errorId, message) {
    get(errorId).textContent = message;
    input.classList.toggle('is-invalid', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function clearErrors() {
    setError(subjectInput, 'subjectError', '');
    setError(nameInput, 'nameError', '');
    setError(codeInput, 'codeError', '');
  }

  function updatePreview() {
    const selected = subjectInput.selectedOptions[0];

    const subjectName = subjectInput.value
      ? selected?.textContent || 'Chưa chọn môn'
      : 'Chưa chọn môn';

    get('previewName').textContent =
      nameInput.value.trim() || 'Tên chuyên đề';

    get('previewCode').textContent =
      `${codeInput.value.trim() || 'MACHUYENDE'} · ${subjectName}`;

    get('descriptionCount').textContent =
      descriptionInput.value.length;
  }

  function focusForm() {
    get('formPanel').scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    nameInput.focus({ preventScroll: true });
  }

  function clearForm(focus = false) {
    form.reset();

    editingId = null;
    manuallyEditedCode = false;

    clearErrors();

    get('formTitle').textContent = 'Tạo chuyên đề mới';
    get('formSubtitle').textContent =
      'Nhập thông tin cho chuyên đề thuộc một môn học.';
    get('saveButtonText').textContent = 'Thêm chuyên đề';

    saveButton.querySelector('use')
      ?.setAttribute('href', '#i-plus');

    updatePreview();

    if (focus) focusForm();
  }

  function validate() {
    clearErrors();

    const selected = subjectInput.selectedOptions[0];
    const name = nameInput.value.trim().replace(/\s+/g, ' ');
    const code = codeInput.value.trim().toUpperCase();

    let valid = true;

    if (!subjectInput.value || !selected || selected.disabled) {
      setError(
        subjectInput,
        'subjectError',
        'Hãy chọn môn học đang hoạt động.'
      );
      valid = false;
    }

    if (name.length < 2 || name.length > 100) {
      setError(
        nameInput,
        'nameError',
        'Tên chuyên đề cần từ 2 đến 100 ký tự.'
      );
      valid = false;
    }

    if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(code)) {
      setError(
        codeInput,
        'codeError',
        'Mã chuyên đề gồm 2–30 ký tự, bắt đầu bằng chữ; chỉ dùng A–Z, số và _.'
      );
      valid = false;
    }

    if (descriptionInput.value.length > 500) {
      alert('Mô tả không được vượt quá 500 ký tự.');
      descriptionInput.focus();
      return false;
    }

    if (!valid) {
      form.querySelector('[aria-invalid="true"]')?.focus();
    }

    return valid;
  }


  // Tự tạo mã và cập nhật xem trước
  nameInput.addEventListener('input', () => {
    if (!manuallyEditedCode) {
      codeInput.value = makeCode(nameInput.value,30);
    }

    setError(nameInput, 'nameError', '');
    updatePreview();
  });

  codeInput.addEventListener('input', () => {
    manuallyEditedCode = true;

    codeInput.value = codeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');

    setError(codeInput, 'codeError', '');
    updatePreview();
  });

  subjectInput.addEventListener('change', () => {
    setError(subjectInput, 'subjectError', '');
    updatePreview();
  });

  descriptionInput.addEventListener('input', updatePreview);

  get('resetButton').addEventListener('click', () => {
    if (!saveButton.disabled) clearForm(true);
  });

  get('newTopicButton').addEventListener('click', () => {
    if (!saveButton.disabled) clearForm(true);
  });

  // Tạo / cập nhật chuyên đề
  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (saveButton.disabled || !validate()) return;

    const payload = {
      subjectId: subjectInput.value,
      name: nameInput.value.trim().replace(/\s+/g, ' '),
      code: codeInput.value.trim().toUpperCase(),
      description: descriptionInput.value.trim(),
      active: activeInput.checked,
    };

    const url = editingId
      ? `/admin/topics/${encodeURIComponent(editingId)}`
      : '/admin/topics/create';

    const method = editingId ? 'PATCH' : 'POST';

    try {
      saveButton.disabled = true;

      const data = await request(url, method, payload);
      if (!data) return;

      alert(data.message);
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });

  // Đóng modal xóa
  function closeDelete() {
    if (confirmDelete.disabled) return;

    deleteModal.hidden = true;
    deletingId = null;

    previousFocus?.focus();
    previousFocus = null;
  }

  // Nút sửa / xóa từ bảng do Pug render
  get('topicRows').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || saveButton.disabled || confirmDelete.disabled) return;

    if (button.dataset.action === 'edit') {
      editingId = button.dataset.id;
      manuallyEditedCode = true;

      subjectInput.value = button.dataset.subjectId || '';
      nameInput.value = button.dataset.name || '';
      codeInput.value = button.dataset.code || '';
      descriptionInput.value = button.dataset.description || '';
      activeInput.checked = button.dataset.active === 'true';

      clearErrors();
      updatePreview();

      get('formTitle').textContent = 'Chỉnh sửa chuyên đề';
      get('formSubtitle').textContent =
        `Cập nhật chuyên đề “${nameInput.value}”.`;
      get('saveButtonText').textContent = 'Lưu thay đổi';

      saveButton.querySelector('use')
        ?.setAttribute('href', '#i-save');

      focusForm();
    }

    if (button.dataset.action === 'delete') {
      deletingId = button.dataset.id;
      previousFocus = button;

      get('deleteDescription').textContent =
        `Bạn có chắc muốn xóa chuyên đề “${button.dataset.name || ''}”? Thao tác không thể hoàn tác.`;

      deleteModal.hidden = false;
      cancelDelete.focus();
    }
  });

  cancelDelete.addEventListener('click', closeDelete);

  deleteModal.addEventListener('click', event => {
    if (event.target === deleteModal) closeDelete();
  });

  document.addEventListener('keydown', event => {
    if (deleteModal.hidden) return;

    if (event.key === 'Escape') {
      closeDelete();
    }

    if (event.key === 'Tab' && !confirmDelete.disabled) {
      if (event.shiftKey && document.activeElement === cancelDelete) {
        event.preventDefault();
        confirmDelete.focus();
      } else if (!event.shiftKey && document.activeElement === confirmDelete) {
        event.preventDefault();
        cancelDelete.focus();
      }
    }
  });

  // Xác nhận xóa trên server
  confirmDelete.addEventListener('click', async () => {
    if (!deletingId || confirmDelete.disabled) return;

    const id = deletingId;

    try {
      confirmDelete.disabled = true;
      cancelDelete.disabled = true;

      const data = await request(
        `/admin/topics/${encodeURIComponent(id)}`,
        'DELETE'
      );

      if (!data) return;

      alert(data.message);
      window.location.reload();
    } catch (error) {
      alert(error.message);
    } finally {
      confirmDelete.disabled = false;
      cancelDelete.disabled = false;
      closeDelete();
    }
  });



  // Search dùng Enter/nút Tìm kiếm.
  // Phân trang dùng các link pageUrl trong Pug.
  clearForm();
})();