(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const body = $('#document-body');
  const error = $('#editor-error');
  const state = $('#save-state');
  const statusLabels = { draft: 'Черновик', inbox: 'Входящий', progress: 'В работе', done: 'Завершён', archive: 'В архиве' };
  const roles = { review: 'Согласующие', approval: 'Утверждающие', execution: 'Исполнители', reading: 'Для ознакомления' };
  const stageLabels = { preparation: 'Подготовка', review: 'Согласование', approval: 'Утверждение', execution: 'Исполнение', completed: 'Завершено' };
  const params = new URLSearchParams(location.search);
  const documentId = params.get('id') || params.get('draft') || MarsDocuments.id();
  const recoveryKey = `mars.editor.recovery.${documentId}`;
  let original = null, record, workflow, baseline, recoveryBase, loaded = false, saving = false, fileBusy = false, people = [], peopleRaw = null, peopleReadable = true;
  let selectedRole, savedRange, confirmAction, fileRecords = [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const plain = value => typeof value === 'string' ? value : '';
  function message(text, notice = false) {
    const target = notice ? $('#editor-notice') : error;
    target.textContent = text; target.hidden = !text;
  }
  function element(tag, text, className) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node;
  }
  function glyph(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
  }
  function button(label, callback, icon, className = 'secondary-button') {
    const node = element('button', icon ? undefined : label, className); node.type = 'button';
    if (icon) { node.append(glyph(icon)); node.setAttribute('aria-label', label); node.title = label; }
    node.addEventListener('click', callback); return node;
  }

  // Rebuild an allowlisted tree in an inert template: never insert untrusted nodes.
  function safeURL(value) {
    const url = plain(value).trim();
    if (!/^(https?:\/\/|mailto:)/i.test(url) || /[\u0000-\u0020]/.test(url)) return null;
    try { const parsed = new URL(url); return (parsed.protocol === 'mailto:' ? Boolean(parsed.pathname) : Boolean(parsed.hostname)) ? url : null; } catch { return null; }
  }
  function sanitize(html) {
    const source = document.createElement('template'); source.innerHTML = plain(html);
    const output = document.createElement('div');
    const allowed = new Set(['P','DIV','BR','SPAN','STRONG','B','EM','I','U','S','STRIKE','UL','OL','LI','H1','H2','H3','BLOCKQUOTE','A','FONT']);
    const discarded = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','IMG','VIDEO','AUDIO','LINK','META','FORM','INPUT','BUTTON','TEXTAREA','SELECT']);
    function copy(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent)); return; }
      if (node.nodeType !== Node.ELEMENT_NODE || discarded.has(node.tagName)) return;
      if (!allowed.has(node.tagName)) { [...node.childNodes].forEach(child => copy(child, parent)); return; }
      const clean = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === 'A') { const href = safeURL(node.getAttribute('href')); if (href) { clean.setAttribute('href', href); clean.setAttribute('rel', 'noopener noreferrer'); } }
      if (node.tagName === 'FONT') {
        const face = node.getAttribute('face'), size = node.getAttribute('size');
        if (['Arial','Georgia','Verdana','Times New Roman'].includes(face)) clean.setAttribute('face', face);
        if (/^[1-7]$/.test(size || '')) clean.setAttribute('size', size);
      }
      const styles = { textAlign: ['left','center','right'], fontWeight: ['bold','normal','400','700'], fontStyle: ['italic','normal'], textDecorationLine: ['underline','line-through','underline line-through','none'], fontSize: ['10px','13px','16px','18px','24px','32px','48px'], fontFamily: ['Arial','Georgia','Verdana','"Times New Roman"','Times New Roman'] };
      for (const [key, values] of Object.entries(styles)) if (values.includes(node.style[key])) clean.style[key] = node.style[key];
      [...node.childNodes].forEach(child => copy(child, clean)); parent.append(clean);
    }
    [...source.content.childNodes].forEach(node => copy(node, output)); return output.innerHTML;
  }
  function textHTML(text) { const div = element('div'); plain(text).split('\n').forEach(line => div.append(element('p', line || '\u00a0'))); return div.innerHTML; }
  function normalizeWorkflow(value) {
    const result = { stage: Object.hasOwn(stageLabels, value?.stage) ? value.stage : 'preparation', approvalEnabled: value?.approvalEnabled === true, participants: {} };
    for (const role of Object.keys(roles)) {
      const entries = value?.participants?.[role] || [];
      if (!Array.isArray(entries) || !entries.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.position === 'string' && typeof p.due === 'string')) throw new Error('Маршрут документа повреждён. Исходная запись не изменена.');
      result.participants[role] = clone(entries);
    }
    return result;
  }
  function snapshot() {
    const fields = Object.fromEntries([...document.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value]));
    return { fields, bodyHTML: sanitize(body.innerHTML), workflow: clone(workflow) };
  }
  function dirty() { return loaded && JSON.stringify(snapshot()) !== baseline; }
  function updateState() {
    if (!loaded) return;
    const changed = dirty(); state.dataset.dirty = String(changed);
    state.textContent = saving ? 'Сохранение…' : changed ? 'Есть несохранённые изменения' : `Сохранено · ${statusLabels[$('#document-status').value]}`;
    $('#editor-heading').textContent = $('#document-title').value.trim() || 'Новый документ';
    document.title = `${$('#editor-heading').textContent} — MARS`;
    try { sessionStorage.setItem(recoveryKey, JSON.stringify({ snapshot: snapshot(), baseline: recoveryBase })); }
    catch { message('Не удалось сохранить резервное состояние вкладки. Сохраните документ перед обновлением страницы.'); }
  }
  function applySnapshot(data) {
    for (const input of document.querySelectorAll('[data-field]')) input.value = plain(data.fields?.[input.dataset.field]);
    body.innerHTML = sanitize(data.bodyHTML); workflow = normalizeWorkflow(data.workflow);
    $('#approval-enabled').checked = workflow.approvalEnabled; renderWorkflow();
  }
  async function load() {
    try {
      const records = MarsDocuments.read(); original = records.find(d => d.id === documentId) || null;
      if (params.has('id') && !original) throw new Error('Документ не найден. Возможно, он был удалён. Вернитесь к списку документов.');
      let defaults = {};
      if (!original) { defaults = JSON.parse(sessionStorage.getItem(`mars.editor.seed.${documentId}`) || '{}'); if (!params.has('draft')) history.replaceState(null, '', `./editor.html?draft=${encodeURIComponent(documentId)}`); }
      record = original || { id: documentId, title: plain(defaults.title), topic: plain(defaults.topic), due: plain(defaults.due), status: Object.hasOwn(statusLabels, defaults.status) ? defaults.status : 'draft', favorite: false, created: Date.now() };
      workflow = normalizeWorkflow(record.workflow);
      const metadata = record.metadata || {};
      const fields = { ...metadata, title: record.title, topic: record.topic, due: record.due, status: record.status, date: metadata.date || new Date(record.created).toLocaleDateString('en-CA'), number: metadata.number || `M-${record.id.slice(0, 8).toUpperCase()}` };
      for (const d of records.filter(d => d.id !== documentId)) $('#related-document').add(new Option(d.title, d.id));
      if (metadata.relatedId && !records.some(d => d.id === metadata.relatedId)) $('#related-document').add(new Option('Документ недоступен', metadata.relatedId));
      applySnapshot({ fields, bodyHTML: record.bodyHTML ?? textHTML(record.topic), workflow });
      baseline = JSON.stringify(snapshot()); recoveryBase = clone(original);
      if (!original) baseline = ''; // An unsaved new document is always a draft until explicitly saved.
      const saved = JSON.parse(sessionStorage.getItem(recoveryKey) || 'null');
      if (saved?.snapshot) {
        applySnapshot(saved.snapshot);
        if (JSON.stringify(saved.baseline) !== JSON.stringify(original)) message('Сохранённый документ изменён в другой вкладке. Восстановлена ваша версия; запись заблокирована до загрузки актуального документа.');
        recoveryBase = saved.baseline;
        message('Состояние редактора восстановлено из этой вкладки.', true);
      }
      loaded = true; updateState(); await refreshFiles();
    } catch (reason) {
      message(reason.message || 'Не удалось загрузить документ. Проверьте доступ к хранилищу.');
      document.querySelectorAll('#editor-main input, #editor-main select, #editor-main button, #editor-main textarea, .rich-toolbar button, .rich-toolbar select, #save-draft, #start-work, #show-route').forEach(el => { el.disabled = true; });
      body.contentEditable = 'false'; state.textContent = 'Документ недоступен';
    }
  }

  // Native dialogs preserve focus, including a mobile route drawer underneath.
  const openers = new WeakMap();
  function showDialog(dialog, focus) {
    openers.set(dialog, document.activeElement); dialog.showModal(); document.body.classList.add('has-modal'); (focus || dialog.querySelector('button, input')).focus();
  }
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('has-modal');
      const opener = openers.get(dialog); if (opener?.isConnected && opener.getClientRects().length) opener.focus();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
  function confirm(title, text, callback, label = 'Подтвердить', danger = false) {
    $('#confirm-title').textContent = title; $('#confirm-message').textContent = text; $('#confirm-accept').textContent = label;
    $('#confirm-accept').classList.toggle('danger-button', danger); confirmAction = callback;
    showDialog($('#confirm-dialog'), $('#confirm-cancel'));
  }
  $('#confirm-cancel').addEventListener('click', () => $('#confirm-dialog').close());
  $('#confirm-dialog').addEventListener('cancel', () => { confirmAction = null; });
  $('#confirm-accept').addEventListener('click', async () => {
    const action = confirmAction; confirmAction = null; $('#confirm-dialog').close();
    if (action) await action();
  });
  $('#editor-back').addEventListener('click', () => {
    const leave = async () => {
      if (fileBusy || saving) { message('Дождитесь завершения сохранения.'); return; }
      try {
        if (loaded && !original) await MarsFiles.removeDocument(documentId);
        sessionStorage.removeItem(recoveryKey); sessionStorage.removeItem(`mars.editor.seed.${documentId}`); loaded = false;
        location.assign('./dashboard.html');
      } catch { message('Не удалось очистить несохранённые данные. Попробуйте ещё раз.'); }
    };
    if (dirty()) confirm('Выйти без сохранения?', 'Изменения текста, реквизитов и маршрута не будут сохранены. Вложения существующего документа уже сохранены отдельно.', leave, 'Выйти без сохранения', true); else leave();
  });
  window.addEventListener('beforeunload', event => { if (dirty() || saving || fileBusy) { event.preventDefault(); event.returnValue = ''; } });
  $('#show-route').addEventListener('click', () => { $('#route-drawer').append($('#route-panel')); showDialog($('#route-drawer'), $('#hide-route')); });
  $('#hide-route').addEventListener('click', () => $('#route-drawer').close());
  $('#route-drawer').addEventListener('close', () => $('#route-slot').append($('#route-panel')));
  matchMedia('(min-width: 1001px)').addEventListener('change', event => { if (event.matches && $('#route-drawer').open) $('#route-drawer').close(); });

  function validate(work = false) {
    message('');
    if (!$('#document-title').value.trim()) { message('Укажите название документа.'); $('#document-title').focus(); return false; }
    for (const input of document.querySelectorAll('[data-field], .participant-list input')) if (!input.checkValidity()) { message('Проверьте поля и даты документа.'); input.reportValidity(); return false; }
    if (body.innerHTML.length > 500000) { message('Текст слишком большой. Допустимо до 500 000 символов разметки.'); return false; }
    if (work) {
      if (!body.textContent.trim()) { message('Добавьте текст документа перед передачей в работу.'); body.focus(); return false; }
      if (!workflow.participants.execution.length) { message('Назначьте хотя бы одного исполнителя.'); return false; }
      if (workflow.participants.execution.some(p => !p.due)) { message('Укажите срок для каждого исполнителя.'); return false; }
      if (workflow.approvalEnabled && !workflow.participants.approval.length) { message('Назначьте утверждающего или отключите этап утверждения.'); return false; }
    }
    return true;
  }
  async function save(status, stage) {
    if (!loaded || saving || fileBusy || !validate(status === 'progress' || status === 'done')) return false;
    saving = true; updateState(); document.querySelectorAll('#save-draft, #save-changes, #start-work, #change-stage').forEach(b => { b.disabled = true; });
    // Yield one frame so the saving indicator is observable without a fake delay.
    await new Promise(resolve => requestAnimationFrame(resolve));
    try {
      const data = snapshot(); data.fields.status = status;
      if (stage) data.workflow.stage = stage;
      const { title, topic, due, status: ignored, ...metadata } = data.fields;
      const next = { ...record, title: title.trim(), topic: topic.trim(), due, status, metadata, bodyHTML: data.bodyHTML, workflow: data.workflow, updated: Date.now() };
      MarsDocuments.save(next, recoveryBase);
      original = clone(next); record = next; recoveryBase = clone(next); workflow = data.workflow;
      $('#document-status').value = status; renderWorkflow(); baseline = JSON.stringify(snapshot());
      history.replaceState(null, '', `./editor.html?id=${encodeURIComponent(documentId)}`);
      sessionStorage.removeItem(`mars.editor.seed.${documentId}`);
      message('Документ сохранён в этом браузере.', true); return true;
    } catch (reason) { message(reason.message || 'Не удалось сохранить документ. Проверьте доступ к хранилищу.'); return false; }
    finally { saving = false; document.querySelectorAll('#save-draft, #save-changes, #start-work, #change-stage').forEach(b => { b.disabled = false; }); updateState(); }
  }
  $('#save-draft').addEventListener('click', () => save('draft', 'preparation'));
  $('#save-changes').addEventListener('click', () => {
    const status = $('#document-status').value;
    const stage = status === 'done' ? 'completed' : status === 'draft' ? 'preparation' : workflow.stage;
    if (status !== original?.status && (status === 'progress' || status === 'done')) { if (validate(true)) confirm('Изменить статус?', `Статус «${statusLabels[status]}» будет установлен локально. Участники не получат уведомлений.`, () => save(status, stage)); }
    else save(status, stage);
  });
  $('#start-work').addEventListener('click', () => {
    if (!validate(true)) return;
    const nextStage = workflow.participants.review.length ? 'review' : workflow.approvalEnabled ? 'approval' : 'execution';
    confirm('Передать в работу?', `Документ «${$('#document-title').value.trim()}» и его маршрут будут сохранены со статусом «В работе». Это локальное действие без отправки другим людям.`, () => save('progress', nextStage), 'Передать в работу');
  });
  $('#change-stage').addEventListener('click', () => {
    const stage = $('#workflow-stage').value;
    if (stage !== 'preparation' && !validate(true)) return;
    if (stage === 'review' && !workflow.participants.review.length) { message('Добавьте согласующего для этапа согласования.'); return; }
    confirm('Изменить этап?', `Перевести локальный маршрут на этап «${stageLabels[stage]}» и сохранить документ?`, () => save(stage === 'completed' ? 'done' : stage === 'preparation' ? 'draft' : 'progress', stage));
  });
  document.querySelectorAll('[data-field]').forEach(input => input.addEventListener('input', updateState));
  $('#approval-enabled').addEventListener('change', event => {
    if (!event.target.checked && workflow.stage === 'approval') { event.target.checked = true; message('Сначала переведите маршрут с этапа утверждения на другой этап.'); return; }
    workflow.approvalEnabled = event.target.checked; renderWorkflow(); updateState();
  });

  // Native editing commands retain the browser undo stack. Selection is restored after toolbar focus.
  function rememberSelection() {
    const selection = getSelection();
    if (selection.rangeCount && body.contains(selection.getRangeAt(0).commonAncestorContainer)) savedRange = selection.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    body.focus(); const selection = getSelection(); selection.removeAllRanges();
    if (savedRange && body.contains(savedRange.commonAncestorContainer)) selection.addRange(savedRange);
    else { const range = document.createRange(); range.selectNodeContents(body); range.collapse(false); selection.addRange(range); }
  }
  function toolbarState() {
    if (!savedRange) return;
    document.querySelectorAll('.rich-toolbar button[data-command]').forEach(button => {
      const command = button.dataset.command;
      if (command === 'undo' || command === 'redo') button.disabled = !document.queryCommandEnabled(command);
      else if (command !== 'removeFormat') button.setAttribute('aria-pressed', String(document.queryCommandState(command)));
    });
    const font = document.queryCommandValue('fontName').replace(/['"]/g, '');
    if ([...$('#font-family').options].some(o => o.value === font)) $('#font-family').value = font;
    const size = document.queryCommandValue('fontSize'); if (/^[1-7]$/.test(size)) $('#font-size').value = size;
    const style = document.queryCommandValue('formatBlock').replace(/[<>]/g, '').toLowerCase();
    $('#paragraph-style').value = ['h1','h2','h3'].includes(style) ? style : 'p';
  }
  document.addEventListener('selectionchange', () => { rememberSelection(); const selection = getSelection(); if (selection.anchorNode && body.contains(selection.anchorNode)) toolbarState(); });
  function command(name, value = null) {
    restoreSelection();
    document.execCommand('styleWithCSS', false, false);
    const success = document.execCommand(name, false, value);
    rememberSelection(); toolbarState(); updateState();
    if (!success && name !== 'removeFormat') message('Браузер не применил форматирование. Выделите текст и повторите действие.');
  }
  document.querySelectorAll('.rich-toolbar button').forEach(button => button.addEventListener('mousedown', event => { event.preventDefault(); rememberSelection(); }));
  document.querySelectorAll('.rich-toolbar [data-command]').forEach(control => {
    const event = control.tagName === 'SELECT' ? 'change' : 'click';
    control.addEventListener(event, () => command(control.dataset.command, control.tagName === 'SELECT' ? control.value : null));
  });
  body.addEventListener('input', () => { rememberSelection(); toolbarState(); updateState(); });
  body.addEventListener('paste', event => {
    event.preventDefault(); const clipboard = event.clipboardData; rememberSelection();
    command('insertHTML', clipboard.getData('text/html') ? sanitize(clipboard.getData('text/html')) : textHTML(clipboard.getData('text/plain')));
  });
  body.addEventListener('drop', event => { event.preventDefault(); message('Для текста используйте вставку. Файлы перетащите в область вложений.'); });
  body.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
  $('#insert-link').addEventListener('click', () => { rememberSelection(); $('#link-url').value = ''; $('#link-error').hidden = true; showDialog($('#link-dialog'), $('#link-url')); });
  $('#link-form').addEventListener('submit', event => {
    event.preventDefault(); const href = safeURL($('#link-url').value);
    if (!href) { $('#link-error').textContent = 'Введите адрес с https://, http:// или mailto: без пробелов.'; $('#link-error').hidden = false; return; }
    $('#link-dialog').close(); restoreSelection();
    if (getSelection().isCollapsed) { const link = element('a', href); link.setAttribute('href', href); command('insertHTML', link.outerHTML); }
    else command('createLink', href);
  });

  function renderWorkflow() {
    const list = $('#workflow-map'); list.replaceChildren(); const select = $('#workflow-stage'); select.replaceChildren();
    for (const [stage, label] of Object.entries(stageLabels)) {
      if (stage === 'approval' && !workflow.approvalEnabled) continue;
      const item = element('li', label); if (workflow.stage === stage) item.setAttribute('aria-current','step'); list.append(item); select.add(new Option(label, stage));
    }
    select.value = workflow.stage;
    const groups = $('#participant-sections');
    const openRoles = new Set([...groups.querySelectorAll('details[open]')].map(d => d.dataset.role)); const first = !groups.children.length;
    groups.replaceChildren();
    for (const [role, label] of Object.entries(roles)) {
      const details = element('details', undefined, 'participant-group'); details.dataset.role = role; details.open = first || openRoles.has(role);
      details.append(element('summary', `${label} · ${workflow.participants[role].length}`));
      const peopleList = element('ol', undefined, 'participant-list');
      workflow.participants[role].forEach((person, index) => {
        const row = element('li'); row.append(element('strong', `${index + 1}. ${person.name}`), element('p', person.position));
        if (role === 'execution') {
          const label = element('label', 'Срок выполнения'); const date = element('input'); date.type = 'date'; date.max = '9999-12-31'; date.value = person.due; date.setAttribute('aria-label', `Срок: ${person.name}`);
          date.addEventListener('input', () => { person.due = date.value; updateState(); }); label.append(date); row.append(label);
        }
        const actions = element('div', undefined, 'participant-actions');
        for (const [offset, icon, label] of [[-1,'up','Выше'],[1,'down','Ниже']]) {
          const move = button(`${label}: ${person.name}`, () => {
            const entries = workflow.participants[role]; [entries[index], entries[index + offset]] = [entries[index + offset], entries[index]]; renderWorkflow(); updateState();
            $('#participant-sections').querySelectorAll(`[data-role="${role}"] .participant-list li`)[index + offset].querySelector('button:not(:disabled)').focus();
          }, icon, 'icon-button'); move.disabled = index + offset < 0 || index + offset >= workflow.participants[role].length; actions.append(move);
        }
        actions.append(button(`Удалить участника: ${person.name}`, () => { workflow.participants[role].splice(index,1); renderWorkflow(); updateState(); $(`[data-role="${role}"] > button`).focus(); }, 'trash','icon-button'));
        row.append(actions); peopleList.append(row);
      });
      details.append(peopleList, button('Добавить участника', () => openPeople(role))); groups.append(details);
    }
  }
  function readPeople() {
    peopleReadable = true;
    try {
      peopleRaw = localStorage.getItem('mars.people.v1'); const parsed = JSON.parse(peopleRaw || '[]');
      if (!Array.isArray(parsed) || !parsed.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.position === 'string')) throw new Error();
      people = parsed;
    } catch { peopleReadable = false; people = []; $('#people-error').textContent = 'Справочник недоступен. Существующие данные не изменены.'; $('#people-error').hidden = false; }
  }
  function openPeople(role) {
    selectedRole = role; $('#people-error').hidden = true; $('#people-search').value = ''; $('#person-form').reset(); readPeople(); renderPeople(); showDialog($('#people-dialog'), $('#people-search'));
  }
  function addPerson(person) {
    if (!workflow.participants[selectedRole].some(p => p.id === person.id)) workflow.participants[selectedRole].push({ ...person, due: '' });
    $('#people-dialog').close(); renderWorkflow(); updateState();
    $(`[data-role="${selectedRole}"] > button`).focus();
  }
  function renderPeople() {
    const results = $('#people-results'); results.replaceChildren(); const term = $('#people-search').value.trim().toLocaleLowerCase('ru');
    const filtered = people.filter(p => `${p.name} ${p.position}`.toLocaleLowerCase('ru').includes(term));
    for (const person of filtered) {
      const exists = workflow.participants[selectedRole].some(p => p.id === person.id);
      const entry = button(`${person.name} · ${person.position}${exists ? ' · Добавлен' : ''}`, () => addPerson(person)); entry.disabled = exists; results.append(entry);
    }
    if (!filtered.length) results.append(element('p', term ? 'Ничего не найдено. Создайте участника ниже.' : 'Справочник пока пуст. Добавьте первого участника.'));
  }
  $('#people-search').addEventListener('input', renderPeople);
  $('#person-form').addEventListener('submit', event => {
    event.preventDefault(); const name = $('#person-name').value.trim(), position = $('#person-position').value.trim();
    if (!name || !position) { $('#people-error').textContent = 'Укажите Ф. И. О. и должность.'; $('#people-error').hidden = false; return; }
    try {
      if (!peopleReadable || localStorage.getItem('mars.people.v1') !== peopleRaw) throw new Error('Справочник изменён или недоступен. Закройте и откройте его повторно.');
      const existing = people.find(p => p.name === name && p.position === position);
      const person = existing || { id: MarsDocuments.id(), name, position };
      const next = existing ? people : [...people,person]; const raw = JSON.stringify(next); localStorage.setItem('mars.people.v1', raw); peopleRaw = raw; people = next; addPerson(person);
    } catch (reason) { $('#people-error').textContent = reason.message || 'Не удалось сохранить участника.'; $('#people-error').hidden = false; }
  });

  async function refreshFiles() {
    try { fileRecords = await MarsFiles.list(documentId); renderFiles(); $('#file-state').textContent = fileRecords.length ? `Вложений: ${fileRecords.length}` : 'Вложений пока нет.'; }
    catch (reason) { $('#file-state').textContent = reason.message; }
  }
  function renderFiles() {
    const list = $('#attachment-list'); list.replaceChildren();
    for (const file of fileRecords) {
      const row = element('li'); const name = element('span', file.name); name.append(element('small', file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} КБ` : `${(file.size / (1024 * 1024)).toFixed(1)} МБ`)); row.append(glyph('attach'), name);
      row.append(button(`Скачать: ${file.name}`, () => {
        const url = URL.createObjectURL(new Blob([file.blob], { type: 'application/octet-stream' })); const link = element('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      },'download','icon-button'));
      row.append(button(`Удалить вложение: ${file.name}`, () => confirm('Удалить вложение?', `Файл «${file.name}» будет удалён из этого браузера.`, async () => {
        try { fileBusy = true; await MarsFiles.remove(file.id); await refreshFiles(); $('#file-state').textContent = 'Вложение удалено.'; }
        catch (reason) { $('#file-state').textContent = reason.message; }
        finally { fileBusy = false; }
      }, 'Удалить файл', true),'trash','icon-button')); list.append(row);
    }
  }
  async function attach(files) {
    if (fileBusy || !loaded) return;
    fileBusy = true; $('#attachment-input').disabled = true; $('#file-state').textContent = 'Сохранение вложений…';
    let count = 0; const failures = [];
    for (const file of files) { try { await MarsFiles.add(documentId, file); count++; } catch (reason) { failures.push(`${file.name}: ${reason.message}`); } }
    await refreshFiles(); $('#file-state').textContent = [count ? `Сохранено файлов: ${count}.` : '', ...failures].join(' ');
    fileBusy = false; $('#attachment-input').disabled = false; $('#attachment-input').value = '';
  }
  $('#attachment-input').addEventListener('change', event => attach([...event.target.files]));
  $('#file-drop').addEventListener('click', () => $('#attachment-input').click());
  $('#file-drop').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#attachment-input').click(); } });
  $('#file-drop').addEventListener('dragover', event => { event.preventDefault(); $('#file-drop').classList.add('is-over'); });
  $('#file-drop').addEventListener('dragleave', () => $('#file-drop').classList.remove('is-over'));
  $('#file-drop').addEventListener('drop', event => { event.preventDefault(); $('#file-drop').classList.remove('is-over'); attach([...event.dataTransfer.files]); });
  // Prevent the browser navigating away when files miss the drop zone.
  window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  window.addEventListener('drop', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  load();
})();
