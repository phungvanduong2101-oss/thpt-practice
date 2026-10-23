"use strict";

(() => {
  const get = id => document.getElementById(id);
  const select = get("latexCode");
  if (!select) return;

  const search = get("latexSearch");
  const source = get("latexSource");
  const preview = get("latexPreview");
  const error = get("latexError");
  const status = get("latexStatus");
  const templateCode = get("latexTemplateCode");
  const templatePreview = get("latexTemplatePreview");
  const copyTemplate = get("copyTemplate");
  const addTemplate = get("addTemplate");

  // Giữ lại chính các option được Pug render.
  const placeholder = select.options[0];
  const options = Array.from(select.options).slice(1);

  let cursorStart = 0;
  let cursorEnd = 0;
  let previewTimer;

  function normalize(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  const searchText = new Map(
    options.map(option => [
      option,
      normalize(`${option.textContent} ${option.value}`),
    ])
  );

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function rememberCursor() {
    cursorStart = source.selectionStart;
    cursorEnd = source.selectionEnd;
  }

  ["input", "select", "keyup", "click", "blur"].forEach(eventName => {
    source.addEventListener(eventName, rememberCursor);
  });

  function renderMath(code, target) {
    if (!window.katex) {
      target.textContent = code;
      return false;
    }

    window.katex.render(code, target, {
      displayMode: true,
      throwOnError: true,
      trust: false,
    });

    return true;
  }

  function updateTemplate() {
    const code = select.value;
    const hasCode = Boolean(code.trim());

    templateCode.value = code;
    copyTemplate.disabled = !hasCode;
    addTemplate.disabled = !hasCode;

    if (!hasCode) {
      templatePreview.textContent = "Chọn một mẫu để xem công thức.";
      return;
    }

    try {
      renderMath(code, templatePreview);
    } catch {
      templatePreview.textContent = "Mã mẫu chưa hợp lệ.";
    }
  }

  function filterTemplates() {
    const keyword = normalize(search.value.trim());
    const selectedOption = select.selectedOptions[0];

    const filtered = options.filter(option =>
      searchText.get(option).includes(keyword)
    );

    // Gắn lại các option có sẵn, không dựng danh sách từ JSON.
    select.replaceChildren(placeholder, ...filtered);

    if (filtered.includes(selectedOption)) {
      selectedOption.selected = true;
    } else {
      select.selectedIndex = 0;
    }

    get("latexCount").textContent =
      `${filtered.length}/${options.length}`;

    get("latexEmpty").hidden = filtered.length > 0;
    get("latexEmpty").textContent = options.length
      ? "Không tìm thấy công thức phù hợp."
      : "Chưa có công thức mẫu.";

    select.disabled = filtered.length === 0;

    updateTemplate();
  }

  function updatePreview() {
    clearTimeout(previewTimer);
    error.hidden = true;
    error.textContent = "";

    const code = source.value.trim();

    if (!code) {
      preview.textContent = "Công thức sẽ hiển thị ở đây.";
      return;
    }

    try {
      const rendered = renderMath(code, preview);

      if (!rendered) {
        error.textContent = "Không tải được KaTeX để xem trước.";
        error.hidden = false;
      }
    } catch (err) {
      preview.textContent = "Công thức chưa hợp lệ.";
      error.textContent = err.message;
      error.hidden = false;
    }
  }

  async function copyCode(code) {
    if (!code.trim()) {
      showStatus("Chưa có mã LaTeX để copy.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      showStatus("Đã copy mã LaTeX.");
    } catch {
      showStatus(
        "Không copy được. Chọn mã rồi nhấn Ctrl+C.",
        true
      );
    }
  }

  search.addEventListener("input", filterTemplates);
  select.addEventListener("change", updateTemplate);

  copyTemplate.addEventListener("click", () => {
    copyCode(select.value);
  });

  addTemplate.addEventListener("click", () => {
    const code = select.value;
    if (!code.trim()) return;

    const start = cursorStart;
    const end = cursorEnd;

    source.focus();
    source.setSelectionRange(start, end);
    source.setRangeText(code, start, end, "end");

    rememberCursor();
    updatePreview();
    showStatus("Đã thêm mẫu vào ô soạn.");
  });

  source.addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  });

  get("clearLatex").addEventListener("click", () => {
    source.value = "";
    cursorStart = 0;
    cursorEnd = 0;

    updatePreview();
    source.focus();
    showStatus("");
  });

  get("copyLatex").addEventListener("click", () => {
    copyCode(source.value);
  });

  filterTemplates();
  updatePreview();
})();