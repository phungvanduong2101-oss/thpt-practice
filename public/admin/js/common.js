'use strict';

document.querySelectorAll('[data-filter-form]').forEach(form => {
  form.addEventListener('change', event => {
    const select = event.target;
    if (!select.matches('select')) return;

    const resetId = select.dataset.resetFilter;

    if (resetId) {
      const resetSelect = form.querySelector(`#${resetId}`);
      if (resetSelect) resetSelect.value = 'all';
    }

    form.requestSubmit();
  });
}); 

async function request(url, method = 'GET', payload) {
  const options = {
    method,
    headers: {
      Accept: 'application/json',
    },
  };

  if (payload !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(payload);
  }

  const response = await fetch(url, options);

  if (response.redirected) {
    window.location.href = response.url;
    return null;
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error(`Server không trả JSON (HTTP ${response.status}).`);
  }

  const data = await response.json();

  if (!response.ok || data.code !== 'success') {
    throw new Error(data.message || 'Thao tác thất bại!');
  }

  return data;
} 

function makeCode(value, maxLength) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength);
} 

function setFieldError(input, errorId, message) {
  document.getElementById(errorId).textContent = message;

  const hasError = Boolean(message);

  input.classList.toggle('is-invalid', hasError);
  input.setAttribute('aria-invalid', String(hasError));
} 

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function idOf(value) {
  return String(value?._id ?? value ?? '');
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