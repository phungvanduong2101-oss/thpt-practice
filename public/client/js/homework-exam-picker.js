"use strict";

function initHomeworkExamPicker(picker, fetchPage = fetch) {
  const search = picker.querySelector('#hw-exam-search');
  const list = picker.querySelector('#hw-exam-list');
  const selectedId = picker.querySelector('#hw-exam-id');
  const status = picker.querySelector('[data-exam-status]');
  const selected = picker.querySelector('[data-exam-selected]');
  const pageLabel = picker.querySelector('[data-exam-page]');
  const previous = picker.querySelector('[data-exam-prev]');
  const next = picker.querySelector('[data-exam-next]');
  const retry = picker.querySelector('[data-exam-retry]');
  let failedPage = 1;
  const empty = picker.querySelector('.hw-search-empty');
  let page = Number(picker.dataset.page), pages = Number(picker.dataset.pages);
  let keyword = '', timer, sequence = 0, pending = false;
  function navigation() {
    previous.disabled = pending || page <= 1;
    next.disabled = pending || page >= pages;
  }
  list.addEventListener('change', event => {
    if (!event.target.matches('input[name="examChoice"]')) return;
    selectedId.value = event.target.value;
    selected.textContent = 'Đã chọn: ' + event.target.closest('[data-exam-title]').dataset.examTitle;
  });
  async function load(requestedPage) {
    clearTimeout(timer);
    const request = ++sequence;
    pending = true;
    retry.hidden = true;
    empty.hidden = true;
    navigation();
    list.setAttribute('aria-busy', 'true');
    status.textContent = 'Đang tải danh sách đề…';
    try {
      const response = await fetchPage(picker.dataset.endpoint + '?' + new URLSearchParams({ keyword, page: requestedPage }), {
        headers: { Accept: 'application/json' }, cache: 'no-store',
      });
      if (request !== sequence) return;
      if (!response.ok || response.redirected) throw new Error('Không thể tải đề. Vui lòng kiểm tra kết nối hoặc đăng nhập lại.');
      const data = await response.json();
      if (request !== sequence) return;
      const fragment = picker.ownerDocument.createDocumentFragment();
      for (const exam of data.items) {
        const label = picker.ownerDocument.createElement('label');
        label.className = 'hw-exam-option';
        label.dataset.examTitle = exam.title;
        const radio = picker.ownerDocument.createElement('input');
        radio.type = 'radio'; radio.name = 'examChoice'; radio.value = String(exam._id);
        radio.checked = radio.value === selectedId.value;
        const text = picker.ownerDocument.createElement('span');
        const title = picker.ownerDocument.createElement('strong');
        title.textContent = exam.title;
        const details = picker.ownerDocument.createElement('small');
        details.textContent = exam.questionCount + ' câu hỏi';
        text.append(title, details); label.append(radio, text); fragment.append(label);
      }
      list.replaceChildren(fragment);
      page = data.currentPage; pages = data.totalPages;
      pageLabel.textContent = `Trang ${page} / ${pages}`;
      status.textContent = `Hiển thị ${data.startItem}–${data.endItem} / ${data.totalItems} đề thi`;
      empty.hidden = data.totalItems !== 0;
    } catch (error) {
      if (request === sequence) {
        status.textContent = error.message || 'Không thể tải đề. Vui lòng thử lại.';
        failedPage = requestedPage; retry.hidden = false;
      }
    } finally {
      if (request === sequence) {
        pending = false; list.setAttribute('aria-busy', 'false'); navigation();
      }
    }
  }
  search.addEventListener('input', () => {
    clearTimeout(timer);
    // Invalidate responses immediately, including while the debounce is waiting.
    sequence++;
    keyword = search.value.trim();
    pending = true; navigation();
    timer = setTimeout(() => load(1), 300);
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); load(1); }
  });
  previous.addEventListener('click', () => load(page - 1));
  next.addEventListener('click', () => load(page + 1));
  retry.addEventListener('click', () => load(failedPage));
  navigation();
  return { load };
}
if (typeof document !== 'undefined') {
  const picker = document.querySelector('#hw-exam-picker');
  if (picker) initHomeworkExamPicker(picker);
}
if (typeof module !== 'undefined') module.exports = { initHomeworkExamPicker };
