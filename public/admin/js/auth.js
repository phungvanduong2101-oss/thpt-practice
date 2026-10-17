'use strict';
/**
 * THPT Practice — Đăng nhập / Đăng ký (frontend demo).
 * KHÔNG lưu hoặc giả lập tài khoản bằng localStorage; KHÔNG xác thực thật.
 * Thay submitLogin() / submitRegister() bằng lời gọi API ExpressJS khi có backend.
 */
(() => {
  const form = document.getElementById('authForm');
  if (!form) return;

  const mode = document.body.dataset.authPage;
  const notice = document.getElementById('authNotice');
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fieldNames = mode === 'register'
    ? ['fullName', 'email', 'password', 'confirmPassword']
    : ['email', 'password'];

  const get = (name) => document.getElementById(name);

  function setNotice(text, type = 'info') {
    notice.textContent = text;
    notice.hidden = false;
    notice.classList.toggle('is-success', type === 'success');
  }

  function setFieldError(name, message) {
    const field = get(name);
    const error = get(`${name}Error`);
    if (!field || !error) return;
    field.setAttribute('aria-invalid', String(Boolean(message)));
    error.textContent = message;
  }

  function passwordScore(value) {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score++;
    if (value.length >= 12) score++;
    if (/[^\da-zA-Z]/.test(value)) score++;
    return score;
  }

  function updateStrength() {
    if (mode !== 'register') return;
    const pw = get('password').value;
    const meter = document.querySelector('.auth-password-meter');
    const hint = get('passwordStrength');
    const score = passwordScore(pw);
    meter.dataset.level = pw ? String(score || 1) : '0';
    hint.textContent = !pw
      ? 'Tối thiểu 8 ký tự, gồm chữ và số.'
      : ['Mật khẩu còn yếu', 'Mật khẩu còn yếu', 'Mật khẩu khá', 'Mật khẩu tốt', 'Mật khẩu mạnh'][score];
  }

  function validate(name) {
    const value = get(name).value;
    const trimmed = value.trim();
    let error = '';

    if (name === 'fullName') {
      if (trimmed.length < 2) error = 'Vui lòng nhập họ tên ít nhất 2 ký tự.';
      else if (trimmed.length > 80) error = 'Họ tên không được quá 80 ký tự.';
    }
    if (name === 'email') {
      if (!trimmed) error = 'Vui lòng nhập email.';
      else if (!emailPattern.test(trimmed)) error = 'Email không hợp lệ.';
    }
    if (name === 'password') {
      if (!value) error = 'Vui lòng nhập mật khẩu.';
      else if (mode === 'register' && (value.length < 8 || !/[a-zA-Z]/.test(value) || !/\d/.test(value))) {
        error = 'Mật khẩu cần ít nhất 8 ký tự, gồm chữ và số.';
      }
    }
    if (name === 'confirmPassword') {
      if (!value) error = 'Vui lòng xác nhận mật khẩu.';
      else if (value !== get('password').value) error = 'Mật khẩu xác nhận không khớp.';
    }
    setFieldError(name, error);
    return !error;
  }

  // Eye buttons use local SVG paths, no icon CDN required.
  const eyeOpen = '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>';
  const eyeClosed = '<path d="M3 3 21 21M10.6 6.2C11.05 6.07 11.5 6 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.05 3.54M6 7.2C3.5 9.0 2 12 2 12s3.6 6 10 6c1.56 0 2.97-.36 4.2-.9"/><path d="M9.88 9.88a3 3 0 0 0 4.24 4.24"/>';

  document.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = get(button.dataset.toggle);
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(reveal));
      button.setAttribute('aria-label', reveal ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      button.querySelector('svg').innerHTML = reveal ? eyeClosed : eyeOpen;
    });
  });

  fieldNames.forEach((name) => {
    const input = get(name);
    input.addEventListener('blur', () => validate(name));
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validate(name);
      if (mode === 'register' && name === 'password') {
        updateStrength();
        if (get('confirmPassword').value) validate('confirmPassword');
      }
    });
  });

  const forgotLink = get('forgotPassword');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      setNotice('Chức năng quên mật khẩu sẽ được bổ sung khi kết nối API.');
    });
  }
  const termsLink = get('termsLink');
  if (termsLink) {
    termsLink.addEventListener('click', (e) => {
      e.preventDefault();
      setNotice('Trang điều khoản đang được hoàn thiện. Đây là giao diện minh họa.');
    });
  }

  /** Thay bằng POST /api/auth/login khi backend sẵn sàng. */
  async function submitLogin(payload) { 
       fetch('/admin/auth/login', {  
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
       }).then(res => res.json()).then(data => {
         if(data.code == 'success'){  
          alert(data.message);
          window.location.href = '/admin/dashboard'; 
         } else { 
          alert(data.message);
       }
       });
  }

  /** Thay bằng POST /api/auth/register khi backend sẵn sàng. */
  async function submitRegister(payload) { 
       fetch('/admin/auth/register', {  
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
       }).then(res => res.json()).then(data => {
         if(data.code == 'success'){  
          alert(data.message);
          window.location.href = '/admin/auth/login'; 
         } else { 
          alert(data.message);
       }
       });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    notice.hidden = true;
    const validFields = fieldNames.map(validate);
    let valid = validFields.every(Boolean);
    if (mode === 'register') {
      const termsError = get('termsError');
      termsError.textContent = get('terms').checked ? '' : 'Bạn cần đồng ý với điều khoản để tiếp tục.';
      if (!get('terms').checked) valid = false;
    }
    if (!valid) {
      const invalid = fieldNames.find(name => get(name).getAttribute('aria-invalid') === 'true');
      if (invalid) get(invalid).focus();
      else get('terms')?.focus();
      return;
    }
    const payload = {
      email: get('email').value.trim(),
      password: get('password').value,
      ...(mode === 'register' ? { fullName: get('fullName').value.trim() } : { remember: get('remember').checked })
    };
    const submit = get('authSubmit');
    try {
      submit.disabled = true;
      if (mode === 'login') await submitLogin(payload);
      else await submitRegister(payload);
    } catch {
      setNotice('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      submit.disabled = false;
      // Do not retain password in JS state beyond this scope.
    }
  });
})();
