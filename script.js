(() => {
  'use strict';

  const form = document.querySelector('#login-form');
  const email = document.querySelector('#email');
  const password = document.querySelector('#password');
  const toggle = document.querySelector('.password-toggle');
  const formStatus = document.querySelector('#form-status');

  // Use explicit Russian validation messages in every browser locale.
  form.noValidate = true;

  function showStatus(message) {
    formStatus.textContent = message;
    formStatus.hidden = false;
  }

  function validateField(input) {
    const error = document.querySelector(`#${input.id}-error`);
    let message = '';
    if (!input.value.trim()) {
      message = input === email ? 'Введите электронную почту.' : 'Введите пароль.';
    } else if (input === email && !input.validity.valid) {
      message = 'Укажите почту в формате name@example.com.';
    }
    input.setAttribute('aria-invalid', String(Boolean(message)));
    error.textContent = message;
    error.hidden = !message;
    return !message;
  }

  toggle.addEventListener('click', () => {
    const isVisible = password.type === 'password';
    password.type = isVisible ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(isVisible));
    toggle.setAttribute('aria-label', isVisible ? 'Скрыть пароль' : 'Показать пароль');
  });

  for (const input of [email, password]) {
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validateField(input);
      formStatus.hidden = true;
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    formStatus.hidden = true;
    const results = [email, password].map(validateField);
    if (results.includes(false)) {
      [email, password][results.indexOf(false)].focus();
      return;
    }
    // This screen has no authentication API. Never store or transmit credentials.
    showStatus('Форма заполнена корректно.');
  });

  document.querySelector('#forgot-password').addEventListener('click', () => {
    showStatus('Для восстановления доступа обратитесь к администратору системы.');
  });
})();
