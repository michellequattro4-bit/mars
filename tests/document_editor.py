"""Editor integration tests using the same isolated Chromium/HTTP fixture as dashboard tests."""
import re
import unittest
from pathlib import Path
from playwright.sync_api import expect, Error
import creation_center as fixtures
ROOT, LEGACY = fixtures.ROOT, fixtures.LEGACY

class DocumentEditor(unittest.TestCase):
    setUpClass = classmethod(fixtures.CreationCenter.setUpClass.__func__)
    tearDownClass = classmethod(fixtures.CreationCenter.tearDownClass.__func__)
    tearDown = fixtures.CreationCenter.tearDown

    def setUp(self):
        fixtures.CreationCenter.setUp(self)
        self.dialogs = []
        self.page.on('dialog', lambda d: (self.dialogs.append(d.type), d.accept()))

    def new(self, title='Тестовый документ'):
        self.page.goto(self.url + '/editor.html')
        expect(self.page.locator('#save-state')).to_contain_text('несохранённые')
        self.page.locator('#document-title').fill(title)
        self.page.locator('#document-body').fill('Текст для проверки редактора.')

    def save(self, button='save-draft'):
        self.page.locator('#' + button).click()
        expect(self.page.locator('#save-state')).to_contain_text('Сохранено')
        expect(self.page.locator('#editor-error')).not_to_be_visible()

    def record(self):
        return self.page.evaluate('MarsDocuments.read()[0]')

    def select_body(self):
        self.page.locator('#document-body').evaluate('''el => {
            el.focus(); const range = document.createRange(); range.selectNodeContents(el);
            const s = getSelection(); s.removeAllRanges(); s.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
        }''')

    def click_command(self, command):
        self.page.locator(f'[data-command="{command}"]').click()

    def participant(self, role, name, position='Тестовая роль'):
        self.page.locator(f'[data-role={role}] > button').click()
        self.page.locator('#person-name').fill(name)
        self.page.locator('#person-position').fill(position)
        self.page.locator('#person-form [type=submit]').click()
        expect(self.page.locator('#people-dialog')).not_to_be_visible()

    def executor(self):
        self.participant('execution', 'Тестовый исполнитель')
        self.page.locator('[data-role=execution] input[type=date]').fill('2027-01-20')

    def test_01_metadata_legacy_compatibility_and_no_duplicates(self):
        legacy = dict(LEGACY, extra={'untouched': True})
        self.page.evaluate('d => localStorage.setItem("mars.documents.v1", JSON.stringify([d]))', legacy)
        self.page.reload(); self.page.locator('.document-link').click()
        self.page.wait_for_url('**/editor.html?id=legacy')
        expect(self.page.locator('#document-title')).to_have_value(legacy['title'])
        fields = {'organization':'MARS Studio','number':'LOCAL-17','city':'Город','recipientName':'Получатель теста','recipientPosition':'Координатор','senderName':'Автор теста','senderPosition':'Автор','date':'2027-01-01','topic':'Новая тема','due':'2027-01-22'}
        for field, value in fields.items(): self.page.locator(f'[data-field={field}]').fill(value)
        self.page.locator('#document-body').fill('Обновлённое содержание')
        self.save(); self.save()
        self.assertEqual(self.record()['id'], 'legacy')
        self.assertEqual(self.record()['extra'], {'untouched':True})
        self.assertTrue(self.record()['favorite'])
        self.assertEqual(self.page.evaluate('MarsDocuments.read().length'),1)
        self.page.reload()
        for field, value in fields.items(): expect(self.page.locator(f'[data-field={field}]')).to_have_value(value)
        expect(self.page.locator('#document-body')).to_have_text('Обновлённое содержание')
        self.page.locator('#editor-back').click(); self.page.wait_for_url('**/dashboard.html')
        expect(self.page.locator('.document-link')).to_contain_text(legacy['title'])
        expect(self.page.locator('.star-button')).to_have_attribute('aria-pressed','true')

    def test_02_all_inline_commands_and_clear(self):
        self.new()
        for command, tags in [('bold','b,strong'),('italic','i,em'),('underline','u'),('strikeThrough','strike,s')]:
            with self.subTest(command=command):
                self.page.locator('#document-body').fill('Форматирование')
                self.select_body(); self.click_command(command)
                expect(self.page.locator('#document-body').locator(tags)).to_have_text('Форматирование')
                expect(self.page.locator(f'[data-command={command}]')).to_have_attribute('aria-pressed','true')
                self.click_command('removeFormat')
                expect(self.page.locator('#document-body').locator(tags)).to_have_count(0)

    def test_03_font_sizes_paragraphs_preserve_selection_and_reload(self):
        self.new(); self.page.locator('#document-body').fill('Первый второй')
        self.page.locator('#document-body').evaluate('''el => {
            el.focus(); const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode(); const r = document.createRange(); r.setStart(text,0); r.setEnd(text,6);
            getSelection().removeAllRanges(); getSelection().addRange(r); document.dispatchEvent(new Event('selectionchange'));
        }''')
        for font in ['Georgia','Verdana','Times New Roman','Arial']:
            self.page.locator('#font-family').select_option(font)
            expect(self.page.locator('#document-body font[face]')).to_have_text('Первый')
            expect(self.page.locator('#font-family')).to_have_value(font)
        for size in ['1','2','3','4','5','6','7']:
            self.page.locator('#font-size').select_option(size)
            expect(self.page.locator('#document-body font[size]')).to_have_attribute('size',size)
            expect(self.page.locator('#font-size')).to_have_value(size)
        self.select_body()
        for style in ['h1','h2','h3','p']:
            self.page.locator('#paragraph-style').select_option(style)
            expect(self.page.locator('#document-body > ' + style)).to_have_count(1)
            expect(self.page.locator('#paragraph-style')).to_have_value(style)
        before = self.page.locator('#document-body').inner_html(); self.save(); self.page.reload()
        self.assertEqual(self.page.locator('#document-body').inner_html(), before)

    def test_04_lists_alignment_undo_redo(self):
        self.new()
        for command, tag in [('insertUnorderedList','ul'),('insertOrderedList','ol')]:
            self.page.locator('#document-body').fill('Пункт списка'); self.select_body(); self.click_command(command)
            expect(self.page.locator(f'#document-body {tag} li')).to_have_text('Пункт списка')
            self.click_command(command); expect(self.page.locator(f'#document-body {tag}')).to_have_count(0)
        for command, alignment in [('justifyCenter','center'),('justifyRight','right'),('justifyLeft','left')]:
            self.select_body(); self.click_command(command)
            self.assertTrue(self.page.locator('#document-body').evaluate('(el, alignment) => [...el.querySelectorAll("*")].some(n => getComputedStyle(n).textAlign === alignment)',alignment))
        self.page.locator('#document-body').fill(''); self.page.locator('#document-body').press_sequentially('Undo check')
        before = self.page.locator('#document-body').inner_text()
        self.click_command('undo'); self.assertNotEqual(self.page.locator('#document-body').inner_text(),before)
        self.click_command('redo'); expect(self.page.locator('#document-body')).to_have_text(before)

    def test_05_links_paste_sanitization_and_reload(self):
        self.new(); self.select_body(); self.page.locator('#insert-link').click()
        self.page.locator('#link-url').fill('javascript:alert(1)'); self.page.locator('#link-form [type=submit]').click()
        expect(self.page.locator('#link-error')).to_be_visible()
        self.page.locator('#link-url').fill('https://example.com/test'); self.page.locator('#link-form [type=submit]').click()
        expect(self.page.locator('#document-body a')).to_have_attribute('href','https://example.com/test')
        self.page.locator('#document-body').fill(''); self.select_body()
        self.page.locator('#document-body').evaluate('''el => {
            const dt = new DataTransfer(); dt.setData('text/html', '<p><b>Безопасно</b><img src=x onerror="window.bad=1"><script>window.bad=2</script><a href="javascript:alert(1)">ссылка</a><span style="position:fixed;background:url(https://example.com)">текст</span><svg onload="window.bad=3"></svg></p>');
            el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
        }''')
        html = self.page.locator('#document-body').inner_html()
        for forbidden in ['script','onerror','javascript:','<svg','<img','position:','background:']: self.assertNotIn(forbidden,html)
        expect(self.page.locator('#document-body b')).to_have_text('Безопасно')
        self.assertIsNone(self.page.evaluate('window.bad'))
        self.save(); self.page.reload(); self.assertEqual(self.page.locator('#document-body').inner_html(),html)

    def test_06_participants_search_reorder_remove_persist(self):
        self.new(); self.participant('review','Тест А'); self.participant('review','Тест Б')
        self.page.get_by_role('button',name='Выше: Тест Б',exact=True).click()
        expect(self.page.locator('[data-role=review] li strong').first).to_have_text('1. Тест Б')
        self.page.locator('[data-role=reading] > button').click(); self.page.locator('#people-search').fill('Тест А')
        expect(self.page.locator('#people-results button')).to_have_count(1)
        self.page.locator('#people-results button').click()
        self.executor(); self.participant('approval','Тест утверждения'); self.page.locator('#approval-enabled').check()
        self.save(); self.page.reload()
        expect(self.page.locator('[data-role=review] li strong').first).to_have_text('1. Тест Б')
        expect(self.page.locator('[data-role=execution] input')).to_have_value('2027-01-20')
        expect(self.page.locator('#approval-enabled')).to_be_checked()
        self.page.get_by_role('button',name='Удалить участника: Тест Б',exact=True).click()
        self.save(); self.page.reload()
        expect(self.page.locator('[data-role=review] li')).to_have_count(1)
        self.assertEqual(len(self.page.evaluate('JSON.parse(localStorage.getItem("mars.people.v1"))')),4)

    def test_07_required_fields_start_work_and_stage_confirmation(self):
        self.new(''); self.page.locator('#save-draft').click(); expect(self.page.locator('#editor-error')).to_contain_text('название')
        self.page.locator('#document-title').fill('Маршрут'); self.page.locator('#document-body').fill('')
        self.page.locator('#start-work').click(); expect(self.page.locator('#editor-error')).to_contain_text('текст')
        self.page.locator('#document-body').fill('Работа'); self.page.locator('#start-work').click(); expect(self.page.locator('#editor-error')).to_contain_text('исполнителя')
        self.participant('execution','Тестовый исполнитель'); self.page.locator('#start-work').click(); expect(self.page.locator('#editor-error')).to_contain_text('срок')
        self.page.locator('[data-role=execution] input').fill('2027-02-01'); self.page.locator('#approval-enabled').check()
        self.page.locator('#start-work').click(); expect(self.page.locator('#editor-error')).to_contain_text('утверждающего')
        self.participant('approval','Тест утверждения'); self.participant('review','Тест согласования')
        self.page.locator('#start-work').click(); expect(self.page.locator('#confirm-cancel')).to_be_focused()
        self.page.locator('#confirm-cancel').click(); self.assertEqual(self.page.evaluate('MarsDocuments.read().length'),0)
        self.page.locator('#start-work').click(); self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#save-state')).to_contain_text('Сохранено')
        self.assertEqual(self.record()['status'],'progress'); self.assertEqual(self.record()['workflow']['stage'],'review')
        for stage in ['approval','execution','completed']:
            self.page.locator('#workflow-stage').select_option(stage); self.page.locator('#change-stage').click()
            self.page.locator('#confirm-accept').click(); expect(self.page.locator('#save-state')).to_contain_text('Сохранено')
            self.assertEqual(self.record()['workflow']['stage'],stage)
        self.assertEqual(self.record()['status'],'done'); self.page.reload()
        expect(self.page.locator('#workflow-map [aria-current=step]')).to_have_text('Завершено')
        self.page.locator('#document-status').select_option('archive'); self.save('save-changes')
        self.page.locator('#editor-back').click(); self.page.locator('[data-section=archive]').click()
        expect(self.page.locator('#document-rows')).to_contain_text('Маршрут')

    def test_08_unsaved_recovery_back_and_write_failure(self):
        self.new(); self.page.locator('#document-city').fill('Несохранённый город')
        self.page.reload(); expect(self.page.locator('#document-city')).to_have_value('Несохранённый город')
        self.assertIn('beforeunload',self.dialogs)
        self.page.locator('#editor-back').click(); self.page.locator('#confirm-cancel').click()
        expect(self.page.locator('#document-city')).to_have_value('Несохранённый город')
        self.page.evaluate('() => { Storage.prototype.setItem = () => {throw new DOMException("Quota", "QuotaExceededError")}; }')
        self.page.locator('#save-draft').click(); expect(self.page.locator('#editor-error')).to_be_visible()
        expect(self.page.locator('#save-state')).to_contain_text('несохранённые')
        self.assertEqual(self.page.evaluate('MarsDocuments.read().length'),0)

    def test_09_attachments_upload_drop_download_remove_and_reload(self):
        self.new(); self.save()
        self.page.locator('#attachment-input').set_input_files({'name':'sample.txt','mimeType':'text/plain','buffer':b'MARS attachment'})
        expect(self.page.locator('#file-state')).to_contain_text('Сохранено файлов: 1')
        self.page.locator('#file-drop').evaluate('''el => {
            const dt = new DataTransfer(); dt.items.add(new File(['Dropped'], 'drop.txt', {type:'text/plain'}));
            el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));
        }''')
        expect(self.page.locator('#attachment-list li')).to_have_count(2)
        self.page.reload(); expect(self.page.locator('#attachment-list li')).to_have_count(2)
        with self.page.expect_download() as download:
            self.page.get_by_role('button',name='Скачать: sample.txt',exact=True).click()
        self.assertEqual(Path(download.value.path()).read_bytes(), b'MARS attachment')
        self.page.get_by_role('button',name='Удалить вложение: sample.txt',exact=True).click()
        expect(self.page.locator('#confirm-message')).to_contain_text('sample.txt')
        self.page.locator('#confirm-cancel').click(); expect(self.page.locator('#attachment-list li')).to_have_count(2)
        self.page.get_by_role('button',name='Удалить вложение: sample.txt',exact=True).click(); self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#attachment-list li')).to_have_count(1)
        self.page.reload(); expect(self.page.locator('#attachment-list')).not_to_contain_text('sample.txt')
        self.assertNotIn('blob',str(self.record()))
        doc_id=self.record()['id']; self.page.locator('#editor-back').click(); self.page.locator('.document-delete').click(); self.page.locator('#confirm-document-delete').click()
        expect(self.page.locator('#document-rows tr')).to_have_count(0)
        self.page.wait_for_function('async id => (await MarsFiles.list(id)).length === 0',arg=doc_id)

    def test_10_attachment_size_and_storage_errors(self):
        self.new(); self.save()
        self.page.locator('#attachment-input').set_input_files({'name':'big.bin','mimeType':'application/octet-stream','buffer':b'0'*(10*1024*1024+1)})
        expect(self.page.locator('#file-state')).to_contain_text('не больше 10 МБ')
        expect(self.page.locator('#attachment-list li')).to_have_count(0)
        self.page.evaluate('() => { IDBDatabase.prototype.transaction = () => { throw new Error("Хранилище недоступно"); }; }')
        self.page.locator('#attachment-input').set_input_files({'name':'small.txt','mimeType':'text/plain','buffer':b'x'})
        expect(self.page.locator('#file-state')).to_contain_text('Хранилище недоступно')
        expect(self.page.locator('#file-state')).not_to_contain_text('Сохранено')
        expect(self.page.locator('#attachment-list li')).to_have_count(0)

    def test_11_conflicting_edit_and_missing_document(self):
        self.new(); self.save(); original=self.record()
        self.page.locator('#document-title').fill('Моя правка')
        self.page.evaluate('() => { const docs=MarsDocuments.read();docs[0].title="Другая вкладка";localStorage.setItem(MarsDocuments.key,JSON.stringify(docs)); }')
        self.page.locator('#save-draft').click(); expect(self.page.locator('#editor-error')).to_contain_text('другой вкладке')
        self.assertEqual(self.record()['title'],'Другая вкладка')
        self.page.goto(self.url+'/editor.html?id=missing'); expect(self.page.locator('#editor-error')).to_contain_text('не найден')
        expect(self.page.locator('#save-draft')).to_be_disabled()
        self.assertEqual(self.page.evaluate('MarsDocuments.read().length'),1)

    def test_12_responsive_and_mobile_drawer(self):
        self.new()
        for width,height in [(1920,1080),(1366,768),(1024,768),(390,844),(360,800)]:
            with self.subTest(size=(width,height)):
                self.page.set_viewport_size({'width':width,'height':height})
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                self.assertTrue(self.page.locator('.paper').evaluate('(e) => e.scrollWidth <= e.clientWidth+1'))
                self.page.screenshot(path=f'/tmp/mars-editor-{width}.png')
                if width < 1001:
                    self.page.locator('#show-route').click(); expect(self.page.locator('#route-drawer')).to_be_visible()
                    self.page.locator('[data-role=reading] > button').click(); expect(self.page.locator('#people-dialog')).to_be_visible()
                    self.page.keyboard.press('Escape'); expect(self.page.locator('#route-drawer')).to_be_visible()
                    self.page.locator('#hide-route').click(); expect(self.page.locator('#show-route')).to_be_focused()
        self.page.emulate_media(reduced_motion='reduce')
        self.assertEqual(self.page.locator('#start-work').evaluate('(e)=>getComputedStyle(e).transitionDuration'),'0s')

    def test_13_total_attachment_limit_and_unavailable_indexeddb(self):
        self.new(); self.save()
        result = self.page.evaluate('''async () => {
            const id = MarsDocuments.read()[0].id;
            const file = new File([new Uint8Array(10 * 1024 * 1024)], 'ten.bin');
            for (let i=0; i<5; i++) await MarsFiles.add(id,file);
            try { await MarsFiles.add(id,new File(['x'],'overflow.txt')); return 'unexpected success'; }
            catch(error) { return error.message; }
        }''')
        self.assertIn('50 МБ',result)
        self.page.reload(); expect(self.page.locator('#attachment-list li')).to_have_count(5)
        self.page.add_init_script('Object.defineProperty(window, "indexedDB", {value:{open(){throw new Error("IndexedDB недоступно")}}})')
        self.page.reload(); expect(self.page.locator('#file-state')).to_contain_text('недоступно')
        self.page.locator('#attachment-input').set_input_files({'name':'failed.txt','mimeType':'text/plain','buffer':b'x'})
        expect(self.page.locator('#file-state')).to_contain_text('недоступно')
        expect(self.page.locator('#file-state')).not_to_contain_text('Сохранено')

    def test_14_related_document_and_dashboard_keeps_editor_fields(self):
        self.page.evaluate('d => localStorage.setItem("mars.documents.v1", JSON.stringify([d]))', LEGACY)
        self.new(); self.page.locator('#related-document').select_option('legacy'); self.save()
        current = self.page.evaluate('MarsDocuments.read().find(d=>d.id!=="legacy")')
        self.assertEqual(current['metadata']['relatedId'],'legacy')
        self.page.locator('#editor-back').click(); self.page.wait_for_url('**/dashboard.html')
        self.page.get_by_role('button',name='В избранное: Тестовый документ',exact=True).click()
        self.page.locator('.document-link').filter(has_text='Тестовый документ').click()
        expect(self.page.locator('#related-document')).to_have_value('legacy')
        expect(self.page.locator('#document-body')).to_have_text('Текст для проверки редактора.')
        self.assertTrue(self.page.evaluate('MarsDocuments.read().find(d=>d.id!=="legacy").favorite'))

    def test_15_direct_file_open_when_permitted(self):
        try:
            self.page.goto((ROOT/'editor.html').as_uri())
        except Error as reason:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(reason): self.skipTest('Managed browser policy blocks file:// navigation')
            raise
        expect(self.page.locator('#document-title')).to_be_visible()
        self.page.locator('#document-title').fill('Файловая проверка'); self.save()
        self.page.reload(); expect(self.page.locator('#document-title')).to_have_value('Файловая проверка')

if __name__ == '__main__':
    unittest.main(verbosity=2)
