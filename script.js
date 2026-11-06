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

  // A single native dialog is active at a time; document persistence remains unchanged.
  const modalSessions = new WeakMap();
  const formSnapshot = target => JSON.stringify([...new FormData(target)]);
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function showDialog(target, dirty = () => false, opener = document.activeElement) {
    document.querySelectorAll('dialog[open]').forEach(other => { if (other !== target) other.close(); });
    modalSessions.set(target, { dirty, opener });
    target.showModal();
    document.body.classList.add('has-modal');
  }
  function allowDiscard(target) {
    return !modalSessions.get(target)?.dirty() || window.confirm('Есть несохранённые изменения. Закрыть без сохранения?');
  }
  function requestClose(target) { if (allowDiscard(target)) target.close(); }
  document.querySelectorAll('dialog').forEach(target => {
    target.addEventListener('cancel', event => { event.preventDefault(); requestClose(target); });
    let pressedOutside = false;
    const outside = event => {
      const rect = target.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    target.addEventListener('pointerdown', event => { pressedOutside = event.target === target && outside(event); });
    target.addEventListener('click', event => { if (pressedOutside && event.target === target && outside(event)) requestClose(target); pressedOutside = false; });
    target.addEventListener('close', () => {
      if (document.querySelector('dialog[open]')) return;
      document.body.classList.remove('has-modal');
      const opener = modalSessions.get(target)?.opener;
      (opener?.isConnected && opener.getClientRects().length ? opener : query('[data-create]')).focus();
    });
    target.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...target.querySelectorAll('button, input, textarea, select, a[href], [tabindex="0"]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  });
  window.addEventListener('beforeunload', event => {
    const active = document.querySelector('dialog[open]');
    if (active && modalSessions.get(active)?.dirty()) { event.preventDefault(); event.returnValue = ''; }
  });

  const center = query('#creation-dialog');
  const detail = query('#creation-detail');
  const catalog = query('#creation-catalog');
  const templateSearch = query('#template-search');
  const centerError = query('#creation-error');
  const categories = [
    ['all', 'Все шаблоны', 'grid'], ['mine', 'Мои шаблоны', 'star'],
    ['quick', 'Быстрое создание', 'plus'], ['internal', 'Внутренние документы', 'inbox'],
    ['standard', 'Стандартные', 'doc'], ['accounting', 'Бухгалтерские', 'wallet'], ['hr', 'Кадровые', 'user']
  ];
  const categoryName = key => categories.find(item => item[0] === key)?.[1] ?? '';
  const definitions = [
    ['blank', 'Пустой документ', 'Свободное пространство для новой идеи.', 'quick', 'plus', ''],
    ['memo', 'Служебная записка', 'Зафиксируйте вопрос и предложите решение.', 'quick', 'edit', 'Кому:\nОт кого:\nВопрос:\nПредлагаемое решение:'],
    ['task', 'Рабочая задача', 'Опишите результат, исполнителя и срок.', 'quick', 'check', 'Задача:\nОжидаемый результат:\nОтветственный:\nКритерии готовности:'],
    ['request', 'Внутреннее обращение', 'Передайте вопрос внутри команды.', 'internal', 'inbox', 'Адресат:\nСуть обращения:\nНеобходимая помощь:'],
    ['approval', 'Заявка на согласование', 'Подготовьте материалы для обсуждения.', 'internal', 'check', 'Предмет согласования:\nОснование:\nМатериалы:\nВопросы для проверки:'],
    ['report', 'Отчёт о выполнении', 'Соберите итоги и следующие шаги.', 'internal', 'doc', 'Период:\nВыполненные работы:\nРезультат:\nСледующие шаги:'],
    ['letter', 'Деловое письмо', 'Структурируйте сообщение для адресата.', 'standard', 'mail', 'Адресат:\nТема обращения:\nОсновное сообщение:\nКонтакт для ответа:'],
    ['meeting', 'Протокол встречи', 'Сохраните решения и договорённости.', 'standard', 'user', 'Дата встречи:\nУчастники:\nПовестка:\nРешения:\nСледующие шаги:'],
    ['plan', 'План работ', 'Разбейте цель на понятные действия.', 'standard', 'layers', 'Цель:\nЭтапы работы:\nРесурсы:\nОжидаемый результат:'],
    ['payment', 'Запрос на оплату', 'Соберите сведения о предстоящем платеже.', 'accounting', 'wallet', 'Назначение платежа:\nПолучатель:\nСумма:\nОснование:\nПриложения:'],
    ['expenses', 'Служебная записка о расходах', 'Опишите расходы и их назначение.', 'accounting', 'wallet', 'Назначение расходов:\nПериод:\nПеречень и суммы:\nПодтверждающие документы:'],
    ['application', 'Заявление', 'Начните с простой структуры обращения.', 'hr', 'user', 'Кому:\nОт кого:\nСуть заявления:\nДата:'],
    ['leave', 'Запрос на отпуск', 'Укажите период и план передачи задач.', 'hr', 'clock', 'Период отпуска:\nПродолжительность:\nПередача текущих задач:\nКомментарий:']
  ];
  const builtins = definitions.map(([key, name, description, category, glyph, body]) => ({ id: key, name, description, category, glyph, defaults: { title: key === 'blank' ? '' : name, topic: body, due: '', status: 'draft' } }));
  const stageNames = { pending: 'Ожидает', active: 'В работе', done: 'Завершён' };
  const validText = (value, max) => typeof value === 'string' && value.length <= max;
  const validDue = value => value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)));
  const validDefaults = d => d && validText(d.title, 120) && validText(d.topic, 2000) && validDue(d.due) && Object.hasOwn(statusNames, d.status);
  const validTemplate = t => t && typeof t.id === 'string' && validText(t.name, 120) && t.name.trim() && validText(t.description, 300) && categories.slice(2).some(c => c[0] === t.category) && validDefaults(t.defaults);
  const validProcess = p => p && typeof p.id === 'string' && validText(p.name, 120) && p.name.trim() && validText(p.description, 2000) && Array.isArray(p.stages) && p.stages.length > 0 && p.stages.length <= 50 && p.stages.every(s => s && validText(s.name, 120) && s.name.trim() && Object.hasOwn(stageNames, s.status));
  const stores = {
    templates: { key: 'mars.templates.v1', validate: validTemplate, items: [], raw: null, error: '' },
    processes: { key: 'mars.processes.v1', validate: validProcess, items: [], raw: null, error: '' }
  };
  function readStore(store) {
    store.error = '';
    try {
      const raw = localStorage.getItem(store.key);
      const items = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(items) || !items.every(store.validate) || new Set(items.map(item => item.id)).size !== items.length) throw new Error();
      store.raw = raw; store.items = items;
    } catch { store.items = []; store.error = 'Не удалось прочитать сохранённые данные. Проверьте хранилище браузера. Исходные данные сохранены без изменений.'; }
  }
  function showCenterError(message = '') { centerError.textContent = message; centerError.hidden = !message; }
  function writeStore(store, items) {
    if (store.error) { showCenterError(store.error); return false; }
    try {
      // Avoid overwriting changes made by another tab while this editor is open.
      if (localStorage.getItem(store.key) !== store.raw) { showCenterError('Данные изменены в другой вкладке. Закройте и снова откройте центр, чтобы загрузить актуальную версию.'); return false; }
      const raw = JSON.stringify(items);
      localStorage.setItem(store.key, raw); store.raw = raw; store.items = items;
      showCenterError(); return true;
    } catch { showCenterError('Не удалось сохранить. Проверьте свободное место и разрешения хранилища браузера.'); return false; }
  }
  let mode = 'documents', category = 'all', editorBaseline = '', activeEditor = null, selectedCardId = null;
  const editorDirty = () => activeEditor !== null && formSnapshot(activeEditor) !== editorBaseline;
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function action(label, callback, className = 'secondary-button', glyph) {
    const button = node('button', className); button.type = 'button';
    if (glyph) button.append(icon(glyph));
    button.append(document.createTextNode(label)); button.addEventListener('click', callback); return button;
  }
  function openCreation() {
    closeNavigation();
    Object.values(stores).forEach(readStore);
    activeEditor = null; mode = 'documents'; category = 'all'; templateSearch.value = '';
    showCatalog(false);
    showDialog(center, editorDirty);
    query('#creation-categories').scrollLeft = 0;
    catalog.scrollTop = 0;
    templateSearch.focus();
  }
  function showCatalog(focus = true) {
    activeEditor = null;
    catalog.hidden = false; detail.hidden = true; query('#creation-tools').hidden = false;
    renderCatalog();
    if (focus) {
      const previous = [...query('#creation-grid').children].find(el => el.dataset.id === selectedCardId);
      (previous || templateSearch).focus();
    }
  }
  function openDetail() {
    catalog.hidden = true; query('#creation-tools').hidden = true; detail.hidden = false; detail.replaceChildren();
    const back = action('К шаблонам', () => { if (allowDiscard(center)) showCatalog(); }, 'secondary-button creation-back', 'arrow');
    if (mode === 'processes') back.lastChild.textContent = 'К процессам';
    detail.append(back); detail.scrollTop = 0; showCenterError();
    back.focus();
  }
  function renderCategories() {
    const nav = query('#creation-categories'); nav.replaceChildren(); nav.hidden = mode === 'processes';
    categories.forEach(([key, name, glyph]) => {
      const button = action(name, () => { category = key; renderCatalog(); query(`[data-category="${key}"]`).focus(); }, '', glyph);
      button.dataset.category = key; button.setAttribute('aria-current', String(category === key)); nav.append(button);
    });
  }
  function renderCatalog() {
    const isDocs = mode === 'documents';
    const store = stores[isDocs ? 'templates' : 'processes']; showCenterError(store.error);
    catalog.classList.toggle('is-processes', !isDocs);
    catalog.setAttribute('aria-labelledby', `mode-${mode}`);
    document.querySelectorAll('[data-mode]').forEach(button => { const selected = button.dataset.mode === mode; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
    query('#creation-local-note').textContent = isDocs ? 'Ваши идеи остаются в вашем пространстве' : 'Локальный процесс · Данные хранятся в этом браузере';
    templateSearch.placeholder = isDocs ? 'Найти шаблон по названию или задаче…' : 'Найти локальный процесс…';
    query('#new-template span').textContent = isDocs ? 'Свой шаблон' : 'Новый процесс';
    query('#catalog-title').textContent = isDocs ? categoryName(category) : 'Локальные процессы';
    renderCategories();
    const term = templateSearch.value.trim().toLocaleLowerCase('ru');
    let items = isDocs ? [...builtins, ...stores.templates.items.map(t => ({ ...t, custom: true, glyph: 'doc' }))] : stores.processes.items;
    if (isDocs) items = items.filter(t => category === 'all' || (category === 'mine' ? t.custom : t.category === category));
    items = items.filter(item => `${item.name} ${item.description} ${isDocs ? categoryName(item.category) : item.stages.map(s => s.name).join(' ')}`.toLocaleLowerCase('ru').includes(term));
    query('#catalog-count').textContent = `${isDocs ? 'Шаблонов' : 'Процессов'}: ${items.length}`;
    const grid = query('#creation-grid'); grid.replaceChildren();
    items.forEach(item => {
      const card = action('', () => { selectedCardId = item.id; isDocs ? previewTemplate(item) : editProcess(item); }, 'creation-card');
      card.dataset.id = item.id;
      const emblem = node('span', 'creation-card-icon'); emblem.append(icon(item.glyph || 'flow'));
      const bottom = node('span', 'creation-card-bottom');
      const completed = !isDocs ? item.stages.filter(s => s.status === 'done').length : 0;
      bottom.append(node('span', '', isDocs ? `${item.custom ? 'Мой · ' : ''}${categoryName(item.category)}` : `${completed} из ${item.stages.length} этапов · ${Math.round(completed / item.stages.length * 100)}%`), icon('arrow'));
      card.append(emblem, node('strong', '', item.name), node('p', '', item.description || 'Откройте и продолжите работу с этапами.'), bottom); grid.append(card);
    });
    query('#creation-empty').hidden = items.length !== 0;
    query('#creation-empty h3').textContent = term ? 'Ничего не найдено' : isDocs ? 'Здесь будут ваши шаблоны' : 'Первый шаг к результату';
    query('#creation-empty-text').textContent = term ? 'Попробуйте другое название, описание или категорию.' : isDocs ? 'Сохраните свою заготовку с помощью кнопки «Свой шаблон».' : 'Создайте процесс и отслеживайте каждый этап в одном месте.';
    query('#clear-template-search').hidden = !term;
  }
  function previewTemplate(item) {
    activeEditor = null; openDetail();
    const preview = node('div', 'creation-preview'); const overview = node('div');
    const emblem = node('span', 'creation-card-icon'); emblem.append(icon(item.glyph || 'doc'));
    overview.append(emblem, node('p', 'section-eyebrow', categoryName(item.category)), node('h3', '', item.name), node('p', '', item.description));
    overview.append(node('p', 'dialog-note', item.custom ? 'Ваша заготовка. Все поля можно изменить перед сохранением документа.' : 'Демонстрационная заготовка. Не является официальной юридической формой.'));
    const sheet = node('div', 'template-sheet');
    sheet.append(node('p', 'section-eyebrow', 'ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР'), node('h4', '', item.defaults.title || 'Без названия'), node('pre', '', item.defaults.topic || 'Чистый лист — добавьте название и содержание в следующем шаге.'), node('p', 'dialog-note', `${statusNames[item.defaults.status]} · ${item.defaults.due || 'Без срока'}`));
    preview.append(overview, sheet); detail.append(preview);
    const actions = node('div', 'dialog-actions');
    if (item.custom) {
      actions.append(action('Редактировать', () => editTemplate(item), 'secondary-button', 'edit'));
      actions.append(action('Удалить', () => { if (window.confirm(`Удалить шаблон «${item.name}»? Созданные документы останутся.`) && writeStore(stores.templates, stores.templates.items.filter(t => t.id !== item.id))) { showCatalog(); } }, 'secondary-button', 'trash'));
    }
    actions.append(action('Использовать шаблон', () => {
      const opener = modalSessions.get(center)?.opener;
      openDocument(null, item.id === 'blank' && !item.custom ? { title: '', topic: '', due: '', status: 'draft' } : item.defaults, opener);
    }, 'submit-button'));
    detail.append(actions);
  }
  // Editor markup is static; all stored/user strings are assigned through value/textContent.
  function editorForm(heading, markup) {
    openDetail();
    const editor = node('form', 'creation-editor'); editor.noValidate = true;
    editor.innerHTML = markup;
    editor.prepend(node('h3', '', heading));
    const actions = node('div', 'dialog-actions');
    actions.append(action('Отмена', () => { if (allowDiscard(center)) showCatalog(); }));
    const save = node('button', 'submit-button', 'Сохранить'); save.type = 'submit'; actions.append(save);
    editor.append(actions); detail.append(editor); return editor;
  }
  function beginEditing(editor) { activeEditor = editor; editorBaseline = formSnapshot(editor); editor.querySelector('input').focus(); }
  function validateEditor(editor) {
    if (!editor.reportValidity()) return false;
    const blank = [...editor.querySelectorAll('[required]')].find(input => !input.value.trim());
    if (blank) { showCenterError('Заполните обязательные поля: значение не может состоять из пробелов.'); blank.focus(); return false; }
    return true;
  }
  function editTemplate(item = null) {
    const editor = editorForm(item ? 'Редактировать шаблон' : 'Свой шаблон', `
      <div><label for="template-name">Название шаблона *</label><input id="template-name" name="name" maxlength="120" required /></div>
      <div><label for="template-description">Короткое описание</label><textarea id="template-description" name="description" maxlength="300" rows="2"></textarea></div>
      <div><label for="template-category">Категория</label><select id="template-category" name="category"></select></div>
      <fieldset><legend>Поля нового документа по умолчанию</legend>
      <div><label for="template-title">Название документа</label><input id="template-title" name="title" maxlength="120" /></div>
      <div><label for="template-topic">Тема и содержание</label><textarea id="template-topic" name="topic" maxlength="2000" rows="4"></textarea></div>
      <div class="dialog-columns"><div><label for="template-due">Срок</label><input id="template-due" name="due" type="date" /></div><div><label for="template-status">Статус</label><select id="template-status" name="status"></select></div></div></fieldset>`);
    categories.slice(2).forEach(([value, label]) => editor.elements.category.add(new Option(label, value)));
    Object.entries(statusNames).forEach(([value, label]) => editor.elements.status.add(new Option(label, value)));
    for (const [key, value] of Object.entries({ name: item?.name || '', description: item?.description || '', category: item?.category || (categories.slice(2).some(c => c[0] === category) ? category : 'quick'), ...(item?.defaults || {}) })) editor.elements[key].value = value;
    editor.addEventListener('submit', event => {
      event.preventDefault(); if (!validateEditor(editor)) return;
      const data = Object.fromEntries(new FormData(editor));
      const next = { id: item?.id || id(), name: data.name.trim(), description: data.description.trim(), category: data.category, defaults: { title: data.title.trim(), topic: data.topic.trim(), due: data.due, status: data.status } };
      const items = item ? stores.templates.items.map(t => t.id === item.id ? next : t) : [...stores.templates.items, next];
      if (writeStore(stores.templates, items)) { category = 'mine'; templateSearch.value = ''; selectedCardId = next.id; showCatalog(); }
    });
    beginEditing(editor);
  }
  function editProcess(item = null) {
    const editor = editorForm(item ? 'Редактировать процесс' : 'Новый локальный процесс', `
      <p class="dialog-note">Локальный процесс · Данные хранятся в этом браузере</p>
      <div><label for="process-name">Название процесса *</label><input id="process-name" name="name" maxlength="120" required /></div>
      <div><label for="process-description">Описание</label><textarea id="process-description" name="description" maxlength="2000" rows="2"></textarea></div>
      <div class="creation-progress"><progress id="process-progress" value="0" max="100" aria-label="Общий прогресс"></progress><span id="process-progress-text" role="status"></span></div>
      <div id="process-stages" aria-label="Последовательность этапов"></div>`);
    editor.elements.name.value = item?.name || 'Согласование документа'; editor.elements.description.value = item?.description || '';
    const stages = editor.querySelector('#process-stages');
    function updateProgress() {
      const fields = [...stages.querySelectorAll('select')];
      const completed = fields.filter(f => f.value === 'done').length;
      const percent = fields.length ? Math.round(completed / fields.length * 100) : 0;
      editor.querySelector('progress').value = percent;
      query('#process-progress-text').textContent = `${completed}/${fields.length} · ${percent}%`;
      [...stages.children].forEach((row, index) => { row.firstChild.textContent = String(index + 1).padStart(2, '0'); row.querySelector('button').setAttribute('aria-label', `Удалить этап ${index + 1}`); });
    }
    let stageNumber = 0;
    function addStage(stage = { name: '', status: 'pending' }, focus = true) {
      if (stages.children.length >= 50) { showCenterError('В одном процессе может быть не более 50 этапов.'); return; }
      stageNumber++;
      const row = node('div', 'creation-step'); row.append(node('span'));
      const label = node('label', '', 'Название этапа'); const input = node('input'); input.name = 'stage-name'; input.id = `stage-name-${stageNumber}`; input.maxLength = 120; input.required = true; input.value = stage.name; label.htmlFor = input.id; label.append(input);
      const stateLabel = node('label', '', 'Статус'); const select = node('select'); select.name = 'stage-status'; select.id = `stage-status-${stageNumber}`; stateLabel.htmlFor = select.id;
      Object.entries(stageNames).forEach(([value, text]) => select.add(new Option(text, value))); select.value = stage.status; stateLabel.append(select); select.addEventListener('change', updateProgress);
      const remove = action('', () => { row.remove(); updateProgress(); (stages.querySelector('input') || add).focus(); }, 'icon-button', 'trash');
      row.append(label, stateLabel, remove); stages.append(row); updateProgress(); if (focus) input.focus();
    }
    const add = action('Добавить этап', () => addStage(), 'secondary-button', 'plus'); stages.after(add);
    (item?.stages || ['Подготовка', 'Проверка', 'Согласование', 'Завершение'].map(name => ({ name, status: 'pending' }))).forEach(stage => addStage(stage, false));
    if (item) editor.querySelector('.dialog-actions').prepend(action('Удалить процесс', () => {
      if (window.confirm(`Удалить процесс «${item.name}» со всеми этапами?`) && writeStore(stores.processes, stores.processes.items.filter(p => p.id !== item.id))) showCatalog();
    }, 'secondary-button', 'trash'));
    editor.addEventListener('submit', event => {
      event.preventDefault(); if (!validateEditor(editor)) return;
      if (!stages.children.length) { showCenterError('Добавьте хотя бы один этап.'); add.focus(); return; }
      const next = { id: item?.id || id(), name: editor.elements.name.value.trim(), description: editor.elements.description.value.trim(), stages: [...stages.children].map(row => ({ name: row.querySelector('input').value.trim(), status: row.querySelector('select').value })) };
      if (writeStore(stores.processes, item ? stores.processes.items.map(p => p.id === item.id ? next : p) : [...stores.processes.items, next])) { templateSearch.value = ''; selectedCardId = next.id; showCatalog(); }
    });
    beginEditing(editor);
  }
  query('#new-template').addEventListener('click', () => mode === 'documents' ? editTemplate() : editProcess());
  templateSearch.addEventListener('input', renderCatalog);
  query('#clear-template-search').addEventListener('click', () => { templateSearch.value = ''; renderCatalog(); templateSearch.focus(); });
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => { mode = button.dataset.mode; templateSearch.value = ''; renderCatalog(); });
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'documents' : event.key === 'End' ? 'processes' : mode === 'documents' ? 'processes' : 'documents';
      query(`#mode-${next}`).click(); query(`#mode-${next}`).focus();
    });
  });

  function openDocument(item = null, defaults = null, opener = document.activeElement) {
    editingId = item?.id ?? null;
    form.reset();
    title.value = item?.title ?? defaults?.title ?? '';
    topic.value = item?.topic ?? defaults?.topic ?? '';
    due.value = item?.due ?? defaults?.due ?? '';
    documentStatus.value = item?.status ?? defaults?.status ?? (Object.hasOwn(statusNames, section) ? section : 'draft');
    query('#document-dialog-title').textContent = item ? 'Редактирование документа' : 'Новый документ';
    error.hidden = true;
    title.removeAttribute('aria-invalid');
    const baseline = formSnapshot(form);
    showDialog(dialog, () => formSnapshot(form) !== baseline, opener);
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

  document.querySelectorAll('[data-create]').forEach(button => button.addEventListener('click', () => openCreation()));
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
    showDialog(query('#info-dialog'));
  }));
  query('#compact-view').addEventListener('change', event => document.body.classList.toggle('is-compact', event.target.checked));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => requestClose(query(`#${button.dataset.close}`))));

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
