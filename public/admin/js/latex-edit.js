"use strict";

(() => {
  const form = document.getElementById("formulaForm");
  if (!form) return;

  const nameInput = document.getElementById("formulaName");
  const latexInput = document.getElementById("formulaLatex");

  const preview = document.getElementById("formulaPreview");
  const error = document.getElementById("formulaError");
  const status = document.getElementById("formulaStatus");
  const submitButton = form.querySelector('[type="submit"]');
  
  let busy = false;



  function renderPreview() {
    const latex = latexInput.value.trim();

    error.hidden = true;
    error.textContent = "";
    preview.replaceChildren();
    preview.classList.toggle("is-empty", !latex);

    if (!latex) {
      preview.textContent = "Nhập mã LaTeX để xem trước.";
      return false;
    }

    if (!window.katex) {
      error.hidden = false;
      error.textContent = "Không tải được KaTeX. Hãy tải lại trang.";
      return false;
    }

    try {
      window.katex.render(latex, preview, {
        displayMode: true,
        throwOnError: true,
        trust: false,
      });

      return true;
    } catch (err) {
      preview.textContent = "Công thức chưa hợp lệ.";
      error.hidden = false;
      error.textContent = err.message || "Mã LaTeX không hợp lệ.";
      return false;
    }
  }

  latexInput.addEventListener("input", () => {
    status.textContent = "";
    renderPreview();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;

    const name = nameInput.value.trim();
    const latex = latexInput.value.trim();
    const html = preview.innerHTML.trim();
    status.textContent = "";
    status.classList.add("is-error");
    const idFormula = form.getAttribute('id-formula');
    if (!name || !latex) {
      status.textContent = "Vui lòng nhập tên và mã LaTeX.";
      return;
    }

    if (!renderPreview()) {
      status.textContent = "Hãy kiểm tra lại công thức trước khi lưu.";
      return;
    }

    busy = true;
    submitButton.disabled = true;
    const originalText = submitButton.textContent;
    submitButton.textContent = "Đang lưu...";

    try {
      const response = await fetch(`/admin/latex/${idFormula}/edit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ name, latex , html }),
      });

      const result = await response.json();

      if (!response.ok || result.code !== "success") {
        throw new Error(result.message || "Không thể lưu công thức.");
      } 
      if(result.code === "success"){
        alert(result.message); 
        window.location.reload();
      } else { 
        alert(result.message);
      }

    } catch (err) {
      status.textContent = err.message || "Không thể kết nối máy chủ.";
    } finally {
      busy = false;
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });

  renderPreview();
})();