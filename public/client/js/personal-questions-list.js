'use strict';
(() => {
  const get = id => document.getElementById(id);
  if (!get('questionList')) return;
  const baseUrl = get('questionPageData').dataset.baseUrl;
  const questions = JSON.parse(get('questionPageData').dataset.bootstrap).questions;
  let busy = false, deletingId = null, currentModal = null, previousFocus = null;
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

    if (!button || busy) return;

    const row = button.closest('[data-id]');

    const question = questions.find(item =>
      idOf(item) === row?.dataset.id
    );

    if (!question) return;

    if (button.dataset.action === 'edit') {
      window.location.assign(`${baseUrl}/${encodeURIComponent(idOf(question))}/edit`);
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
    if (!deletingId || busy) return;

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

})();
