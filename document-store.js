/* Shared, additive document storage. No migrations or destructive recovery. */
(() => {
  'use strict';
  const key = 'mars.documents.v1';
  const statuses = ['draft', 'inbox', 'progress', 'done', 'archive'];
  function read() {
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(rows) || !rows.every(d => d && typeof d.id === 'string' && typeof d.title === 'string' && typeof d.topic === 'string' && typeof d.due === 'string' && statuses.includes(d.status) && typeof d.favorite === 'boolean' && Number.isFinite(d.created))) throw new Error('Не удалось прочитать документы. Исходные данные не изменены.');
    return rows;
  }
  function save(record, baseline) {
    const rows = read(), current = rows.find(d => d.id === record.id) || null;
    if (JSON.stringify(current) !== JSON.stringify(baseline)) throw new Error('Документ изменён или удалён в другой вкладке. Скопируйте изменения и откройте актуальную версию.');
    localStorage.setItem(key, JSON.stringify(current ? rows.map(d => d.id === record.id ? record : d) : [...rows, record]));
  }
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function open(record, defaults = {}) {
    if (record) { location.assign(`./editor.html?id=${encodeURIComponent(record.id)}`); return; }
    const draftId = id();
    sessionStorage.setItem(`mars.editor.seed.${draftId}`, JSON.stringify(defaults));
    location.assign(`./editor.html?draft=${encodeURIComponent(draftId)}`);
  }
  window.MarsDocuments = { key, read, save, id, open };

  let opening;
  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('mars.files.v1', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('files', { keyPath: 'id' }).createIndex('documentId', 'documentId'); };
      request.onerror = () => reject(new Error('Хранилище вложений недоступно.'));
      request.onblocked = () => reject(new Error('Закройте другие вкладки MARS для доступа к вложениям.'));
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); opening = null; }; resolve(request.result); };
    }).catch(error => { opening = null; throw error; });
    return opening;
  }
  async function operation(mode, run) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode); let result, failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure || new Error('Не удалось сохранить вложения. Проверьте доступ и свободное место в браузере.'));
      run(tx.objectStore('files'), value => { result = value; }, message => { failure = new Error(message); tx.abort(); });
    });
  }
  window.MarsFiles = {
    list: documentId => operation('readonly', (store, result) => { const req = store.index('documentId').getAll(documentId); req.onsuccess = () => result(req.result); }),
    add: (documentId, file) => {
      if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('Один файл должен быть не больше 10 МБ.'));
      return operation('readwrite', (store, result, fail) => {
        const req = store.index('documentId').getAll(documentId);
        req.onsuccess = () => {
          if (req.result.reduce((sum, f) => sum + f.size, 0) + file.size > 50 * 1024 * 1024) { fail('Общий размер вложений документа не должен превышать 50 МБ.'); return; }
          const record = { id: id(), documentId, name: file.name, size: file.size, type: file.type, blob: file };
          store.add(record); result(record);
        };
      });
    },
    remove: fileId => operation('readwrite', store => store.delete(fileId)),
    removeDocument: documentId => operation('readwrite', store => {
      const request = store.index('documentId').openCursor(documentId);
      request.onsuccess = () => { const cursor = request.result; if (cursor) { cursor.delete(); cursor.continue(); } };
    })
  };
})();
