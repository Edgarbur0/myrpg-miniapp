// ================================================
// СЯНЬСЯ MINI APP — логика
// VK Bridge → получение user_id, аватара и имени →
// сохранение имени на сервере → загрузка данных
// с API → отрисовка персонажа, культивации, техник.
// ================================================

'use strict';

// ---------- Константы ----------
const API_URL = 'https://edgarburo.ru/api';
// Тестовый игрок (fallback, если VK Bridge недоступен)
const TEST_USER_ID = 416584639;

// Иконки элементов техник
const ELEMENT_ICONS = {
    fire: '🔥',
    water: '💧',
    earth: '🪨',
    wind: '🌪️',
    lightning: '⚡',
    ice: '❄️',
    light: '✨',
    dark: '🌑',
    wood: '🌳',
    metal: '⚙️',
    poison: '☠️',
    none: '⚔️',
};

// Характеристики на экране персонажа
const STATS = [
    { key: 'strength', label: 'Сила' },
    { key: 'damage', label: 'Урон' },
    { key: 'agility', label: 'Ловкость' },
    { key: 'luck', label: 'Удача' },
    { key: 'armor', label: 'Броня' },
    { key: 'endurance', label: 'Выносливость' },
];

// Детали статов для popover.
// chance: шанс улучшения в бою есть только у Силы, Ловкости и Выносливости
const STAT_DETAILS = {
    strength: { label: 'Сила', chance: true },
    damage: { label: 'Урон', chance: false },
    agility: { label: 'Ловкость', chance: true },
    luck: { label: 'Удача', chance: false },
    armor: { label: 'Броня', chance: false },
    endurance: { label: 'Выносливость', chance: true },
};

// Подписи основных типов предметов
const ITEM_TYPE_LABELS = {
    consumable: 'Расходник',
    equipment: 'Экипировка',
    material: 'Материал',
    currency: 'Валюта',
    unknown: 'Предмет',
};

// ---------- Состояние ----------
let userId = null;
let userAvatar = null;
let vkDisplayName = null;
let nameSaved = false;
let playerData = null;
let inventoryData = null;
let techniquesData = null;
let toastTimer = null;
let activeItemCode = null;
let breakthroughForecast = null;     // прогноз прорыва (GET /breakthrough/forecast)
// Подготовка к прорыву: списки и выбранные значения (переживают перерисовку)
let prepCores = [];
let prepSelectedCore = '';
let prepFormOpen = false;            // открыта ли форма подготовки

// ---------- VK Bridge ----------
async function ensureUserId() {
    if (userId) {
        return userId;
    }

    // Пробуем получить ID, аватар и имя через VK Bridge
    if (window.vkBridge) {
        try {
            await vkBridge.send('VKWebAppInit');
        } catch (error) {
            console.warn('VKWebAppInit:', error);
        }
        try {
            const info = await vkBridge.send('VKWebAppGetUserInfo');
            if (info && info.id) {
                userId = info.id;
                if (info.photo_200) {
                    userAvatar = info.photo_200;
                }
                // Имя из ВК: first_name + last_name
                if (info.first_name) {
                    vkDisplayName = (info.first_name + ' ' + (info.last_name || '')).trim();
                    saveVkName(info.first_name, info.last_name || '');
                }
                return userId;
            }
        } catch (error) {
            console.warn('VKWebAppGetUserInfo:', error);
        }
    }

    // Фолбэк для отладки вне VK
    userId = TEST_USER_ID;
    return userId;
}

// Отправка имени из ВК на сервер (один раз за сессию)
async function saveVkName(firstName, lastName) {
    if (nameSaved) {
        return;
    }
    nameSaved = true;
    try {
        await apiFetch(`/player/${userId}/set_name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name: firstName, last_name: lastName }),
        });
    } catch (error) {
        console.warn('set_name:', error);
    }
}

// ---------- Работа с API ----------
async function apiFetch(path, options) {
    const response = await fetch(API_URL + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        // Понятные сообщения на русском вместо «internal error»
        const messages = {
            400: 'Ты истощён',
            404: 'Игрок не найден',
            500: 'Ошибка на сервере',
        };
        const error = new Error(data.message || messages[response.status] || data.error || `HTTP ${response.status}`);
        error.code = data.error;
        throw error;
    }
    return data;
}

// ---------- Утилиты ----------
function setBar(fill, text, current, max) {
    if (!fill || !text) {
        // Элемент разметки не найден (например, обновился только app.js).
        // Не роняем экран, а логируем для диагностики.
        console.warn('[MiniApp] setBar: элемент разметки не найден', { fill, text, current, max });
        return;
    }
    const percent = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    fill.style.width = percent + '%';
    text.textContent = `${current} / ${max}`;
}

function esc(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2400);
}

function showLoading() {
    document.getElementById('skeleton').classList.remove('hidden');
    document.getElementById('errorBox').classList.add('hidden');
    document.getElementById('btnRefresh').classList.add('spin');
}

function hideLoading() {
    document.getElementById('skeleton').classList.add('hidden');
    document.getElementById('btnRefresh').classList.remove('spin');
}

function showError() {
    hideLoading();
    document.getElementById('errorBox').classList.remove('hidden');
}

// ---------- Шапка и аватар ----------
function renderAvatar(src) {
    const headerImg = document.getElementById('headerAvatar');
    const headerFallback = document.getElementById('headerAvatarFallback');
    const artImg = document.getElementById('artAvatar');
    const artFallback = document.getElementById('artAvatarFallback');

    if (src) {
        headerImg.src = src;
        artImg.src = src;
        headerImg.classList.remove('hidden');
        artImg.classList.remove('hidden');
        headerFallback.classList.add('hidden');
        artFallback.classList.add('hidden');
    } else {
        headerImg.classList.add('hidden');
        artImg.classList.add('hidden');
        headerFallback.classList.remove('hidden');
        artFallback.classList.remove('hidden');
    }
}

// Отображение имени: приоритет у ВК, затем у данных игрока
function getDisplayName(player) {
    return vkDisplayName || player.nickname || 'Странник';
}

function renderHeader() {
    const player = playerData;
    if (!player) {
        return;
    }

    // Уровень над именем, имя крупно под ним
    document.getElementById('levelLine').textContent = `Уровень ${player.level}`;
    document.getElementById('playerName').textContent = getDisplayName(player);

    // Подзаголовок: ступень культивации (0.1 Закалённое Тело)
    const cultivation = player.cultivation;
    document.getElementById('cultivationSubtitle').textContent = cultivation
        ? `${cultivation.stage}.${cultivation.substage} ${cultivation.stage_name}`
        : '—';

    // Аватар: приоритет у VK Bridge, затем у данных с API
    renderAvatar(userAvatar || player.avatar_url);

    // Арт персонажа (левая колонка)
    document.getElementById('artName').textContent = getDisplayName(player);
    document.getElementById('artLevel').textContent = `Уровень ${player.level}`;
}

// ---------- Экран: Персонаж ----------
function renderCharacter() {
    const player = playerData;
    if (!player) {
        return;
    }

    // Шкала опыта — во всю ширину под шапкой
    setBar(
        document.getElementById('xpFill'),
        document.getElementById('xpText'),
        player.experience,
        player.experience_needed
    );

    // Карточка здоровья: HP/макс + «!» → popover с разбивкой
    const hpCard = `
        <div class="stat stat-hp">
            <span class="stat-name">Здоровье</span>
            <b class="stat-value">${esc(player.hp)}/${esc(player.max_hp)}</b>
            <button class="stat-info-btn" data-hp="1" type="button" aria-label="Здоровье">!</button>
        </div>`;

    // Характеристики с кнопкой-подсказкой
    document.getElementById('statsGrid').innerHTML = hpCard + STATS.map((stat) => {
        const detail = STAT_DETAILS[stat.key];
        return `
        <div class="stat">
            <span class="stat-name">${detail.label}</span>
            <b class="stat-value">${esc(player[stat.key])}</b>
            <button class="stat-info-btn" data-stat="${stat.key}" type="button" aria-label="${detail.label}">!</button>
        </div>`;
    }).join('');

    // Клик по ℹ️ — popover с деталями стата или HP
    document.querySelectorAll('.stat-info-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (button.dataset.hp) {
                showHpInfo(button);
            } else {
                showStatInfo(button.dataset.stat, button);
            }
        });
    });

    renderInventoryPanel();
}

// ---------- Popover стата ----------
async function showStatInfo(statKey, anchor) {
    const detail = STAT_DETAILS[statKey];
    if (!detail) {
        return;
    }

    const value = playerData ? playerData[statKey] : 0;

    // Загрузка разбивки стата с сервера (fallback — просто База)
    let sourcesHtml = `<div class="popover-source"><span>База</span><span>${esc(value)}</span></div>`;
    let total = value;
    // Реальный шанс прокачки за ход приходит в data.chances.per_turn (11 * 0.98^avg)
    let chancePct = null;
    if (playerData && playerData.user_id) {
        try {
            const resp = await fetch(`${API_URL}/player/${playerData.user_id}/stat_breakdown`);
            if (resp.ok) {
                const data = await resp.json();
                const rows = (data.breakdown || {})[statKey] || [];
                if (rows.length) {
                    const totalRow = rows.find((row) => row.source === 'total');
                    if (totalRow) total = totalRow.value;
                    sourcesHtml = rows
                        .filter((row) => row.source !== 'total')
                        .map((row) => `<div class="popover-source"><span>${esc(row.label)}</span><span>${esc(row.value)}</span></div>`)
                        .join('');
                }
                if (data.chances && typeof data.chances.per_turn === 'number') {
                    chancePct = data.chances.per_turn;
                }
            }
        } catch (err) {
            // Оффлайн — оставляем fallback «База»
        }
    }

    const chanceHtml = detail.chance && chancePct !== null
        ? `<div class="popover-chance">Шанс прокачки за ход: ${chancePct.toFixed(1)}%</div>`
        : '';

    const popover = document.getElementById('statPopover');
    popover.innerHTML = `
        <div class="popover-header">${detail.label}</div>
        ${chanceHtml}
        ${sourcesHtml}
        <div class="popover-total">Итого: ${esc(total)}</div>
    `;

    popover.classList.remove('hidden');
    positionStatPopover(popover, anchor);
}

// ---------- Popover HP ----------
async function showHpInfo(anchor) {
    const current = playerData ? playerData.hp : 0;

    // Загрузка разбивки HP с сервера (fallback — просто База)
    let sourcesHtml = `<div class="popover-source"><span>База</span><span>${esc(current)}</span></div>`;
    let total = playerData ? playerData.max_hp : current;
    if (playerData && playerData.user_id) {
        try {
            const resp = await fetch(`${API_URL}/player/${playerData.user_id}/hp_breakdown`);
            if (resp.ok) {
                const data = await resp.json();
                const rows = data.breakdown || [];
                if (rows.length) {
                    const totalRow = rows.find((row) => row.source === 'total');
                    if (totalRow) total = totalRow.value;
                    sourcesHtml = rows
                        .filter((row) => row.source !== 'total')
                        .map((row) => `<div class="popover-source"><span>${esc(row.label)}</span><span>${esc(row.value)}</span></div>`)
                        .join('');
                }
            }
        } catch (err) {
            // Оффлайн — оставляем fallback «База»
        }
    }

    const popover = document.getElementById('statPopover');
    popover.innerHTML = `
        <div class="popover-header">Здоровье</div>
        ${sourcesHtml}
        <div class="popover-total">Итого: ${esc(total)}</div>
    `;

    popover.classList.remove('hidden');
    positionStatPopover(popover, anchor);
}

function positionStatPopover(popover, anchor) {
    // Скрываемые элементы списком ниже — координаты считаем после показа
    const rect = anchor.getBoundingClientRect();
    const size = popover.getBoundingClientRect();
    const mobile = window.innerWidth < 900;

    let left;
    let top;

    if (mobile) {
        // На мобильном popover появляется снизу от стата
        left = rect.left;
        if (left + size.width > window.innerWidth) {
            left = Math.max(8, window.innerWidth - size.width - 8);
        }
        top = rect.bottom + 6;
    } else {
        // На десктопе — справа от стата (если не влезает — слева)
        left = rect.right + 8;
        if (left + size.width > window.innerWidth) {
            left = Math.max(8, rect.left - size.width - 8);
        }
        top = rect.top + (rect.height - size.height) / 2;
    }

    if (top + size.height > window.innerHeight) {
        top = Math.max(8, window.innerHeight - size.height - 8);
    }
    if (top < 8) {
        top = 8;
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
}

function hideAllPopovers() {
    const popover = document.getElementById('statPopover');
    if (popover) {
        popover.classList.add('hidden');
    }
}

// ---------- Экран: Культивация ----------
function renderCultivation() {
    const cultivation = playerData && playerData.cultivation;
    if (!cultivation) {
        return;
    }

    document.getElementById('cultStageLine').textContent =
        `${cultivation.stage}.${cultivation.substage} ${cultivation.stage_name}`;
    document.getElementById('cultSubstage').textContent = `Стадия ${cultivation.substage}/9`;

    setBar(
        document.getElementById('cultFill'),
        document.getElementById('cultExpText'),
        cultivation.stage_experience,
        cultivation.stage_experience_needed
    );

    // Полоска Ци: 100% = полная (qi = max_qi - qi_depletion), 0% = пусто
    const qi = Math.max(0, (playerData.qi_depletion_max || 0) - (playerData.qi_depletion || 0));
    setBar(
        document.getElementById('qiFill'),
        document.getElementById('qiText'),
        qi,
        playerData.qi_depletion_max || 0
    );

    document.getElementById('cultInfo').innerHTML = `
        <div class="cult-chip">🌀 Ци: <b>${esc(cultivation.qi_type || '—')}</b></div>
        <div class="cult-chip">💠 Качество: <b>${esc(cultivation.qi_quality || '—')}</b></div>
    `;

    // Текущая локация + прибавки
    renderCurrentLocation();

    // Подготовка к прорыву: рисуем состояние или грузим прогноз
    if (breakthroughForecast) {
        renderCultivationPrep(breakthroughForecast);
    } else {
        loadBreakthroughForecast();
    }
}

// Блок «Текущая локация» (название, описание, бонусы локации)
function renderCurrentLocation() {
    const location = (playerData && playerData.location) || null;
    const box = document.getElementById('cultLocation');
    if (!box) {
        return;
    }
    if (!location || !location.name) {
        box.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');

    // Только бонусы из location.modifiers (регион/биом/тип/шанс событий не показываем)
    const mods = location.modifiers || {};
    const bonusItems = [];
    Object.keys(mods).forEach((key) => {
        if (key === 'tribulation_spot') {
            // Бонус только при не-нейтральных условиях кары
            const spot = mods[key] || {};
            if (spot.bonus && spot.bonus !== 'neutral') {
                bonusItems.push('🌀 Место небесной кары');
            }
            return;
        }
        const m = mods[key];
        if (typeof m === 'string') {
            bonusItems.push(`✨ ${m}`);
        } else if (m && typeof m === 'object') {
            const label = m.name || m.effect || key;
            const bonus = m.bonus || m.value || '';
            bonusItems.push(`✨ ${label}${bonus ? ` (${bonus})` : ''}`);
        }
    });

    box.innerHTML =
        `<div class="cult-location-title">📍 Текущая локация</div>` +
        `<div class="cult-location-name">${esc(location.name)}</div>` +
        `<div class="cult-location-desc">${esc(location.description || '—')}</div>` +
        (bonusItems.length
            ? `<div class="cult-location-chips"><span class="cult-chip"><b>Бонусы:</b></span>` +
              bonusItems.map((b) => `<span class="cult-chip">• ${esc(b)}</span>`).join('') +
              `</div>`
            : `<div class="cult-location-chips"><span class="cult-chip">Бонусов нет</span></div>`);
}

// ---------- Прорыв: подготовка к каре (Mini App) ----------
// Понятные сообщения об ошибках подготовки (код API → текст для игрока)
const PREP_ERRORS = {
    empty_core: 'Сначала выбери ядро стихии',
    empty_location: 'Сначала выбери место прорыва',
    invalid_location: 'Это место недоступно для прорыва',
    invalid_core: 'Недопустимое ядро стихии',
    not_enough_cores: 'У тебя нет этого ядра стихии',
    need_substage_9: 'Нужна 9-я стадия для прорыва',
    no_preparation: 'Сначала выбери место и ядро',
    resting: 'Сейчас ты восстанавливаешься',
    'player not found': 'Игрок не найден',
};

// Загрузка прогноза прорыва (GET /api/player/<id>/breakthrough/forecast)
async function loadBreakthroughForecast() {
    try {
        const data = await apiFetch(`/player/${userId}/breakthrough/forecast`);
        breakthroughForecast = data;
        syncPrepState(data);
        renderCultivationPrep(data);
    } catch (error) {
        showToast(error.message || 'Не удалось загрузить прогноз прорыва');
    }
}

// Синхронизация локального состояния выбора с данными сервера
function syncPrepState(forecast) {
    prepCores = (forecast.cores || []).slice();
    prepSelectedCore = forecast.selected_core || '';
}

// Управление видимостью блоков подготовки (вкладка «Культивация»)
function renderCultivationPrep(forecast) {
    const btnStart = document.getElementById('btnStartPrep');
    const notReady = document.getElementById('prepNotReady');
    const form = document.getElementById('prepForm');
    const done = document.getElementById('prepDone');
    if (!btnStart || !notReady || !form || !done) {
        // Старая разметка без формы подготовки — пропускаем
        return;
    }

    const ready = Boolean(forecast.ready);
    const canPrepare = Boolean(forecast.can_prepare);

    // Подготовка окончена: показываем итог, остальное прячем
    if (ready) {
        done.classList.remove('hidden');
        btnStart.classList.add('hidden');
        notReady.classList.add('hidden');
        form.classList.add('hidden');
        // Прорыв начнётся в текущей локации игрока
        const location = (playerData && playerData.location) || null;
        document.getElementById('prepLocationName').textContent = location
            ? location.name
            : '—';
        return;
    }

    // Форма открыта: прячем всё, кроме самой формы
    if (prepFormOpen) {
        btnStart.classList.add('hidden');
        notReady.classList.add('hidden');
        form.classList.remove('hidden');
        done.classList.add('hidden');
        renderPrepForm();
        return;
    }

    // Форма закрыта: кнопка старта (если можно готовиться) или причина
    btnStart.classList.toggle('hidden', !canPrepare);
    form.classList.add('hidden');
    done.classList.add('hidden');

    if (canPrepare) {
        notReady.classList.add('hidden');
        return;
    }

    // Причина недоступности: заголовок + чек-лист требований
    notReady.classList.remove('hidden');

    const reason = forecast.reason || '';
    if (reason === 'max_rank') {
        notReady.innerHTML = '🏔 Ты достиг предела культивации';
        return;
    }

    const nextStage = forecast.next_stage || {};
    const reqs = (forecast.requirements || []).map((req) => {
        const ok = Boolean(req.met);
        return `<li class="${ok ? 'req-ok' : 'req-fail'}">${esc(req.text)} ${ok ? '✓' : '✗'}</li>`;
    }).join('');

    const hints = (forecast.requirements || [])
        .filter((req) => !req.met && req.hint)
        .map((req) => `<div class="prep-hint">💡 ${esc(req.hint)}</div>`)
        .join('');

    notReady.innerHTML =
        `Для прорыва на ступень «${esc(nextStage.name || '…')}» необходимо:` +
        `<ul>${reqs}</ul>` +
        hints;
}

// Начало подготовки: открыть форму и заполнить списки локаций и ядер
function startPreparation() {
    prepFormOpen = true;
    renderPrepForm();
    renderCultivationPrep(breakthroughForecast);
}

// Заполнение формы подготовки: прогноз HP, локации, ядра и подсветка выбора
function renderPrepForm() {
    const hp = breakthroughForecast ? (breakthroughForecast.hp_forecast || 0) : 0;
    document.getElementById('prepHp').textContent = hp;

    renderPrepLocationBonus();

    // Текст «Кара начнётся здесь» — текущая локация игрока (место кары авто)
    const startBox = document.getElementById('prepStartHere');
    if (startBox) {
        const location = (playerData && playerData.location) || null;
        startBox.innerHTML = location
            ? `📍 Кара начнётся здесь: <b>${esc(location.name)}</b>`
            : '📍 Кара начнётся здесь: <b>—</b>';
    }

    const coresBox = document.getElementById('prepCores');
    if (prepCores.length) {
        coresBox.innerHTML = prepCores.map((core) => `
            <button class="prep-core${core.code === prepSelectedCore ? ' prep-selected' : ''}"
                    type="button" data-code="${esc(core.code)}">
                <span class="prep-core-icon">${ELEMENT_ICONS[core.element] || '🔥'}</span>
                <span class="prep-core-name">${esc(core.name)}</span>
                <span class="prep-core-count">×${esc(core.count)}</span>
            </button>`).join('');
        coresBox.querySelectorAll('.prep-core').forEach((button) => {
            button.addEventListener('click', () => selectCore(button.dataset.code));
        });
    } else {
        coresBox.innerHTML = '<div class="prep-empty">Нет ядер стихий. Собери их с монстров!</div>';
    }
}

// Текущая локация и бонусы следующей ступени (в форме подготовки)
function renderPrepLocationBonus() {
    const box = document.getElementById('prepLocationBonus');
    if (!box) {
        return;
    }
    const location = (playerData && playerData.location) || null;
    const nextStage = (breakthroughForecast && breakthroughForecast.next_stage) || {};
    const bonuses = [];
    if (nextStage.hp_bonus) {
        bonuses.push(`+${esc(nextStage.hp_bonus)} HP`);
    }
    if (nextStage.attack_bonus) {
        bonuses.push(`+${esc(nextStage.attack_bonus)} Атака`);
    }
    if (nextStage.defense_bonus) {
        bonuses.push(`+${esc(nextStage.defense_bonus)} Защита`);
    }
    if (nextStage.hp_regen) {
        bonuses.push(`+${esc(nextStage.hp_regen)} Реген`);
    }
    const locationLine = location && location.name
        ? `📍 Текущая локация: <b>${esc(location.name)}</b>`
        : '📍 Текущая локация: <b>—</b>';
    const bonusLine = bonuses.length
        ? `<div>После прорыва: <b>${bonuses.join(', ')}</b></div>`
        : '';
    box.innerHTML = `<div>${locationLine}</div>${bonusLine}`;
}

// Выбор ядра стихии — только локально (сохранится при «Закончить подготовку»)
function selectCore(code) {
    prepSelectedCore = code;
    renderPrepForm();
}

// Завершение подготовки: /prepare (сохранить выбор) → /finish (ready = 1)
async function finishPreparation() {
    if (!prepSelectedCore) {
        showToast('Выбери ядро стихии');
        return;
    }
    try {
        await apiFetch(`/player/${userId}/breakthrough/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                core_code: prepSelectedCore,
            }),
        });
        const data = await apiFetch(`/player/${userId}/breakthrough/finish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (data.success) {
            prepFormOpen = false;
            breakthroughForecast.ready = true;
            breakthroughForecast.selected_location = data.location_code;
            breakthroughForecast.selected_core = data.core_code;
            syncPrepState(breakthroughForecast);
            renderCultivationPrep(breakthroughForecast);
            showToast('Подготовка завершена!');
        }
    } catch (error) {
        // Форма остаётся открытой — игрок может исправить выбор
        showToast(PREP_ERRORS[error.code] || error.message || 'Не удалось завершить подготовку');
    }
}

// Отмена подготовки: полный сброс на сервере (локация, ядра, ready) и обновление UI
async function cancelPreparation() {
    prepFormOpen = false;
    prepSelectedCore = '';
    try {
        await apiFetch(`/player/${userId}/breakthrough/cancel`, { method: 'POST' });
    } catch (error) {
        showToast(error.message || 'Не удалось отменить подготовку');
    }
    await loadBreakthroughForecast();
    showToast('Подготовка отменена');
}

// ---------- Инвентарь (мини-панель на экране персонажа) ----------
function renderInventoryPanel() {
    const data = inventoryData;
    const inventory = (data && data.inventory) || {};
    const codes = Object.keys(inventory);

    document.getElementById('invEmpty').classList.toggle('hidden', codes.length > 0);

    // Первый элемент — всегда золото
    const tiles = [
        `<div class="item tile-gold" title="Золото">
            <span class="item-icon">💰</span>
            <span class="item-count">${esc(playerData ? playerData.gold : 0)}</span>
        </div>`,
    ];

    codes.forEach((code) => {
        const item = inventory[code];
        const usable = item.type === 'consumable';
        tiles.push(`
            <button class="item ${usable ? 'usable' : ''}" data-code="${esc(code)}" type="button" title="${esc(item.name)}">
                <span class="item-icon">${item.icon}</span>
                <span class="item-count">×${esc(item.count)}</span>
            </button>`);
    });

    const grid = document.getElementById('inventoryGrid');
    grid.innerHTML = tiles.join('');

    // Клик по расходнику — модальное окно с действием
    grid.querySelectorAll('.item[data-code]').forEach((cell) => {
        cell.addEventListener('click', () => openItemModal(inventory, cell.dataset.code));
    });
}

function openItemModal(inventory, code) {
    const item = inventory[code];
    if (!item) {
        return;
    }

    activeItemCode = code;
    const usable = item.type === 'consumable';

    document.getElementById('modalTitle').textContent = item.name;
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${item.icon}</div>
        <div class="modal-title">${esc(item.name)}</div>
        <div class="modal-desc">
            <div><span class="muted">Тип</span><span>${esc(ITEM_TYPE_LABELS[item.type] || 'Предмет')}</span></div>
            <div><span class="muted">Количество</span><span>×${esc(item.count)}</span></div>
        </div>
    `;

    document.getElementById('modalUse').classList.toggle('hidden', !usable);
    openModal();
}

// Использование зелья (POST /api/player/<id>/use_potion)
async function usePotion() {
    if (!activeItemCode) {
        return;
    }

    try {
        const data = await apiFetch(`/player/${userId}/use_potion`, { method: 'POST' });
        closeModal();

        if (data.success) {
            // Обновляем данные на месте, без полной перезагрузки
            playerData.hp = data.hp;
            playerData.max_hp = data.max_hp;
            const item = inventoryData.inventory[activeItemCode];
            if (item) {
                item.count = data.potions_left;
                if (item.count <= 0) {
                    delete inventoryData.inventory[activeItemCode];
                }
            }
            activeItemCode = null;
            renderCharacter();
            showToast(`+${data.heal} HP 💚`);
        }
    } catch (error) {
        closeModal();
        activeItemCode = null;
        const messages = {
            no_potion: 'Зелий лечения не осталось',
            full_hp: 'Здоровье уже полное',
            'player not found': 'Игрок не найден',
        };
        showToast(messages[error.code] || 'Не удалось использовать предмет');
    }
}

// ---------- Экран: Техники ----------
function renderTechniques() {
    const data = techniquesData;
    if (!data) {
        return;
    }

    const techniques = data.techniques || [];

    // Слоты экипировки
    const slots = document.getElementById('techSlots');
    slots.innerHTML = '';
    for (let index = 0; index < data.max_equipped; index += 1) {
        const technique = techniques[index];
        if (technique) {
            const icon = ELEMENT_ICONS[technique.element] || ELEMENT_ICONS.none;
            const cell = document.createElement('button');
            cell.className = 'tech-slot filled';
            cell.type = 'button';
            cell.dataset.code = technique.code;
            cell.title = `${technique.name} (Ур. ${technique.level})`;
            cell.innerHTML = `${icon}<span>${esc(technique.name)}</span>`;
            cell.addEventListener('click', () => openTechniqueModal(techniques, technique.code));
            slots.appendChild(cell);
        } else {
            const cell = document.createElement('div');
            cell.className = 'tech-slot empty';
            cell.textContent = '—';
            slots.appendChild(cell);
        }
    }

    document.getElementById('techEmpty').classList.toggle('hidden', techniques.length > 0);
    document.getElementById('techList').classList.toggle('hidden', techniques.length === 0);

    const list = document.getElementById('techList');
    list.innerHTML = techniques
        .map((technique) => {
            const icon = ELEMENT_ICONS[technique.element] || ELEMENT_ICONS.none;
            return `
            <button class="tech-item" data-code="${esc(technique.code)}" type="button">
                <span class="tech-item-icon">${icon}</span>
                <span class="tech-item-meta">
                    <span class="tech-item-name">${esc(technique.name)}</span>
                    <span class="tech-item-sub">${esc(technique.element || '—')}</span>
                </span>
                <span class="tech-item-level">Ур. ${esc(technique.level)}</span>
            </button>`;
        })
        .join('');

    // Клик по технике — модальное окно
    list.querySelectorAll('.tech-item').forEach((row) => {
        row.addEventListener('click', () => openTechniqueModal(techniques, row.dataset.code));
    });
}

function openTechniqueModal(techniques, code) {
    const technique = techniques.find((t) => t.code === code);
    if (!technique) {
        return;
    }

    const icon = ELEMENT_ICONS[technique.element] || ELEMENT_ICONS.none;
    document.getElementById('modalTitle').textContent = technique.name;
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${icon}</div>
        <div class="modal-title">${esc(technique.name)}</div>
        <div class="modal-desc">
            <div><span class="muted">Элемент</span><span>${esc(technique.element || '—')}</span></div>
            <div><span class="muted">Уровень</span><span>${esc(technique.level)}</span></div>
            <div><span class="muted">Экипирована</span><span>${technique.is_equipped ? 'да' : 'нет'}</span></div>
        </div>
    `;
    document.getElementById('modalUse').classList.add('hidden');
    openModal();
}

// ---------- Модальное окно ----------
function openModal() {
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    activeItemCode = null;
}

// ---------- Загрузка данных ----------
async function loadAll(showLoadingIndicator = true) {
    if (showLoadingIndicator) {
        showLoading();
    }

    try {
        const id = await ensureUserId();
        const [player, inventory, techniques] = await Promise.all([
            apiFetch(`/player/${id}`),
            apiFetch(`/player/${id}/inventory`),
            apiFetch(`/player/${id}/techniques`),
        ]);

        playerData = player;
        inventoryData = inventory;
        techniquesData = techniques;

        renderAll();
        hideLoading();
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        showError();
    }
}

function renderAll() {
    renderHeader();
    renderCharacter();
    renderCultivation();
    renderTechniques();
}

// ---------- Переключение вкладок ----------
function initTabs() {
    document.querySelectorAll('.tab').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(button.dataset.screen).classList.add('active');
            window.scrollTo({ top: 0 });

            // Свежий прогноз при открытии вкладки «Культивация»
            if (button.dataset.screen === 'screen-cultivation') {
                loadBreakthroughForecast();
            }
        });
    });
}

// ---------- Инициализация ----------
function init() {
    initTabs();

    document.getElementById('btnRefresh').addEventListener('click', () => loadAll(true));
    document.getElementById('btnRetry').addEventListener('click', () => loadAll(true));
    document.getElementById('btnModalClose').addEventListener('click', closeModal);
    document.getElementById('modalUse').addEventListener('click', usePotion);

    // Подготовка к прорыву: кнопки формы
    document.getElementById('btnStartPrep').addEventListener('click', startPreparation);
    document.getElementById('btnFinishPrep').addEventListener('click', finishPreparation);
    document.getElementById('btnCancelPrep').addEventListener('click', cancelPreparation);
    document.getElementById('btnCancelDone').addEventListener('click', cancelPreparation);

    // Закрытие модалки по клику на фон
    document.getElementById('modal').addEventListener('click', (event) => {
        if (event.target === document.getElementById('modal')) {
            closeModal();
        }
    });

    // Закрытие popover при клике вне стата и самого popover
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.stat') && !event.target.closest('.stat-popover')) {
            hideAllPopovers();
        }
    });

    loadAll(true);
}

document.addEventListener('DOMContentLoaded', init);