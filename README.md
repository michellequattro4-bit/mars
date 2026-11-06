# MARS

Локальное приложение для документов: страница входа, dashboard, центр создания и редактор с маршрутом работы в стиле Liquid Glass. Используются только HTML, CSS и JavaScript, без сборки, npm, библиотек и внешних запросов.

## Как открыть

Откройте `index.html` двойным щелчком в современном браузере. Стили и скрипт подключены относительными путями, поэтому страница работает через `file://` и при размещении в любой папке статического сайта.

## Структура

```text
mars/
├── README.md
├── index.html
├── styles.css
├── script.js
├── dashboard.html
├── editor.html
├── editor.css
├── editor.js
├── document-store.js
└── tests/
```

## Возможности

- Адаптивная карточка входа шириной до 440 px.
- Поля почты и пароля с подписями и автозаполнением.
- Показ и скрытие пароля.
- Проверка обязательных полей и формата почты с русскими сообщениями.
- Клавиатурный фокус и поддержка уменьшенного движения.
- Бренд MARS: Bodoni Moda SemiBold (600), открытый serif по лицензии SIL OFL 1.1.
- Интерфейс: системный sans-serif — Inter, системные шрифты Apple, Segoe UI.
- Шрифт бренда встроен в CSS как WOFF2 data URI; сетевые запросы и дополнительные файлы не нужны. Запасной стек: Bodoni MT, Didot, Georgia, serif.

После проверки формы входа открывается `dashboard.html`. Это локальная демонстрация без серверной авторизации: учётные данные не сохраняются и не отправляются, а рабочую страницу можно открыть напрямую. Кнопка «Забыли пароль?» показывает подсказку об обращении к администратору.

## Рабочее пространство

В `dashboard.html` доступны создание, редактирование и удаление документов, статусы, сроки, избранное, поиск, фильтры и сортировка. Документы сохраняются в `localStorage` текущего браузера. Совместного доступа и синхронизации нет. Выход возвращает на страницу входа и не удаляет документы. Не используйте демонстрацию для конфиденциальной информации.

На узких экранах навигация открывается кнопкой меню. Настройки вида позволяют включить компактные строки. Все ресурсы локальны; сервер и сборка не нужны. Некоторые браузеры ограничивают `localStorage` для `file://`: при запрете сохранения интерфейс покажет ошибку, данные не будут считаться сохранёнными.

Удаление доступно через значок корзины в каждой строке документа. Отдельное окно показывает название документа; начальный фокус установлен на «Отмена». Только кнопка «Удалить документ» подтверждает действие. Escape, «Отмена» и клик по фону закрывают окно без удаления. После успешного сохранения обновляются список и счётчики, сохраняются текущие поиск и фильтры и появляется сообщение «Документ удалён». При ошибке записи документ остаётся в списке, а окно показывает ошибку.

## Центр создания

Кнопки «Создать документ» открывают центр создания MARS: 13 демонстрационных шаблонов, категории, поиск по названию, описанию и категории. Карточка открывает предварительный просмотр; «Использовать шаблон» открывает `editor.html` с предзаполненными полями. «Пустой документ» открывает чистый редактор. Документ появляется в dashboard только после явного сохранения и доступен в обычных разделах, поиске, сортировке и избранном.

«Свой шаблон» позволяет сохранить название, описание, категорию и значения полей документа: название, тему, срок и статус. В «Моих шаблонах» доступны использование, редактирование и удаление с подтверждением. Удаление шаблона не затрагивает созданные по нему документы. Встроенные заготовки не являются официальными юридическими формами.

В режиме «Процессы» создайте процесс, задайте описание и последовательность этапов (до 50), добавляйте, переименовывайте и удаляйте этапы. Статусы «Ожидает», «В работе» и «Завершён» задаются вручную. Прогресс — доля завершённых этапов. Изменения фиксируются кнопкой «Сохранить»; сохранённый процесс можно повторно открыть или удалить с подтверждением. Это локальный план работы: отправка документов, уведомления, подписи и автоматическое согласование не выполняются.

Хранилища независимы:

- `mars.documents.v1` — документы, прежний формат сохранён;
- `mars.templates.v1` — пользовательские шаблоны;
- `mars.processes.v1` — локальные процессы и этапы.

При ошибке чтения исходные данные не очищаются и не перезаписываются. При ошибке записи редактор остаётся открытым. Изменение шаблонов или процессов другой вкладкой обнаруживается перед записью: повторно откройте центр для загрузки актуальных данных. Общего доступа, синхронизации и серверного хранения нет.

Окна используют нативный `dialog`: Escape, кнопка закрытия и клик по фону закрывают окно, несохранённые изменения требуют подтверждения. Фокус остаётся внутри окна и возвращается к открывшей его кнопке. В режиме выбора документы/процессы работают стрелки, Home и End. На мобильном категории прокручиваются по горизонтали, содержимое — внутри окна. Поддерживается `prefers-reduced-motion`. Все операции локальные и синхронные, сетевой загрузки шаблонов нет.

## Редактор документа и локальный маршрут

Нажатие на документ в dashboard открывает `editor.html?id=…`. Для новых документов центр создания выдаёт уникальный ID заранее и передаёт поля через хранилище вкладки. «Сохранить в черновик» записывает документ со статусом `draft` и этапом подготовки; повторные сохранения обновляют ту же запись. После сохранения URL содержит постоянный ID.

Светлый лист A4 содержит редактируемые организацию, название, номер, дату, город, должность и имя адресата и автора, тему и ссылку на другой локальный документ. Текст поддерживает Undo/Redo, четыре системных шрифта, семь размеров, обычный абзац и заголовки H1–H3, жирный, курсив, подчёркивание, зачёркивание, списки, выравнивание, ссылки и очистку форматирования. Toolbar сохраняет выделение. Нативные команды `document.execCommand` используются для сохранения браузерной истории Undo/Redo; реализация проверена в Chromium. Пагинация, печать и экспорт PDF в этот этап не входят: лист растёт вместе с текстом.

HTML из буфера, сохранённый текст и вставленные ссылки проходят очистку: разрешены только поддерживаемые текстовые элементы, ограниченные стили и адреса HTTP(S)/mailto. Скрипты, обработчики событий, изображения, iframe, SVG и произвольные стили не сохраняются. Внешние ресурсы для редактора не загружаются. Файлы скачиваются, а не выполняются внутри приложения.

В правой панели четыре независимые секции участников. Локальный справочник изначально пуст; пользователь сам добавляет имя и должность. Участников можно найти, назначить в несколько ролей, удалить из маршрута и изменить порядок стрелками. Для исполнителей задаются даты. На мобильном панель открывается в отдельном диалоге.

«Передать в работу» требует названия, непустого текста, хотя бы одного исполнителя и срока для каждого исполнителя. Утверждающий обязателен только при включённом утверждении. После подтверждения документ сохраняется со статусом `progress` и первым применимым этапом. Ручной переход между этапами также требует подтверждения; завершение устанавливает `done`. «Сохранить изменения» сохраняет правки с выбранным статусом, включая `archive` и `inbox`. Это локальная демонстрация: отправки другим людям, уведомлений, электронных подписей и юридически значимого согласования нет.

Модель `mars.documents.v1` расширена необязательными полями `metadata`, `bodyHTML`, `workflow`, `updated`. ID, избранное, даты и дополнительные поля старых документов сохраняются; миграции или очистки записей нет. Независимые процессы и шаблоны остаются в прежних ключах. Справочник участников хранится в `mars.people.v1`. Конфликт записи документа из другой вкладки блокирует перезапись и показывает ошибку.

Несохранённые реквизиты, текст и маршрут восстанавливаются после обновления той же вкладки из `sessionStorage` (`mars.editor.recovery.<id>`). При выходе и закрытии вкладки с изменениями выводится предупреждение. Восстановление не гарантируется после закрытия самой вкладки или при запрете хранилища; явное сохранение черновика остаётся основным способом сохранения. При ошибке записи успех не показывается.

## Вложения

Выбор файлов и drag-and-drop сохраняют бинарные данные сразу в IndexedDB `mars.files.v1`, объектное хранилище `files`. В `localStorage` бинарные данные не попадают. Лимиты: 10 МБ на файл и 50 МБ на документ. Успех сообщается после завершения транзакции; превышение квоты и недоступность IndexedDB выводятся как ошибки. Список показывает имя и размер, позволяет скачать исходные байты и удалить файл после отдельного подтверждения. Отмена изменений текста существующего документа не отменяет уже сохранённые вложения.

При подтверждённом удалении документа dashboard очищает его вложения. Если очистка IndexedDB не удалась, сообщение отдельно сообщает об этом. Черновые вложения без сохранённого документа удаляются при подтверждённом выходе из редактора. Закрытие вкладки до сохранения нового документа может оставить невостребованные файлы в IndexedDB; автоматическая очистка неизвестных данных не выполняется.

## Проверка разработки

Для общего хранилища между страницами рекомендуется локальный HTTP-сервер из корня проекта:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Все пути относительные. Доступ к `file://`, IndexedDB и общему localStorage между локальными HTML-файлами зависит от браузера. В управляемом Chromium прямое открытие `file://` запрещено политикой среды; соответствующая проверка отмечается как skipped, а не как пройденная. Без общего origin перенос данных между dashboard и редактором через локальные файлы не гарантируется.

Само приложение не требует зависимостей, npm или сборки. Для браузерных тестов нужны Python Playwright и Chromium (в облачной среде установлены). Тесты поднимают отдельный HTTP-сервер и используют изолированные контексты:

```sh
node --check script.js
node --check editor.js
node --check document-store.js
python3 tests/creation_center.py
python3 tests/document_editor.py
```

`creation_center.py` проверяет 14 сценариев dashboard, шаблонов, процессов и безопасного удаления. `document_editor.py` проверяет 15 сценариев: совместимость, форматирование и каждый вариант выпадающих списков, безопасную вставку, участников, маршрут, восстановление, вложения, квоты, конфликты, адаптивность и доступность `file://`. Для Chromium можно задать `CHROMIUM_PATH` вместо `/usr/bin/chromium`. Размеры проверки: 1920×1080, 1366×768, 1024×768, 390×844 и 360×800. Скриншоты сохраняются в `/tmp/mars-*.png`.

## Лицензия шрифта

Bodoni Moda из [Fontsource 5.3.0](https://www.npmjs.com/package/@fontsource/bodoni-moda/v/5.3.0), источник — [Google Fonts](https://github.com/google/fonts/tree/main/ofl/bodonimoda). Использован неизменённый Latin WOFF2 начертания 600 normal.

```text
Copyright 2020 The Bodoni Moda Project Authors (https://github.com/indestructible-type/Bodoni) BodoniModa-Italic[opsz,wght].ttf: Copyright 2020 The Bodoni Moda Project Authors (https://github.com/indestructible-type/Bodoni)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
