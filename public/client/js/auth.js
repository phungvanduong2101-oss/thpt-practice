'use strict';

(() => {
  const get = id => document.getElementById(id);
  const form = get('authForm');

  if (!form) return;

  const isRegister = document.body.dataset.authPage === 'register';
  const notice = get('authNotice');
  const submitButton = get('authSubmit');

  let submitting = false;

  function setNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
    notice.classList.remove('is-success');
  }

  // Hiển thị lỗi trong các phần tử có sẵn của giao diện.
  const validation = new JustValidate(form, {
    focusInvalidField: true,
    errorFieldStyle: {},
    errorLabelStyle: {},
  });

  validation
    .addField('#email', [
      {
        rule: 'required',
        errorMessage: 'Vui lòng nhập email.',
      },
      {
        rule: 'email',
        errorMessage: 'Email không hợp lệ.',
      },
    ], {
      errorsContainer: '#emailError',
    })
    .addField('#password', [
      {
        rule: 'required',
        errorMessage: 'Vui lòng nhập mật khẩu.',
      },
    ], {
      errorsContainer: '#passwordError',
    });

  if (isRegister) {
    validation
      .addField('#fullName', [
        {
          rule: 'required',
          errorMessage: 'Vui lòng nhập họ tên.',
        },
        {
          validator: value => {
            const length = value.trim().length;
            return length >= 2 && length <= 80;
          },
          errorMessage: 'Họ tên cần từ 2 đến 80 ký tự.',
        },
      ], {
        errorsContainer: '#fullNameError',
      })
      // Bổ sung quy tắc mật khẩu dành riêng cho đăng ký.
      .addField('#password', [
        {
          rule: 'required',
          errorMessage: 'Vui lòng nhập mật khẩu.',
        },
        {
          rule: 'minLength',
          value: 8,
          errorMessage: 'Mật khẩu cần ít nhất 8 ký tự.',
        },
        {
          validator: value => {
            return /[a-zA-Z]/.test(value) && /\d/.test(value);
          },
          errorMessage: 'Mật khẩu cần có cả chữ và số.',
        },
      ], {
        errorsContainer: '#passwordError',
      })
      .addField('#confirmPassword', [
        {
          rule: 'required',
          errorMessage: 'Vui lòng xác nhận mật khẩu.',
        },
        {
          validator: value => value === get('password').value,
          errorMessage: 'Mật khẩu xác nhận không khớp.',
        },
      ], {
        errorsContainer: '#confirmPasswordError',
      })
      .addField('#terms', [
        {
          rule: 'required',
          errorMessage: 'Bạn cần đồng ý với điều khoản để tiếp tục.',
        },
      ], {
        errorsContainer: '#termsError',
      });
  }

  // Hiển thị độ mạnh mật khẩu.
  function updateStrength() {
    const password = get('password').value;
    const meter = document.querySelector('.auth-password-meter');
    const hint = get('passwordStrength');

    if (!meter || !hint) return;

    let score = 0;

    if (password.length >= 8) score++;
    if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score++;
    if (password.length >= 12) score++;
    if (/[^\da-zA-Z]/.test(password)) score++;

    if (!password) {
      meter.dataset.level = '0';
      hint.textContent = 'Tối thiểu 8 ký tự, gồm chữ và số.';
      return;
    }

    meter.dataset.level = String(Math.max(1, score));

    const labels = [
      'Mật khẩu còn yếu',
      'Mật khẩu còn yếu',
      'Mật khẩu khá',
      'Mật khẩu tốt',
      'Mật khẩu mạnh',
    ];

    hint.textContent = labels[score];
  }

  if (isRegister) {
    get('password').addEventListener('input', () => {
      updateStrength();

      if (get('confirmPassword').value) {
        validation.revalidateField('#confirmPassword');
      }
    });

    updateStrength();
  }

  // Ẩn/hiện mật khẩu.
  const eyeOpen =
    '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/>' +
    '<circle cx="12" cy="12" r="3"/>';

  const eyeClosed =
    '<path d="M3 3 21 21M10.6 6.2C11.05 6.07 11.5 6 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.05 3.54M6 7.2C3.5 9 2 12 2 12s3.6 6 10 6c1.56 0 2.97-.36 4.2-.9"/>' +
    '<path d="M9.88 9.88a3 3 0 0 0 4.24 4.24"/>';

  document.querySelectorAll('[data-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const input = get(button.dataset.toggle);
      const svg = button.querySelector('svg');

      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('aria-label', 'Ẩn mật khẩu');

        if (svg) svg.innerHTML = eyeClosed;
      } else {
        input.type = 'password';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', 'Hiện mật khẩu');

        if (svg) svg.innerHTML = eyeOpen;
      }
    });
  });

  // Các chức năng chưa triển khai.
  const placeholderLinks = [
    ['forgotPassword', 'Chức năng quên mật khẩu chưa được triển khai.'],
    ['termsLink', 'Trang điều khoản đang được hoàn thiện.'],
  ];

  placeholderLinks.forEach(([id, message]) => {
    const link = get(id);

    if (link) {
      link.addEventListener('click', event => {
        event.preventDefault();
        setNotice(message);
      });
    }
  });

  // Chỉ gửi API sau khi toàn bộ form hợp lệ.
  validation.onSuccess(event => {
    event.preventDefault();

    if (submitting) return;

    notice.hidden = true;

    const payload = {
      email: get('email').value.trim(),
      password: get('password').value,
    };

    let url = '/auth/login';
    let redirectUrl = '/';

    if (isRegister) {
      payload.fullName = get('fullName').value.trim();
      url = '/auth/register';
      redirectUrl = '/auth/login';
    } else {
      payload.remember = get('remember').checked;
    }

    submitting = true;
    submitButton.disabled = true;

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then(response => {
        return response.json().then(data => {
          if (!response.ok || data.code !== 'success') {
            throw new Error(data.message || 'Yêu cầu không thành công.');
          }

          return data;
        });
      })
      .then(data => {
        alert(data.message || 'Thành công.');
        window.location.href = redirectUrl;
      })
      .catch(error => {
        setNotice(error.message || 'Có lỗi xảy ra. Vui lòng thử lại.');
      })
      .finally(() => {
        submitting = false;
        submitButton.disabled = false;
      });
  });
})();