(() => {
  'use strict';

  const form = document.querySelector('#login-form');
  if (!form) return;
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
    window.location.assign('./dashboard.html');
  });

  document.querySelector('#forgot-password').addEventListener('click', () => {
    showStatus('Для восстановления доступа обратитесь к администратору системы.');
  });
})();

(() => {
  'use strict';
  if (!document.body.classList.contains('workspace')) return;

  const storageKey = 'mars.documents.v1';
  const statusNames = { draft: 'Черновик', inbox: 'Входящий', progress: 'В работе', done: 'Завершён', archive: 'В архиве' };
  const sections = {
    all: ['Документы', 'Всё для работы с документами — в одном месте.'],
    inbox: ['Входящие', 'Документы, которые ждут вашего внимания.'],
    progress: ['В работе', 'Текущие документы и ближайшие сроки.'],
    done: ['Завершённые', 'Документы, работа над которыми закончена.'],
    draft: ['Черновики', 'Идеи и документы, которые ещё готовятся.'],
    favorites: ['Избранное', 'Важные документы всегда под рукой.'],
    archive: ['Архив', 'Сохранённые документы для будущего обращения.']
  };
  const query = (selector) => document.querySelector(selector);
  const search = query('#document-search');
  const statusFilter = query('#status-filter');
  const sort = query('#sort-order');
  const dialog = query('#document-dialog');
  const form = query('#document-form');
  const title = query('#document-title');
  const topic = query('#document-topic');
  const due = query('#document-due');
  const documentStatus = query('#document-status');
  const error = query('#document-error');
  const sidebar = query('#app-sidebar');
  const main = query('#workspace-main');
  const menuButton = query('#open-navigation');
  let documents = [];
  let section = 'all';
  let editingId = null;
  let toastTimer;
  let storageReadable = true;

  function notify(message) {
    clearTimeout(toastTimer);
    query('#workspace-toast').textContent = message;
    query('#workspace-toast').hidden = false;
    toastTimer = setTimeout(() => { query('#workspace-toast').hidden = true; }, 4500);
  }

  // Only metadata is stored locally; login credentials never enter storage.
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.every(item =>
        item && typeof item.id === 'string' && typeof item.title === 'string' &&
        typeof item.topic === 'string' && typeof item.due === 'string' &&
        (item.due === '' || /^\d{4}-\d{2}-\d{2}$/.test(item.due)) &&
        Object.hasOwn(statusNames, item.status) && typeof item.favorite === 'boolean' &&
        Number.isFinite(item.created))) throw new Error('Invalid stored documents');
      documents = parsed;
    }
  } catch {
    storageReadable = false;
    notify('Локальные данные недоступны. Проверьте разрешения браузера.');
  }

  function persist(next) {
    if (!storageReadable) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      documents = next;
      return true;
    } catch {
      return false;
    }
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  function matchesSection(item, key) {
    return key === 'all' || (key === 'favorites' ? item.favorite : item.status === key);
  }

  function resetFilters() {
    search.value = '';
    statusFilter.value = 'all';
    sort.value = 'newest';
  }

  function render() {
    const [heading, description] = sections[section];
    query('#section-title').firstChild.textContent = `${heading} `;
    query('#section-description').textContent = description;
    query('#breadcrumb-section').textContent = heading;
    document.title = `${heading} — MARS`;
    const inSection = documents.filter(item => matchesSection(item, section));
    query('#section-count').textContent = inSection.length;
    document.querySelectorAll('[data-count]').forEach(el => {
      el.textContent = documents.filter(item => matchesSection(item, el.dataset.count)).length;
    });
    document.querySelectorAll('.nav-item[data-section]').forEach(button => {
      if (button.dataset.section === section) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const term = search.value.trim().toLocaleLowerCase('ru');
    const filtered = inSection.filter(item =>
      (statusFilter.value === 'all' || item.status === statusFilter.value) &&
      `${item.title} ${item.topic}`.toLocaleLowerCase('ru').includes(term));
    filtered.sort((a, b) => sort.value === 'title' ? a.title.localeCompare(b.title, 'ru') :
      sort.value === 'due' ? (a.due || '9999').localeCompare(b.due || '9999') : b.created - a.created);
    query('#filter-indicator').hidden = statusFilter.value === 'all' && sort.value === 'newest';
    query('#result-count').textContent = `Показано: ${filtered.length} из ${inSection.length}`;
    query('#document-rows').replaceChildren(...filtered.map(makeRow));
    query('#empty-state').hidden = filtered.length > 0;
    const hasFilters = Boolean(term) || statusFilter.value !== 'all';
    query('#empty-title').textContent = hasFilters ? 'Ничего не найдено' : section === 'all' ? 'Здесь будут ваши документы' : 'В этом разделе пока пусто';
    query('#empty-description').textContent = hasFilters ? 'Попробуйте другой запрос или сбросьте фильтры.' : section === 'favorites' ? 'Нажмите на звезду рядом с документом, чтобы добавить его сюда.' : 'Создайте первый документ. Порядок начинается с одного простого шага.';
    query('.empty-eyebrow').textContent = hasFilters ? 'РЕЗУЛЬТАТЫ ПОИСКА' : 'ВСЁ НА СВОЁМ МЕСТЕ';
    query('#empty-action').hidden = hasFilters || section === 'favorites';
  }

  function makeRow(item) {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'document-link';
    link.setAttribute('aria-label', `Открыть документ: ${item.title}`);
    const text = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = item.title;
    const subtitle = document.createElement('small');
    subtitle.textContent = item.topic || 'Без темы';
    text.append(name, subtitle);
    link.append(icon('doc'), text);
    link.addEventListener('click', () => openDocument(item));
    nameCell.append(link);
    const dueCell = document.createElement('td');
    dueCell.textContent = item.due ? new Intl.DateTimeFormat('ru', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${item.due}T12:00:00`)) : 'Не указан';
    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'status-pill';
    badge.dataset.status = item.status;
    badge.textContent = statusNames[item.status];
    statusCell.append(badge);
    const actions = document.createElement('td');
    const favorite = document.createElement('button');
    favorite.type = 'button';
    favorite.className = 'icon-button star-button';
    favorite.setAttribute('aria-pressed', String(item.favorite));
    favorite.setAttribute('aria-label', `${item.favorite ? 'Убрать из избранного' : 'В избранное'}: ${item.title}`);
    favorite.append(icon('star'));
    favorite.addEventListener('click', () => {
      if (persist(documents.map(doc => doc.id === item.id ? { ...doc, favorite: !doc.favorite } : doc))) {
        const index = Array.from(query('#document-rows').children).indexOf(row);
        render();
        const buttons = query('#document-rows').querySelectorAll('.star-button');
        (buttons[Math.min(index, buttons.length - 1)] || query('#section-title')).focus();
      } else notify('Не удалось сохранить. Проверьте доступ к хранилищу браузера.');
    });
    actions.append(favorite);
    row.append(nameCell, dueCell, statusCell, actions);
    return row;
  }

  function openDocument(item = null) {
    editingId = item?.id ?? null;
    form.reset();
    title.value = item?.title ?? '';
    topic.value = item?.topic ?? '';
    due.value = item?.due ?? '';
    documentStatus.value = item?.status ?? (Object.hasOwn(statusNames, section) ? section : 'draft');
    query('#document-dialog-title').textContent = item ? 'Редактирование документа' : 'Новый документ';
    error.hidden = true;
    title.removeAttribute('aria-invalid');
    dialog.showModal();
    title.focus();
  }

  form.noValidate = true;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!title.value.trim() || !form.checkValidity()) {
      error.textContent = 'Введите название и проверьте дату документа.';
      error.hidden = false;
      title.setAttribute('aria-invalid', String(!title.value.trim()));
      title.focus();
      return;
    }
    const existing = documents.find(item => item.id === editingId);
    const item = {
      id: existing?.id ?? (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
      title: title.value.trim(), topic: topic.value.trim(), due: due.value,
      status: documentStatus.value, favorite: existing?.favorite ?? false,
      created: existing?.created ?? Date.now()
    };
    const next = existing ? documents.map(doc => doc.id === editingId ? item : doc) : [...documents, item];
    if (!persist(next)) {
      error.textContent = 'Не удалось сохранить документ. Проверьте свободное место и разрешения браузера.';
      error.hidden = false;
      return;
    }
    section = item.status;
    resetFilters();
    render();
    dialog.close();
    notify(existing ? 'Изменения сохранены' : 'Документ создан');
  });

  document.querySelectorAll('[data-create]').forEach(button => button.addEventListener('click', () => openDocument()));
  document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => {
    section = button.dataset.section;
    resetFilters();
    render();
    closeNavigation();
  }));
  search.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  sort.addEventListener('change', render);
  query('#reset-filters').addEventListener('click', () => { resetFilters(); render(); });
  query('#filter-toggle').addEventListener('click', () => {
    const panel = query('#filter-panel');
    panel.hidden = !panel.hidden;
    query('#filter-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  });

  const info = {
    space: ['Личное пространство', 'Здесь собраны ваши документы, черновики и завершённые задачи. Данные хранятся только в этом браузере; синхронизация и совместный доступ не подключены.'],
    settings: ['Настройки вида', 'Выберите удобную плотность списка. Настройка действует до закрытия страницы.'],
    help: ['Работа с документами', 'Создайте документ, задайте тему и срок. Нажмите на название, чтобы изменить его статус или содержание. Звезда добавляет документ в избранное. Поиск работает внутри выбранного раздела.'],
    profile: ['Ваше пространство', 'Это локальная версия MARS без серверной авторизации. Для выхода используйте пункт «Выйти». Документы останутся в этом браузере; вход не защищает их от других пользователей устройства.']
  };
  document.querySelectorAll('[data-info]').forEach(button => button.addEventListener('click', () => {
    closeNavigation();
    const [heading, description] = info[button.dataset.info];
    query('#info-title').textContent = heading;
    query('#info-description').textContent = description;
    query('#density-option').hidden = button.dataset.info !== 'settings';
    query('#info-dialog').showModal();
  }));
  query('#compact-view').addEventListener('change', event => document.body.classList.toggle('is-compact', event.target.checked));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => query(`#${button.dataset.close}`).close()));

  function closeNavigation() {
    if (!sidebar.classList.contains('is-open')) return;
    sidebar.classList.remove('is-open');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    query('#drawer-backdrop').hidden = true;
    main.inert = false;
    menuButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    sidebar.classList.add('is-open');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    query('#drawer-backdrop').hidden = false;
    main.inert = true;
    menuButton.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    query('#close-navigation').focus();
  });
  query('#close-navigation').addEventListener('click', closeNavigation);
  query('#drawer-backdrop').addEventListener('click', closeNavigation);
  document.addEventListener('keydown', event => {
    if (!sidebar.classList.contains('is-open')) return;
    if (event.key === 'Escape') closeNavigation();
    if (event.key === 'Tab') {
      const controls = [...sidebar.querySelectorAll('button, a[href]')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', event => { if (event.matches) closeNavigation(); });
  query('#section-title').tabIndex = -1;
  render();
})();
