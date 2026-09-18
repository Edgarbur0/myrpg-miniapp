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

// Порядок показа локаций прорыва (Горы → Река → Пещера → Вулкан)
const BT_LOCATION_ORDER = { mountains: 0, river: 1, cave: 2, volcano: 3 };

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
let breakthroughForecast = null;

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
        const error = new Error(messages[response.status] || data.error || `HTTP ${response.status}`);
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

    // Характеристики с кнопкой-подсказкой
    document.getElementById('statsGrid').innerHTML = STATS.map((stat) => {
        const detail = STAT_DETAILS[stat.key];
        return `
        <div class="stat">
            <span class="stat-name">${detail.label}</span>
            <b class="stat-value">${esc(player[stat.key])}</b>
            <button class="stat-info-btn" data-stat="${stat.key}" type="button" aria-label="${detail.label}">!</button>
        </div>`;
    }).join('');

    // Клик по ℹ️ — popover с деталями стата
    document.querySelectorAll('.stat-info-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            showStatInfo(button.dataset.stat, button);
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
    const chanceHtml = detail.chance
        ? '<div class="popover-chance">Шанс улучшения в бою: 30%</div>'
        : '';

    // Загрузка разбивки стата с сервера (fallback — просто База)
    let sourcesHtml = `<div class="popover-source"><span>База</span><span>${esc(value)}</span></div>`;
    let total = value;
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
            }
        } catch (err) {
            // Оффлайн — оставляем fallback «База»
        }
    }

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

    document.getElementById('cultInfo').innerHTML = `
        <div class="cult-chip">🌀 Ци: <b>${esc(cultivation.qi_type || '—')}</b></div>
        <div class="cult-chip">💠 Качество: <b>${esc(cultivation.qi_quality || '—')}</b></div>
    `;

    // Блок «🌀 Прорыв» — только на 9-й стадии (искусство достигло пика)
    const atPeak = cultivation.substage >= 9;
    getBreakthroughBlock().classList.toggle('hidden', !atPeak);
    if (atPeak) {
        if (breakthroughForecast) {
            renderBreakthroughForecast(breakthroughForecast);
        } else {
            loadBreakthroughForecast();
        }
    }
    // Старая кнопка «💥 Прорыв» заменена блоком — прячем её
    document.getElementById('btnBreakthrough').classList.add('hidden');
}

// Медитация (POST /api/player/<id>/meditate): ци → опыт стадии
async function meditate() {
    try {
        const data = await apiFetch(`/player/${userId}/meditate`, { method: 'POST' });
        if (data.success) {
            // Обновляем данные на месте, без полной перезагрузки
            playerData.qi_depletion = data.qi_depletion;
            if (playerData.cultivation) {
                playerData.cultivation.stage_experience = data.stage_experience;
                if (data.substage !== undefined) {
                    playerData.cultivation.substage = data.substage;
                }
            }
            renderCultivation();
            renderHeader();
            if (data.stage_up) {
                showToast('✨ Стадия повышена!');
            } else {
                showToast(`+${data.exp_gained ?? 10} опыта стадии 🌀`);
            }
        }
    } catch (error) {
        showToast(error.message || 'Не удалось медитировать');
    }
}

// Прорыв (эндпоинт появится в следующих этапах)
async function breakthrough() {
    showToast('Прорыв недоступен — скоро!');
}

// ---------- Прорыв: прогноз и подготовка ----------
// Создаёт (один раз) и возвращает блок «🌀 Прорыв»
function getBreakthroughBlock() {
    let block = document.getElementById('breakthroughBlock');
    if (!block) {
        block = document.createElement('div');
        block.id = 'breakthroughBlock';
        block.className = 'breakthrough-block hidden';
        document.getElementById('screen-cultivation')
            .querySelector('.stats-panel')
            .appendChild(block);
    }
    return block;
}

// Загрузка прогноза прорыва (GET /api/player/<id>/breakthrough/forecast)
async function loadBreakthroughForecast() {
    try {
        const data = await apiFetch(`/player/${userId}/breakthrough/forecast`);
        breakthroughForecast = data;
        renderBreakthroughForecast(data);
    } catch (error) {
        showToast(error.message || 'Не удалось загрузить прогноз прорыва');
    }
}

// Отрисовка прогноза кары и кнопок выбора локации
function renderBreakthroughForecast(forecast) {
    const block = getBreakthroughBlock();
    if (!forecast.available) {
        block.classList.add('hidden');
        return;
    }

    // Урон по волнам из массива: 28 / 33 / 38
    const waveDamage = Array.isArray(forecast.damage)
        ? forecast.damage.join(' / ')
        : forecast.damage;
    const surviveText = forecast.will_survive ? 'выживешь' : 'не выживешь';

    // Локации из API в фиксированном порядке: Горы, Река, Пещера, Вулкан
    const locations = (forecast.locations || [])
        .slice()
        .sort((a, b) => (BT_LOCATION_ORDER[a.code] ?? 9) - (BT_LOCATION_ORDER[b.code] ?? 9));

    const selectedCode = forecast.selected_location || null;
    const selectedLocation = locations.find((item) => item.code === selectedCode) || null;
    const selectedInfoHtml = selectedLocation ? `
        <div class="bt-selected-info">
            <div class="bt-selected-name">✨ Выбрано: ${esc(selectedLocation.name)}</div>
            ${selectedLocation.effect
                ? `<div class="bt-selected-effect">${esc(selectedLocation.effect)}</div>`
                : ''}
        </div>` : '';

    // Если доступных мест нет — не показываем пустую сетку
    const locationsHtml = locations.length ? `
        <div class="bt-locations-title">🌍 Выбери место прорыва:</div>
        <div class="bt-locations">
            ${locations.map((location) => `
                <button class="bt-loc${location.code === selectedCode ? ' bt-loc-selected' : ''}"
                        type="button" data-code="${esc(location.code)}">
                    <span class="bt-loc-name">${esc(location.name)}</span>
                    <span class="bt-loc-effect">${esc(location.effect || '')}</span>
                </button>`).join('')}
        </div>` : `<div class="bt-locations-empty">🌍 Нет доступных мест для прорыва. Прокачайся.</div>`;

    block.classList.remove('hidden');
    block.innerHTML = `
        <div class="breakthrough-title">🌀 Прорыв</div>
        <div class="breakthrough-info">
            <div class="bt-row">Мощь: <b>${esc(forecast.power)}</b></div>
            <div class="bt-row">Волн: <b>${esc(forecast.waves)}</b></div>
            <div class="bt-row">Урон по волнам: <b>${esc(waveDamage)}</b></div>
            <div class="bt-row">Итого: <b>${esc(forecast.total_damage)}</b></div>
            <div class="bt-row">❤️ Ты <b>${surviveText}</b></div>
            <div class="bt-row">Прогноз HP после кары: <b>${esc(forecast.survive_hp)}</b></div>
        </div>
        ${selectedInfoHtml}
        ${locationsHtml}
        <button class="btn btn-outline bt-cancel" type="button">
            ${selectedCode ? '❌ Отменить выбор' : '❌ Отмена'}
        </button>
    `;

    // Клик по локации — подготовка прорыва (или смена выбора)
    block.querySelectorAll('.bt-loc').forEach((button) => {
        button.addEventListener('click', () => prepareBreakthrough(button.dataset.code));
    });

    // При выборе — сброс выбора, иначе — скрытие блока
    const cancel = block.querySelector('.bt-cancel');
    if (selectedCode) {
        cancel.addEventListener('click', cancelBreakthrough);
    } else {
        cancel.addEventListener('click', () => block.classList.add('hidden'));
    }
}

// Сохранение выбора локации (POST /api/player/<id>/breakthrough/prepare)
async function prepareBreakthrough(locationCode) {
    try {
        const data = await apiFetch(`/player/${userId}/breakthrough/prepare`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location_code: locationCode }),
        });
        showToast(data.message || 'Выбор локации сохранён');
        // Блок не скрываем — подсвечиваем выбранную локацию и перерисовываем
        breakthroughForecast = breakthroughForecast || {};
        breakthroughForecast.selected_location = locationCode;
        renderBreakthroughForecast(breakthroughForecast);
    } catch (error) {
        showToast(error.message || 'Не удалось сохранить выбор локации');
    }
}

// Сброс выбора места прорыва (POST /api/player/<id>/breakthrough/cancel)
async function cancelBreakthrough() {
    try {
        const data = await apiFetch(`/player/${userId}/breakthrough/cancel`, {
            method: 'POST',
        });
        breakthroughForecast.selected_location = null;
        renderBreakthroughForecast(breakthroughForecast);
        showToast(data.message || 'Выбор локации сброшен');
    } catch (error) {
        showToast(error.message || 'Не удалось сбросить выбор');
    }
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

    // Культивация
    document.getElementById('btnMeditate').addEventListener('click', meditate);
    document.getElementById('btnBreakthrough').addEventListener('click', breakthrough);

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