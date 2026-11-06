"""Browser integration checks. Requires Python Playwright and a local Chromium."""
import re
import os
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
LEGACY = dict(id='legacy', title='Существующий документ', topic='Сохранить', due='', status='draft', favorite=True, created=1)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class CreationCenter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport=dict(width=1366, height=768))
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.url + '/dashboard.html')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def open(self):
        self.page.locator('[data-create]').first.click()
        expect(self.page.locator('#creation-dialog')).to_be_visible()

    def use(self, template):
        self.page.locator(f'.creation-card[data-id="{template}"]').click()
        expect(self.page.locator('#document-dialog')).not_to_be_visible()
        self.page.get_by_role('button', name='Использовать шаблон', exact=True).click()
        expect(self.page.locator('#document-dialog')).to_be_visible()
        self.assertEqual(self.page.locator('dialog[open]').count(), 1)

    def save_document(self):
        self.page.locator('#document-form [type=submit]').click()
        expect(self.page.locator('#document-dialog')).not_to_be_visible()

    def save_editor(self):
        self.page.locator('.creation-editor [type=submit]').click()
        expect(self.page.locator('#creation-catalog')).to_be_visible()

    def test_01_catalog_search_preview_document_and_legacy(self):
        self.page.evaluate('(d) => localStorage.setItem("mars.documents.v1", JSON.stringify([d]))', LEGACY)
        self.page.reload()
        self.open()
        for category, count in [('quick', 3), ('internal', 3), ('standard', 3), ('accounting', 2), ('hr', 2), ('mine', 0), ('all', 13)]:
            self.page.locator(f'[data-category={category}]').click()
            expect(self.page.locator('.creation-card')).to_have_count(count)
        for term, count in [('Протокол', 1), ('Кадровые', 2), ('предстоящем платеже', 1), ('НЕСУЩЕСТВУЮЩИЙ', 0)]:
            self.page.locator('#template-search').fill(term)
            expect(self.page.locator('.creation-card')).to_have_count(count)
        expect(self.page.get_by_role('heading', name='Ничего не найдено')).to_be_visible()
        self.page.locator('#clear-template-search').click()
        self.use('meeting')
        expect(self.page.locator('#document-title')).to_have_value('Протокол встречи')
        self.assertIn('Участники:', self.page.locator('#document-topic').input_value())
        self.page.locator('#document-title').fill('Встреча команды')
        self.save_document()
        self.page.locator('.document-link').filter(has_text='Встреча команды').click()
        self.page.locator('#document-status').select_option('progress')
        self.save_document()
        self.page.locator('.star-button').click()
        self.page.locator('[data-section=favorites]').click()
        expect(self.page.locator('#document-rows tr')).to_have_count(2)
        self.page.locator('#document-search').fill('Встреча')
        expect(self.page.locator('#document-rows tr')).to_have_count(1)
        self.page.locator('#filter-toggle').click()
        self.page.locator('#status-filter').select_option('progress')
        self.page.locator('#sort-order').select_option('title')
        expect(self.page.locator('#document-rows tr')).to_have_count(1)
        self.page.reload()
        docs = self.page.evaluate('JSON.parse(localStorage.getItem("mars.documents.v1"))')
        self.assertIn(LEGACY, docs)
        self.assertEqual(len(docs), 2)
        self.open(); self.use('blank')
        for field in ['title', 'topic', 'due']:
            expect(self.page.locator('#document-' + field)).to_have_value('')
        self.page.locator('#document-title').fill('С чистого листа'); self.save_document()
        self.page.reload()
        expect(self.page.locator('#document-rows tr')).to_have_count(3)

    def test_02_custom_template_crud_and_use(self):
        self.open(); self.page.locator('#new-template').click()
        self.page.locator('#template-name').fill('Мой план')
        self.page.locator('#template-description').fill('Повторяемая работа')
        self.page.locator('#template-category').select_option('standard')
        self.page.locator('#template-title').fill('План недели')
        self.page.locator('#template-topic').fill('Цели и задачи')
        self.page.locator('#template-due').fill('2027-01-12')
        self.page.locator('#template-status').select_option('progress'); self.save_editor()
        expect(self.page.locator('.creation-card')).to_have_count(1)
        self.page.locator('.creation-card').click()
        self.page.get_by_role('button', name='Редактировать', exact=True).click()
        self.page.locator('#template-description').fill('Обновлённое описание'); self.save_editor()
        self.page.reload(); self.open(); self.page.locator('[data-category=mine]').click()
        expect(self.page.locator('.creation-card')).to_contain_text('Обновлённое описание')
        template_id = self.page.locator('.creation-card').get_attribute('data-id'); self.use(template_id)
        expect(self.page.locator('#document-title')).to_have_value('План недели')
        expect(self.page.locator('#document-due')).to_have_value('2027-01-12')
        self.save_document()
        self.open(); self.page.locator('[data-category=mine]').click(); self.page.locator('.creation-card').click()
        self.page.once('dialog', lambda d: d.dismiss())
        self.page.get_by_role('button', name='Удалить', exact=True).click()
        expect(self.page.locator('#creation-detail')).to_be_visible()
        self.page.once('dialog', lambda d: d.accept())
        self.page.get_by_role('button', name='Удалить', exact=True).click()
        expect(self.page.locator('.creation-card')).to_have_count(0)
        self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("mars.templates.v1"))'), [])
        self.assertEqual(len(self.page.evaluate('JSON.parse(localStorage.getItem("mars.documents.v1"))')), 1)

    def test_03_process_create_edit_progress_reload_delete(self):
        self.open(); self.page.locator('#mode-processes').click(); self.page.locator('#new-template').click()
        self.page.locator('#process-name').fill('Наш процесс')
        self.page.locator('#process-description').fill('Локальная работа')
        self.page.get_by_role('button', name='Добавить этап', exact=True).click()
        self.page.locator('[name=stage-name]').last.fill('Публикация')
        self.page.locator('.creation-step button').nth(1).click()
        self.page.locator('[name=stage-name]').first.fill('Подготовить материалы')
        self.page.locator('[name=stage-status]').first.select_option('done')
        expect(self.page.locator('#process-progress-text')).to_have_text('1/4 · 25%')
        self.save_editor()
        expect(self.page.locator('.creation-card')).to_contain_text('25%')
        self.page.reload(); self.open(); self.page.locator('#mode-processes').click()
        self.page.locator('.creation-card').click()
        expect(self.page.locator('[name=stage-name]').first).to_have_value('Подготовить материалы')
        for select in self.page.locator('[name=stage-status]').all(): select.select_option('done')
        self.save_editor()
        expect(self.page.locator('.creation-card')).to_contain_text('100%')
        self.page.locator('.creation-card').click()
        self.page.once('dialog', lambda d: d.accept())
        self.page.get_by_role('button', name='Удалить процесс').click()
        expect(self.page.locator('.creation-card')).to_have_count(0)

    def test_04_dirty_escape_backdrop_focus_keyboard(self):
        self.open()
        self.page.keyboard.press('Escape')
        expect(self.page.locator('[data-create]').first).to_be_focused()
        self.open(); self.page.mouse.click(2, 2)
        expect(self.page.locator('#creation-dialog')).not_to_be_visible()
        self.open()
        close = self.page.locator('[data-close=creation-dialog]')
        close.focus(); self.page.keyboard.press('Shift+Tab')
        expect(self.page.locator('.creation-card').last).to_be_focused()
        self.page.keyboard.press('Tab'); expect(close).to_be_focused()
        self.page.locator('#mode-documents').focus(); self.page.keyboard.press('ArrowRight')
        expect(self.page.locator('#mode-processes')).to_have_attribute('aria-selected','true')
        self.page.keyboard.press('ArrowLeft')
        self.page.locator('#new-template').click(); self.page.locator('#template-name').fill('Не сохранено')
        self.page.once('dialog', lambda d: d.dismiss()); self.page.keyboard.press('Escape')
        expect(self.page.locator('#template-name')).to_have_value('Не сохранено')
        self.page.once('dialog', lambda d: d.dismiss()); self.page.mouse.click(2, 2)
        expect(self.page.locator('#creation-dialog')).to_be_visible()
        self.page.once('dialog', lambda d: d.accept()); self.page.keyboard.press('Escape')
        expect(self.page.locator('[data-create]').first).to_be_focused()
        self.open(); self.use('blank'); self.page.locator('#document-title').fill('Черновик')
        self.page.once('dialog', lambda d: d.dismiss()); self.page.locator('[data-close=document-dialog]').first.click()
        expect(self.page.locator('#document-dialog')).to_be_visible()
        self.page.once('dialog', lambda d: d.accept()); self.page.keyboard.press('Escape')
        expect(self.page.locator('[data-create]').first).to_be_focused()
        expect(self.page.locator('body')).not_to_have_class(re.compile(r'has-modal'))

    def test_05_storage_errors_and_conflicts_preserve_data(self):
        self.page.evaluate('localStorage.setItem("mars.templates.v1", "broken-data")')
        self.open(); expect(self.page.locator('#creation-error')).to_be_visible()
        self.page.locator('#new-template').click(); self.page.locator('#template-name').fill('Шаблон')
        self.page.locator('.creation-editor [type=submit]').click()
        expect(self.page.locator('#creation-error')).to_be_visible()
        self.assertEqual(self.page.evaluate('localStorage.getItem("mars.templates.v1")'), 'broken-data')
        self.page.reload(); self.page.evaluate('localStorage.removeItem("mars.templates.v1")'); self.open()
        self.page.locator('#new-template').click(); self.page.locator('#template-name').fill('Шаблон')
        self.page.evaluate('localStorage.setItem("mars.templates.v1", "[]")')
        self.page.locator('.creation-editor [type=submit]').click()
        expect(self.page.locator('#creation-error')).to_contain_text('другой вкладке')
        self.assertEqual(self.page.evaluate('localStorage.getItem("mars.templates.v1")'), '[]')

    def test_06_write_failure_and_validation(self):
        self.open(); self.page.locator('#mode-processes').click(); self.page.locator('#new-template').click()
        while self.page.locator('.creation-step button').count(): self.page.locator('.creation-step button').first.click()
        self.page.locator('.creation-editor [type=submit]').click()
        expect(self.page.locator('#creation-error')).to_contain_text('хотя бы один этап')
        self.page.get_by_role('button', name='Добавить этап', exact=True).click()
        self.page.locator('[name=stage-name]').fill('   ')
        self.page.locator('.creation-editor [type=submit]').click()
        expect(self.page.locator('#creation-error')).to_contain_text('пробелов')
        self.page.locator('[name=stage-name]').fill('Этап')
        self.page.evaluate('() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; }')
        self.page.locator('.creation-editor [type=submit]').click()
        expect(self.page.locator('#creation-error')).to_contain_text('Не удалось сохранить')
        expect(self.page.locator('#process-name')).to_have_value('Согласование документа')

    def test_07_responsive_sizes_and_reduced_motion(self):
        for width, height in [(1920,1080), (1366,768), (1024,768), (390,844), (360,800)]:
            with self.subTest(size=(width,height)):
                self.page.set_viewport_size(dict(width=width,height=height)); self.open()
                for target in ['#creation-dialog', '#creation-catalog', '#creation-grid']:
                    self.assertTrue(self.page.locator(target).evaluate('(e) => e.scrollWidth <= e.clientWidth + 1'))
                self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                box = self.page.locator('#creation-dialog').bounding_box()
                self.assertGreaterEqual(box['x'], 0); self.assertLessEqual(box['y']+box['height'], height)
                self.page.screenshot(path=f'/tmp/mars-{width}.png')
                self.page.locator('[data-category=hr]').click(); self.use('leave')
                self.assertTrue(self.page.locator('#document-dialog').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1'))
                self.page.keyboard.press('Escape'); self.open()
                self.page.locator('#mode-processes').click(); self.page.locator('#new-template').click()
                self.assertTrue(self.page.locator('#creation-dialog').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1'))
                self.page.screenshot(path=f'/tmp/mars-process-{width}.png')
                self.page.keyboard.press('Escape')
        self.page.emulate_media(reduced_motion='reduce'); self.open()
        self.assertEqual(self.page.locator('.creation-card').first.evaluate('(e) => getComputedStyle(e).transitionDuration'), '0s')

    def test_08_login_settings_navigation(self):
        self.page.goto(self.url + '/index.html')
        self.page.locator('[type=submit]').click(); expect(self.page.locator('#email-error')).to_be_visible()
        self.page.locator('#email').fill('demo@example.com'); self.page.locator('#password').fill('demo-only')
        self.page.locator('.password-toggle').click(); expect(self.page.locator('#password')).to_have_attribute('type','text')
        self.page.locator('[type=submit]').click(); self.page.wait_for_url('**/dashboard.html')
        self.page.locator('[data-info=settings]').first.click(); self.page.locator('#compact-view').check(); self.page.keyboard.press('Escape')
        self.assertTrue(self.page.evaluate('document.body.classList.contains("is-compact")'))
        self.page.set_viewport_size(dict(width=390,height=844)); self.page.locator('#open-navigation').click()
        self.page.locator('.logout-link').click(); self.page.wait_for_url('**/index.html')

    def seed_deletion_documents(self):
        target = dict(LEGACY, id='delete-me', title='План «MARS» <2027>', status='progress')
        survivor = dict(LEGACY, id='keep-me', title='Оставить документ', favorite=False)
        self.page.evaluate('''docs => {
            localStorage.setItem('mars.documents.v1', JSON.stringify(docs));
            localStorage.setItem('mars.templates.v1', '[]');
            localStorage.setItem('mars.processes.v1', '[]');
        }''', [target, survivor])
        self.page.reload()
        return target, survivor

    def request_deletion(self):
        button = self.page.get_by_role('button', name='Удалить: План «MARS» <2027>', exact=True)
        button.click()
        expect(self.page.locator('#delete-document-dialog')).to_be_visible()
        return button

    def stored_documents(self):
        return self.page.evaluate('JSON.parse(localStorage.getItem("mars.documents.v1"))')

    def test_09_delete_confirmation_opens_with_name_and_safe_focus(self):
        target, survivor = self.seed_deletion_documents()
        self.request_deletion()
        expect(self.page.locator('#delete-document-name')).to_have_text(target['title'])
        expect(self.page.locator('#cancel-document-delete')).to_be_focused()
        self.assertEqual(self.page.locator('dialog[open]').count(), 1)
        self.assertEqual(self.stored_documents(), [target, survivor])
        for width, height in [(1366,768), (390,844), (360,800)]:
            self.page.set_viewport_size(dict(width=width, height=height))
            self.assertTrue(self.page.locator('#delete-document-dialog').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1'))
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            self.page.screenshot(path=f'/tmp/mars-delete-{width}.png')

    def test_10_delete_cancel_escape_and_backdrop_keep_document(self):
        target, survivor = self.seed_deletion_documents()
        for method in ['button', 'escape', 'backdrop']:
            with self.subTest(method=method):
                opener = self.request_deletion()
                if method == 'button': self.page.locator('#cancel-document-delete').click()
                elif method == 'escape': self.page.keyboard.press('Escape')
                else: self.page.mouse.click(2, 2)
                expect(self.page.locator('#delete-document-dialog')).not_to_be_visible()
                expect(opener).to_be_focused()
                self.assertEqual(self.stored_documents(), [target, survivor])
                expect(self.page.locator('#document-rows tr')).to_have_count(2)
                expect(self.page.locator('#workspace-toast')).not_to_be_visible()

    def test_11_confirm_delete_updates_sections_counts_filters_and_toast(self):
        _, survivor = self.seed_deletion_documents()
        self.page.locator('[data-section=favorites]').click()
        self.page.locator('#document-search').fill('MARS')
        self.page.locator('#filter-toggle').click()
        self.page.locator('#status-filter').select_option('progress')
        self.page.locator('#sort-order').select_option('title')
        self.request_deletion()
        self.page.locator('#confirm-document-delete').click()
        expect(self.page.locator('#delete-document-dialog')).not_to_be_visible()
        expect(self.page.locator('#workspace-toast')).to_have_text('Документ удалён')
        expect(self.page.locator('#workspace-toast')).to_be_visible()
        expect(self.page.locator('#document-rows tr')).to_have_count(0)
        expect(self.page.locator('#section-count')).to_have_text('0')
        expect(self.page.locator('[data-count=all]')).to_have_text('1')
        expect(self.page.locator('[data-count=progress]')).to_have_text('0')
        expect(self.page.locator('[data-count=favorites]')).to_have_text('0')
        expect(self.page.locator('#document-search')).to_have_value('MARS')
        expect(self.page.locator('#status-filter')).to_have_value('progress')
        expect(self.page.locator('#sort-order')).to_have_value('title')
        expect(self.page.locator('#section-title')).to_be_focused()
        self.assertEqual(self.stored_documents(), [survivor])
        self.assertEqual(self.page.evaluate('[localStorage.getItem("mars.templates.v1"), localStorage.getItem("mars.processes.v1")]'), ['[]','[]'])
        self.page.locator('.nav-item[data-section=all]').click()
        expect(self.page.locator('#document-rows')).to_contain_text(survivor['title'])
        self.page.locator('[data-section=progress]').click()
        expect(self.page.locator('#document-rows tr')).to_have_count(0)

    def test_12_deletion_persists_after_reload(self):
        _, survivor = self.seed_deletion_documents()
        self.request_deletion(); self.page.locator('#confirm-document-delete').click()
        self.page.reload()
        self.assertEqual(self.stored_documents(), [survivor])
        expect(self.page.locator('#document-rows tr')).to_have_count(1)
        expect(self.page.locator('#document-rows')).to_contain_text(survivor['title'])
        expect(self.page.locator('[data-count=all]')).to_have_text('1')
        expect(self.page.locator('[data-count=favorites]')).to_have_text('0')

    def test_13_single_click_and_default_enter_cannot_delete(self):
        target, survivor = self.seed_deletion_documents()
        self.request_deletion()
        self.assertEqual(self.stored_documents(), [target, survivor])
        expect(self.page.locator('#document-rows tr')).to_have_count(2)
        # Enter follows the safe default focus and cancels instead of confirming.
        self.page.keyboard.press('Enter')
        expect(self.page.locator('#delete-document-dialog')).not_to_be_visible()
        self.assertEqual(self.stored_documents(), [target, survivor])
        self.page.reload()
        expect(self.page.locator('#document-rows tr')).to_have_count(2)

    def test_14_delete_storage_failure_preserves_document(self):
        target, survivor = self.seed_deletion_documents()
        self.request_deletion()
        self.page.evaluate('() => { Storage.prototype.setItem = () => { throw new DOMException("Denied", "SecurityError"); }; }')
        self.page.locator('#confirm-document-delete').click()
        expect(self.page.locator('#delete-document-dialog')).to_be_visible()
        expect(self.page.locator('#delete-document-error')).to_contain_text('Не удалось удалить документ')
        expect(self.page.locator('#cancel-document-delete')).to_be_focused()
        expect(self.page.locator('#workspace-toast')).not_to_be_visible()
        self.assertEqual(self.stored_documents(), [target, survivor])
        self.page.locator('#cancel-document-delete').click()
        expect(self.page.locator('#document-rows tr')).to_have_count(2)
        self.page.reload()
        expect(self.page.locator('#document-rows tr')).to_have_count(2)

if __name__ == '__main__':
    unittest.main(verbosity=2)
