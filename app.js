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

// Подписи статов готового предмета (ключи из craft stats)
const CRAFT_STAT_LABELS = {
    damage: 'Атака',
    armor: 'Броня',
    hp: 'HP',
    endurance: 'Выносливость',
    agility: 'Ловкость',
    intelligence: 'Интеллект',
    luck: 'Удача',
    spirit: 'Дух',
    qi: 'Ци',
};

// Подписи категорий материалов (ключи из craft slot categories)
const CRAFT_CATEGORY_LABELS = {
    wood: 'Дерево',
    metal: 'Металл',
    stone: 'Камень',
    herb: 'Трава',
    crystal: 'Кристалл',
    bone: 'Кость',
    leather: 'Шкура',
    core: 'Ядро',
    any_material: 'любой материал', // свободный слот (кроме камня и ядер)
};

// Русские названия материалов (для превью разборки по кодам из player_items)
const MATERIAL_NAMES = {
    dry_wood: 'Сухое дерево',
    iron_ingot: 'Слиток железа',
    stone: 'Камень',
    herb_qi: 'Трава ци',
    wolf_pelt: 'Шкура волка',
    wolf_fang: 'Клык волка',
    spirit_crystal: 'Кристалл духа',
    fire_core: 'Ядро пламени',
    water_core: 'Водное ядро',
    wood_core: 'Древесное ядро',
    metal_core: 'Металлическое ядро',
    earth_core: 'Земляное ядро',
    element_core: 'Ядро стихий',
};

// Подписи стихий
const CRAFT_ELEMENT_LABELS = {
    fire: 'Огонь',
    water: 'Вода',
    wood: 'Дерево',
    metal: 'Металл',
    earth: 'Земля',
    spirit: 'Дух',
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
let equipmentData = null;
let toastTimer = null;
let activeItemCode = null;
let activeInstanceId = null;        // выбранный экземпляр экипировки (для надевания)
let activeEquipSlot = null;        // слот, открытый для снятия (модалка экипировки)
let breakthroughForecast = null;     // прогноз прорыва (GET /breakthrough/forecast)
// Подготовка к прорыву: списки и выбранные значения (переживают перерисовку)
let prepCores = [];
let prepSelectedCore = '';
let prepFormOpen = false;            // открыта ли форма подготовки
let craftRecipes = [];              // рецепты крафта (GET /api/crafts)
let activeCraftCode = null;         // выбранный рецепт (детали справа)
let craftDetail = null;             // детали рецепта (GET /api/crafts/<code>)
let craftSelections = {};           // 'slot_1' | 'slot_2' -> код материала
let craftSelectedMats = {};         // 'slot_1' | 'slot_2' -> объект материала (иконка/имя/статы)
let craftMaterialModal = null;      // {'slot', 'categories', 'materials'} для модалки
let craftMaterialPending = null;    // код материала, выделенного в модалке (ещё не выбран)

// Подписи требований материалов (ключи items.requirements)
const REQUIREMENT_LABELS = {
    strength: 'Сила',
    agility: 'Ловкость',
    intelligence: 'Интеллект',
    endurance: 'Выносливость',
    luck: 'Удача',
    spirit: 'Дух',
    cultivation_stage: 'Ступень культивации',
    element: 'Сродство стихии',
    element_fire: 'Сродство Огня',
    element_water: 'Сродство Воды',
    element_wood: 'Сродство Дерева',
    element_metal: 'Сродство Металла',
    element_earth: 'Сродство Земли',
};

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

    // HP в шапке: компактно, всегда видно
    document.getElementById('hpChip').textContent = `❤️ ${esc(player.hp)}/${esc(player.max_hp)}`;

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

    // Характеристики с кнопками.
    // Первая строка — прокачиваемые (Сила/Ловкость/Выносливость) с кнопкой «+»
    // (трата 1 БП); остальные (Урон/Удача/Броня) — ниже, только «!».
    const bp = player.battle_points || 0;
    const hasBp = bp >= 1;
    const trainable = ['strength', 'agility', 'endurance'];
    const others = ['damage', 'luck', 'armor'];

    // Счётчик БП у заголовка «Статы»
    const bpEl = document.getElementById('bpCounter');
    if (bpEl) bpEl.textContent = `💠 ${bp}`;

    const statRow = (stats) => stats.map((stat) => {
        const detail = STAT_DETAILS[stat.key];
        const canUpgrade = trainable.includes(stat.key);
        const bpBtn = canUpgrade
            ? `<button class="stat-bp-btn" data-stat="${stat.key}" type="button" aria-label="Рост ${detail.label} (1 БП)" ${hasBp ? '' : 'disabled'}>+</button>`
            : '';
        const infoBtn = `<button class="stat-info-btn" data-stat="${stat.key}" type="button" aria-label="${detail.label}">!</button>`;
        return `
        <div class="stat">
            <span class="stat-name">${detail.label}</span>
            <b class="stat-value">${esc(player[stat.key])}</b>
            <span class="stat-actions">${bpBtn}${infoBtn}</span>
        </div>`;
    }).join('');

    document.getElementById('statsGrid').innerHTML =
        statRow(STATS.filter((s) => trainable.includes(s.key))) +
        statRow(STATS.filter((s) => others.includes(s.key)));

    // Клик по «+» — трата 1 БП на стат
    document.querySelectorAll('.stat-bp-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            spendBattlePoint(button.dataset.stat, button);
        });
    });

    // Клик по ℹ️ — popover с деталями стата или HP
    document.querySelectorAll('.stat-info-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            showStatInfo(button.dataset.stat, button);
        });
    });

    renderInventoryPanel();
    renderEquipment();
}

// ---------- Трата БП на стат ----------
async function spendBattlePoint(statKey, button) {
    if (!playerData || !playerData.user_id) return;
    button.disabled = true;
    try {
        const resp = await fetch(`${API_URL}/player/${playerData.user_id}/stat/spend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stat: statKey }),
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            console.warn('spend BP:', data.error);
            button.disabled = false;
            return;
        }
        // Обновляем локальные данные и перерисовываем экран персонажа.
        // Профиль показывает эффективный стат (накопленный + экипировка)
        playerData[statKey] = data.new_value + (data.equipment_bonus || 0);
        playerData.battle_points = data.battle_points;
        renderCharacter();
    } catch (err) {
        console.warn('spend BP failed:', err);
        button.disabled = false;
    }
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
    // Реальный шанс прокачки этого стата приходит в data.chances[statKey]
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
                if (data.chances && typeof data.chances.battle_point_chance === 'number') {
                    chancePct = data.chances.battle_point_chance;
                }
            }
        } catch (err) {
            // Оффлайн — оставляем fallback «База»
        }
    }

    const chanceHtml = detail.chance && chancePct !== null
        ? `<div class="popover-chance">Шанс БП за ход: ${chancePct.toFixed(1)}%</div>`
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

        // Экипировка с экземплярами (player_items) — карточка на каждый экземпляр.
        // Каждый крафченый предмет уникален: показываем отдельные плитки,
        // чтобы надетый экземпляр был явно помечен.
        if (item.instances && item.instances.length) {
            item.instances.forEach((inst) => {
                const equipped = inst.equipped;
                tiles.push(`
                    <button class="item item-equip${equipped ? ' item-equipped' : ''}"
                            data-code="${esc(code)}" data-instance-id="${inst.id}"
                            type="button" title="${esc(item.name)}${equipped ? ' — надето' : ''}">
                        <span class="item-icon">${item.icon}</span>
                        ${equipped ? '<span class="item-badge" title="Надето">🔒</span>' : ''}
                    </button>`);
            });
            return;
        }

        // Стекируемый предмет (материалы, расходники) — одна карточка
        const usable = item.type === 'consumable';
        tiles.push(`
            <button class="item ${usable ? 'usable' : ''}" data-code="${esc(code)}" type="button" title="${esc(item.name)}">
                <span class="item-icon">${item.icon}</span>
                <span class="item-count">×${esc(item.count)}</span>
            </button>`);
    });

    const grid = document.getElementById('inventoryGrid');
    grid.innerHTML = tiles.join('');

    // Клик по предмету — модальное окно с действием
    grid.querySelectorAll('.item[data-code]').forEach((cell) => {
        cell.addEventListener('click', () => openItemModal(inventory, cell.dataset.code, cell.dataset.instanceId));
    });
}

function openItemModal(inventory, code, instanceId) {
    const item = inventory[code];
    if (!item) {
        return;
    }

    activeItemCode = code;
    activeInstanceId = instanceId ? Number(instanceId) : null;
    const usable = item.type === 'consumable';
    const equipable = item.type === 'equipment';

    // Бонусы конкретного экземпляра (или первого из player_items),
    // Fallback на каталог для экипировки без экземпляров (дроп/награда).
    let stats = {};
    if (item.instances && item.instances.length) {
        const inst = activeInstanceId
            ? item.instances.find((i) => i.id === activeInstanceId)
            : item.instances[0];
        stats = (inst && inst.stats) || {};
    } else {
        stats = item.stats || {};
    }
    const bonuses = Object.entries(stats)
        .map(([key, value]) => `${CRAFT_STAT_LABELS[key] || key} +${value}`)
        .join(', ');
    const bonusRow = bonuses
        ? `<div><span class="muted">Бонус</span><span>${esc(bonuses)}</span></div>`
        : '';

    // Для отдельного экземпляра вместо количества показываем его номер
    const countLine = activeInstanceId
        ? `<div><span class="muted">Экземпляр</span><span>#${activeInstanceId}</span></div>`
        : `<div><span class="muted">Количество</span><span>×${esc(item.count)}</span></div>`;

    // Пометка «надето» для конкретного экземпляра
    const equippedText = item.instances && activeInstanceId
        && item.instances.some((i) => i.id === activeInstanceId && i.equipped)
        ? '<div><span class="muted">Статус</span><span>🔒 Надето</span></div>'
        : '';

    // Активный экземпляр: материалы крафта (превью разборки) и флаг «надето»
    const activeInst = activeInstanceId
        ? (item.instances || []).find((i) => i.id === activeInstanceId)
        : null;
    const materials = (activeInst && activeInst.materials) || {};
    const materialCodes = Object.keys(materials);
    const isEquipped = !!activeInst && activeInst.equipped;
    const disassemblable = !!activeInst && materialCodes.length > 0 && !isEquipped;

    // Превью разборки: возврат 50% материалов, округление вверх (как на сервере)
    let disassembleRow = '';
    if (materialCodes.length) {
        const parts = materialCodes.map((code) => {
            const name = MATERIAL_NAMES[code] || code;
            const count = Math.max(1, Math.ceil(materials[code] * 0.5));
            return `${esc(name)}×${count}`;
        });
        disassembleRow = `<div><span class="muted">Разборка</span><span>${parts.join(', ')}</span></div>`;
    }

    document.getElementById('modalTitle').textContent = item.name;
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${item.icon}</div>
        <div class="modal-title">${esc(item.name)}</div>
        <div class="modal-desc">
            <div><span class="muted">Тип</span><span>${esc(ITEM_TYPE_LABELS[item.type] || 'Предмет')}</span></div>
            ${countLine}
            ${equippedText}
            ${disassembleRow}
            ${bonusRow}
        </div>
    `;

    document.getElementById('modalUse').textContent = equipable ? 'Надеть' : 'Использовать';
    document.getElementById('modalUse').classList.toggle('hidden', !(usable || equipable));

    // Действия с предметом: разобрать (крафченый) и удалить (не надетый)
    document.getElementById('modalDisassemble').classList.toggle('hidden', !disassemblable);
    document.getElementById('modalDelete').classList.toggle('hidden', isEquipped);
    document.getElementById('modalActions').classList.toggle(
        'hidden', !disassemblable && isEquipped
    );
    openModal();
}

// ---------- Экипировка ----------
function renderEquipment() {
    const data = equipmentData;
    if (!data) {
        return;
    }

    const box = document.getElementById('equipmentSlots');
    box.innerHTML = (data.slots || []).map((slot) => {
        const equipped = data.equipment[slot.key];
        if (equipped) {
            return `
            <button class="equip-slot filled" data-slot="${esc(slot.key)}" type="button" title="${esc(equipped.name)}">
                <span class="equip-icon">${equipped.icon}</span>
                <span class="equip-name">${esc(equipped.name)}</span>
            </button>`;
        }
        return `<div class="equip-slot empty" title="${esc(slot.name)}">${slot.icon}</div>`;
    }).join('');

    // Клик по надетому слоту — модалка со «Снять»
    box.querySelectorAll('.equip-slot.filled').forEach((cell) => {
        cell.addEventListener('click', () => openEquippedModal(cell.dataset.slot));
    });

    // Суммарные бонусы экипировки в заголовке карточки
    const bonuses = data.bonuses || {};
    const parts = [];
    if (bonuses.attack) parts.push(`⚔️+${bonuses.attack}`);
    if (bonuses.armor) parts.push(`🛡️+${bonuses.armor}`);
    if (bonuses.hp) parts.push(`❤️+${bonuses.hp}`);
    document.getElementById('equipBonuses').textContent = parts.join(' ');
}

function openEquippedModal(slot) {
    const data = equipmentData;
    const equipped = data && data.equipment[slot];
    if (!equipped) {
        return;
    }

    activeEquipSlot = slot;
    activeItemCode = null;
    activeInstanceId = null;

    // Бонусы надетого экземпляра (учитываются бонусы крафта)
    const stats = equipped.stats || {};
    const bonusText = Object.entries(stats)
        .map(([key, value]) => `${CRAFT_STAT_LABELS[key] || key} +${value}`)
        .join(', ');
    const slotMeta = (data.slots || []).find((s) => s.key === slot);

    document.getElementById('modalTitle').textContent = equipped.name;
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${equipped.icon}</div>
        <div class="modal-title">${esc(equipped.name)}</div>
        <div class="modal-desc">
            <div><span class="muted">Слот</span><span>${esc(slotMeta ? slotMeta.name : slot)}</span></div>
            ${bonusText ? `<div><span class="muted">Бонус</span><span>${esc(bonusText)}</span></div>` : ''}
        </div>
    `;
    document.getElementById('modalUse').textContent = 'Снять';
    document.getElementById('modalUse').classList.remove('hidden');
    openModal();
}

// Надевание снаряжения (POST /api/player/<id>/equip)
async function equipItem(code, instanceId) {
    try {
        const data = await apiFetch(`/player/${userId}/equip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                item_code: code,
                ...(instanceId ? { instance_id: instanceId } : {}),
            }),
        });
        closeModal();
        if (data.success) {
            playerData = data.player;
            equipmentData = data.equipment;
            if (data.inventory) {
                inventoryData = data.inventory;
            }
            renderHeader();
            renderCharacter();
            showToast(data.message || 'Надето');
        }
    } catch (error) {
        closeModal();
        const messages = {
            resting: 'Ты восстанавливаешься',
            equip_failed: 'Не удалось надеть',
            'player not found': 'Игрок не найден',
        };
        showToast(messages[error.code] || error.message || 'Не удалось надеть');
    }
}

// Снятие снаряжения (POST /api/player/<id>/unequip)
async function unequipItem(slot) {
    try {
        const data = await apiFetch(`/player/${userId}/unequip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot }),
        });
        closeModal();
        if (data.success) {
            playerData = data.player;
            equipmentData = data.equipment;
            if (data.inventory) {
                inventoryData = data.inventory;
            }
            renderHeader();
            renderCharacter();
            showToast(data.message || 'Снято');
        }
    } catch (error) {
        closeModal();
        const messages = {
            resting: 'Ты восстанавливаешься',
            unequip_failed: 'Не удалось снять',
            'player not found': 'Игрок не найден',
        };
        showToast(messages[error.code] || error.message || 'Не удалось снять');
    }
}

// Кнопка модалки: использовать зелье / надеть / снять
async function onModalUse() {
    // Сначала снятие — activeEquipSlot задействован только модалкой экипировки
    if (activeEquipSlot) {
        await unequipItem(activeEquipSlot);
        return;
    }
    if (!activeItemCode) {
        return;
    }
    const item = inventoryData && inventoryData.inventory[activeItemCode];
    if (item && item.type === 'equipment') {
        await equipItem(activeItemCode, activeInstanceId);
        return;
    }
    await usePotion();
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

// Разборка предмета (POST /api/player/<id>/disassemble)
async function disassembleItemAction() {
    if (!activeItemCode || !activeInstanceId) {
        return;
    }
    const item = inventoryData && inventoryData.inventory[activeItemCode];
    const name = item ? item.name : activeItemCode;
    if (!confirm(`Разобрать «${name}»? Материалы вернутся частично (50%).`)) {
        return;
    }

    try {
        const data = await apiFetch(`/player/${userId}/disassemble`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance_id: activeInstanceId }),
        });
        closeModal();
        if (data.success) {
            if (data.inventory) {
                inventoryData = data.inventory;
            }
            renderInventoryPanel();
            const parts = (data.materials || [])
                .map((material) => `${material.name}×${material.count}`)
                .join(', ');
            showToast(`⚒️ Разобрано: ${parts}`);
        }
    } catch (error) {
        closeModal();
        const messages = {
            resting: 'Ты восстанавливаешься',
            disassemble_failed: 'Не удалось разобрать',
            'player not found': 'Игрок не найден',
        };
        showToast(messages[error.code] || error.message || 'Не удалось разобрать');
    }
}

// Удаление предмета (POST /api/player/<id>/delete_item)
async function deleteItemAction() {
    const item = inventoryData && inventoryData.inventory[activeItemCode];
    const name = item ? item.name : (activeItemCode || 'предмет');
    if (!confirm(`Удалить «${name}»? Это действие необратимо.`)) {
        return;
    }

    const body = activeInstanceId
        ? { instance_id: activeInstanceId }
        : { item_code: activeItemCode, count: 1 };

    try {
        const data = await apiFetch(`/player/${userId}/delete_item`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        closeModal();
        if (data.success) {
            if (data.inventory) {
                inventoryData = data.inventory;
            }
            renderInventoryPanel();
            showToast('🗑️ Предмет удалён');
        }
    } catch (error) {
        closeModal();
        const messages = {
            resting: 'Ты восстанавливаешься',
            delete_failed: 'Не удалось удалить',
            'player not found': 'Игрок не найден',
        };
        showToast(messages[error.code] || error.message || 'Не удалось удалить');
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
    document.getElementById('modalActions').classList.add('hidden');
    activeItemCode = null;
    activeInstanceId = null;
    activeEquipSlot = null;
}

// ---------- Экран: Крафт ----------

// Загрузка рецептов (при открытии вкладки)
async function loadCrafts() {
    try {
        const data = await apiFetch(`/crafts`);
        craftRecipes = data.crafts || [];
    } catch (error) {
        craftRecipes = [];
    }
    // Перезагружаем детали выбранного рецепта, если он открыт
    if (activeCraftCode) {
        await loadCraftDetail(activeCraftCode);
    }
    renderCrafts();
}

// Список рецептов (левая колонка 50%)
function renderCrafts() {
    const box = document.getElementById('craftRecipes');
    const empty = document.getElementById('craftEmpty');
    empty.classList.toggle('hidden', craftRecipes.length > 0);

    box.innerHTML = craftRecipes.map((craft) => `
        <button class="craft-recipe${craft.code === activeCraftCode ? ' craft-recipe-active' : ''}"
                type="button" data-code="${esc(craft.code)}">
            <span class="craft-recipe-icon">🔨</span>
            <span class="craft-recipe-info">
                <span class="craft-recipe-name">${esc(craft.name)}</span>
                <span class="craft-recipe-desc">${esc(craft.description)}</span>
            </span>
        </button>`).join('');

    box.querySelectorAll('.craft-recipe').forEach((button) => {
        button.addEventListener('click', () => openCraft(button.dataset.code));
    });
}

// Детали рецепта (правая колонка)
function renderCraftDetail() {
    const detailBox = document.getElementById('craftDetail');
    const hint = document.getElementById('craftDetailHint');
    const recipe = craftDetail && craftDetail.craft;

    if (!recipe) {
        detailBox.innerHTML = '';
        if (hint) {
            hint.classList.remove('hidden');
        }
        return;
    }
    if (hint) {
        hint.classList.add('hidden');
    }

    const resultItem = craftDetail.result_item || {};
    const baseStats = recipe.result_stats || {};
    // Слоты рецепта: от 1 до 5 (у «Ядра стихий» все 5 слотов — ядра)
    const slotNums = [1, 2, 3, 4, 5];
    const slotsDef = slotNums.map((n) => ({
        key: `slot_${n}`,
        cats: recipe[`slot_${n}_categories`] || [],
        required: !!recipe[`slot_${n}_required`],
        label: `Слот ${n}`,
        requiredMark: recipe[`slot_${n}_required`] ? ' *' : '',
        sel: craftSelectedMats[`slot_${n}`] || null,
    }));
    const sels = slotsDef.map((slot) => slot.sel);
    const selCodes = Object.keys(craftSelections).filter((key) => craftSelections[key]);

    // Бонусы: базовые статы + суммарные статы ингредиентов + комбо
    const bonuses = computeCraftBonuses(recipe, ...sels);
    const combo = bonuses.combo || null;
    // Название предмета: у «Ядра стихий» своё динамическое имя по набору ядер,
    // у обычных рецептов — комбо (напр. «Магический меч») или имя по умолчанию
    const isElementCore = recipe.code === 'element_core';
    const shownName = isElementCore
        ? elementCoreDisplayName(sels.filter(Boolean))
        : (combo && combo.name) || recipe.result_name || recipe.name;

    const ready = slotsDef.filter((slot) => slot.required).every((slot) => !!slot.sel)
        && !(isElementCore && selCodes.length === 0);

    // Объединённые требования выбранных материалов (для панели ✅/⚠️)
    const aggregateReqs = craftAggregateRequirements(...sels);
    const reqHtml = aggregateReqs.length ? `
        <div class="tinkers-req-title">Требования материалов (мягкий штраф при несоответствии):</div>
        ${aggregateReqs.map((req) => `
            <div class="tinkers-req ${req.met ? 'tinkers-req-met' : 'tinkers-req-unmet'}">
                <span>${req.met ? '✅' : '⚠️'}</span>
                <span>${REQUIREMENT_LABELS[req.key] || req.key}: ${req.value}/${req.required}</span>
                ${req.met ? '' : '<span class="tinkers-req-penalty">штраф</span>'}
            </div>`).join('')}
        <div class="tinkers-req-note">Невыполненные требования снизят характеристики предмета.</div>`
        : '';

    const bonusHtml = Object.keys(bonuses.stats || {}).length
        ? Object.entries(bonuses.stats).map(([key, value]) => {
            const baseValue = baseStats[key] || 0;
            const inherited = value - baseValue;
            const inheritedText = inherited > 0
                ? ` <span class="craft-bonus-inherit">(+${inherited} из материалов)</span>`
                : '';
            return `
                <div class="craft-bonus">
                    <span class="craft-bonus-label">${CRAFT_STAT_LABELS[key] || key}</span>
                    <span class="craft-bonus-value">+${value}${inheritedText}</span>
                </div>`;
        }).join('')
        : '<div class="craft-empty-inline">Минимальные характеристики</div>';

    const elementText = bonuses.element && bonuses.element !== 'none'
        ? `<div class="craft-element">Стихия: <b>${CRAFT_ELEMENT_LABELS[bonuses.element] || bonuses.element}</b></div>`
        : '';

    // Баннер комбо: название, описание и бонусные характеристики
    const comboHtml = combo ? `
        <div class="craft-combo">
            <div class="craft-combo-title">✨ ${esc(combo.name || 'Комбо!')}</div>
            ${combo.description ? `<div class="craft-combo-desc">${esc(combo.description)}</div>` : ''}
            ${(Object.keys(combo.stats || {}).length || combo.element) ? `
                <div class="craft-combo-chips">
                    ${Object.entries(combo.stats || {}).map(([key, value]) => {
                        const sign = value > 0 ? '+' : '';
                        return `<span class="craft-combo-chip">${CRAFT_STAT_LABELS[key] || key} ${sign}${value}</span>`;
                    }).join('')}
                    ${combo.element ? `<span class="craft-combo-chip craft-combo-element">${CRAFT_ELEMENT_LABELS[combo.element] || combo.element}</span>` : ''}
                </div>` : ''}
        </div>` : '';

    const slotsHtml = slotsDef.map((slot) => `
        <div class="craft-slot">
            <div class="craft-slot-label">${slot.label}${slot.requiredMark} · ${esc(craftCategoriesLabel(slot.cats))}</div>
            <button class="craft-slot-btn${slot.sel ? ' craft-slot-filled' : ''}"
                    type="button" data-slot="${slot.key}" data-categories="${esc((slot.cats || []).join(','))}">
                ${slot.sel
                    ? `${renderMaterialCell(slot.sel)}`
                    : '<span class="craft-slot-placeholder">Выбрать материал…</span>'}
            </button>
        </div>`).join('');

    detailBox.innerHTML = `
        <div class="craft-detail-header">
            <span class="craft-detail-icon">${recipe.result_icon || '🔨'}</span>
            <div class="craft-detail-title">
                <div class="craft-detail-name">${esc(shownName)}</div>
                <div class="craft-detail-desc">${esc(recipe.description || '')}</div>
            </div>
        </div>
        <div class="craft-detail-slots">
            ${slotsHtml}
        </div>
        ${comboHtml}
        ${reqHtml}
        <div class="craft-detail-bonuses">
            <div class="craft-detail-title-small">Характеристики предмета</div>
            ${bonusHtml}
            ${elementText}
        </div>
        <button class="btn btn-primary" id="btnDoCraft2" type="button" ${ready ? '' : 'disabled'}>
            ⚒️ Создать
        </button>`;

    detailBox.querySelectorAll('.craft-slot-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const slot = button.dataset.slot;
            const categories = (button.dataset.categories || '').split(',').filter(Boolean);
            openCraftMaterialModal(slot, categories);
        });
    });
    const btnDoCraft2El = document.getElementById('btnDoCraft2');
    if (btnDoCraft2El) {
        btnDoCraft2El.addEventListener('click', doCraft2);
    }
}

// Объединение требований выбранных материалов: по ключу берётся максимум
function craftAggregateRequirements(...materialArgs) {
    const byKey = {};
    materialArgs.forEach((material) => {
        if (!material) {
            return;
        }
        (material.requirements || []).forEach((req) => {
            if (!byKey[req.key]) {
                byKey[req.key] = { ...req };
                return;
            }
            byKey[req.key].required = Math.max(byKey[req.key].required, req.required);
            byKey[req.key].value = Math.max(byKey[req.key].value || 0, req.value || 0);
            byKey[req.key].met = byKey[req.key].met && req.met;
        });
    });
    return Object.values(byKey);
}

function renderMaterialCell(material) {
    // Бейдж ⚠️ у материала с невыполненными требованиями (мягкий штраф)
    const badge = (material.requirements_met === false)
        ? ' <span class="tinkers-req-badge tinkers-req-badge-warn" title="Требования не выполнены — будет штраф">⚠️</span>'
        : '';
    return `
        <span class="craft-material-icon">${material.icon || '📦'}</span>
        <span class="craft-material-name">${esc(material.name)}${badge}</span>
        <span class="craft-material-count">×${esc(material.count)}</span>`;
}

// Категории через запятую с понятными подписями
function craftCategoriesLabel(categories) {
    if (!Array.isArray(categories) || categories.length === 0) {
        return 'любые';
    }
    return categories
        .map((category) => CRAFT_CATEGORY_LABELS[category] || category)
        .join(', ');
}

// Имя «Ядра стихий» по набору ядер (зеркало server element_core_display_name)
function elementCoreDisplayName(coreMaterials) {
    const materials = coreMaterials.filter(Boolean);
    const count = materials.length;
    if (count === 0) {
        return 'Ядро стихий';
    }
    const CORE_NAME_BY_ELEMENT = {
        fire: 'Ядро огня',
        water: 'Ядро воды',
        wood: 'Ядро дерева',
        metal: 'Ядро металла',
        earth: 'Ядро земли',
    };
    if (count === 1) {
        return CORE_NAME_BY_ELEMENT[materials[0].element] || 'Ядро стихий';
    }
    const elements = new Set(materials.map((material) => material.element).filter(Boolean));
    if (count === 2) {
        if (elements.has('fire') && elements.has('wood')) {
            return 'Ядро пепла';
        }
        if (elements.has('water') && elements.has('metal')) {
            return 'Ядро пара';
        }
        return 'Двойное ядро';
    }
    if (count === 5) {
        return 'Ядро пяти элементов';
    }
    const russianNumbers = { 3: 'трёх', 4: 'четырёх' };
    return `Ядро ${russianNumbers[count] || 'многих'} элементов`;
}

// Поиск выбранного материала в открытой модалке (по коду)
function findCraftMaterial(code) {
    if (!craftMaterialModal || !Array.isArray(craftMaterialModal.materials)) {
        return null;
    }
    return craftMaterialModal.materials.find((material) => material.code === code) || null;
}

// Суммарные бонусы: базовые статы предмета + статы ингредиентов +
// комбо крафта + комбо стихий (зеркало server get_craft_bonuses)
function computeCraftBonuses(recipe, ...materialArgs) {
    const stats = { ...(recipe.result_stats || {}) };
    const addStats = (material) => {
        if (!material) {
            return;
        }
        Object.entries(material.stats || {}).forEach(([key, value]) => {
            stats[key] = (stats[key] || 0) + value;
        });
    };
    materialArgs.forEach(addStats);

    let element = recipe.result_element || 'none';
    materialArgs.forEach((material) => {
        if (material && material.element && material.element !== 'none') {
            element = material.element;
        }
    });

    // Комбо крафта: бонусные статы, стихия и название поверх материалов
    let combo = findCraftCombo(recipe, materialArgs[0], materialArgs[1]);
    if (combo) {
        Object.entries(combo.stats || {}).forEach(([key, value]) => {
            stats[key] = (stats[key] || 0) + value;
        });
        if (combo.element) {
            element = combo.element;
        }
    }

    // Комбо стихий по материалам всех слотов (мутирует stats)
    const materials = materialArgs.filter(Boolean);
    const elementCombo = getCraftElementCombo(materials, stats, element);
    if (elementCombo) {
        if (elementCombo.element) {
            element = elementCombo.element;
        }
        if (!combo) {
            combo = elementCombo;
        }
    }
    return { stats, element, combo };
}

// Комбо стихий по материалам слотов (зеркало game_logic.get_craft_element_combo):
// огонь+дерево=Пепел, вода+металл=Пар, земля+камень=Каменная кожа,
// дерево+трава=Регенерация, 5 стихий=Пять элементов (+50% ко всем статам)
function getCraftElementCombo(materials, stats, resultElement) {
    const elements = new Set();
    const codes = new Set();
    materials.forEach((material) => {
        if (material.element && material.element !== 'none') {
            elements.add(material.element);
        }
        if (material.code) {
            codes.add(material.code);
        }
    });

    let combo = null;
    let bonusStats = {};
    let bonusElement = '';
    // «Пять элементов» проверяется первым (как на сервере): при всех 5 стихиях
    // парные комбо уже включены, поэтому приоритет у капстонного.
    if (elements.size >= 5) {
        combo = ['Пять элементов', 'Все пять стихий слиты в гармонии — сила безгранична.'];
        // +50% ко всем ненулевым статам (зеркало серверной формулы)
        Object.entries(stats).forEach(([key, value]) => {
            if (value > 0) {
                bonusStats[key] = Math.max(1, Math.round(value * 0.5));
            }
        });
        bonusElement = '';
    } else if (elements.has('fire') && elements.has('wood')) {
        combo = ['Пепел', 'Огонь и дерево сплетаются — пепел усиливает пламя.'];
        bonusStats = { damage: Math.max(1, Math.round((stats.damage || 0) * 0.30)) };
        bonusElement = 'fire';
    } else if (elements.has('water') && elements.has('metal')) {
        combo = ['Пар', 'Вода и металл рождают пар — удар становится смертоносным.'];
        bonusStats = { luck: 2 };
        bonusElement = 'water';
    } else if (elements.has('earth') && (codes.has('stone') || codes.has('earth_core'))) {
        combo = ['Каменная кожа', 'Земля и камень даруют несокрушимую защиту.'];
        bonusStats = { armor: 5 };
        bonusElement = 'earth';
    } else if (elements.has('wood') && codes.has('herb_qi')) {
        combo = ['Регенерация', 'Дерево и травы возвращают жизненную силу.'];
        bonusStats = { hp: 4 };
        bonusElement = 'wood';
    }

    if (combo === null) {
        return null;
    }
    Object.entries(bonusStats).forEach(([key, value]) => {
        stats[key] = (stats[key] || 0) + value;
    });
    return {
        name: combo[0],
        description: combo[1],
        stats: bonusStats,
        element: bonusElement,
    };
}

// Проверка условия одного слота комбо (пустое значение = любой материал)
function craftComboMatchesSlot(slotValue, material) {
    return !slotValue || (material && material.code === slotValue);
}

// Поиск комбо из recipe.combinations по паре выбранных материалов.
// Приоритет у комбо с большим числом указанных кодов предметов (точность).
function findCraftCombo(recipe, sel1Info, sel2Info) {
    const combos = (recipe && recipe.combinations) || [];
    if (!sel1Info || !sel2Info) {
        return null;
    }
    let best = null;
    let bestSpecificity = -1;
    combos.forEach((combo) => {
        if (combo.category_1 && sel1Info.category !== combo.category_1) {
            return;
        }
        if (combo.category_2 && sel2Info.category !== combo.category_2) {
            return;
        }
        let specificity = 0;
        if (combo.item_code_1) {
            if (!craftComboMatchesSlot(combo.item_code_1, sel1Info)) {
                return;
            }
            specificity += 1;
        }
        if (combo.item_code_2) {
            if (!craftComboMatchesSlot(combo.item_code_2, sel2Info)) {
                return;
            }
            specificity += 1;
        }
        if (specificity > bestSpecificity) {
            bestSpecificity = specificity;
            best = combo;
        }
    });
    return best;
}

// Открыть рецепт (загружает детали справа)
async function openCraft(code) {
    activeCraftCode = code;
    craftSelections = {};
    craftSelectedMats = {};
    craftDetail = null;
    renderCrafts();
    renderCraftDetail();
    await loadCraftDetail(code);
}

async function loadCraftDetail(code) {
    try {
        const data = await apiFetch(`/crafts/${code}`);
        craftDetail = data;
        renderCraftDetail();
    } catch (error) {
        showToast('Не удалось загрузить рецепт');
    }
}

// Открыть модалку выбора материала для слота
async function openCraftMaterialModal(slot, categories) {
    renderCrafts();
    try {
        const query = encodeURIComponent((categories || []).join(','));
        const data = await apiFetch(`/player/${userId}/craft_materials?categories=${query}`);
        // Выделяем материал, который уже выбран для слота (если есть)
        craftMaterialPending = craftSelections[slot] || null;
        craftMaterialModal = {
            slot,
            categories,
            materials: data.materials || [],
        };
        renderCraftMaterialModal();
    } catch (error) {
        showToast('Не удалось загрузить материалы');
    }
}

function renderCraftMaterialModal() {
    const modal = document.getElementById('craftMaterialModal');
    const bonus = document.getElementById('craftMaterialBonus');
    const list = document.getElementById('craftMaterialList');
    const chooseBtn = document.getElementById('btnCraftMaterialChoose');
    const slot = craftMaterialModal.slot;
    // Уже применённый выбор и текущее выделение (pending)
    const applied = craftSelections[slot] || null;
    const pending = craftMaterialPending;
    // Для «Ядра стихий»: скрываем само ядро (нельзя вложить ядро в ядро)
    // и ядра, уже занятые в других слотах (все ядра должны быть разными)
    const isElementCore = activeCraftCode === 'element_core';
    const usedCodes = new Set(
        Object.entries(craftSelections)
            .filter(([key]) => key !== slot && craftSelections[key])
            .map(([, code]) => code)
    );
    const visibleMaterials = craftMaterialModal.materials.filter((material) => {
        if (isElementCore && material.code === 'element_core') {
            return false;
        }
        if (isElementCore && usedCodes.has(material.code)) {
            return false;
        }
        return true;
    });

    list.innerHTML = visibleMaterials.length
        ? visibleMaterials.map((material) => {
            // Пометка: ✓ применённый материал, золотая рамка — выделенный
            const appliedClass = material.code === applied ? ' craft-applied' : '';
            const pendingClass = material.code === pending ? ' craft-pending' : '';
            // Бейдж ⚠️ у материала с невыполненными требованиями (мягкий штраф)
            const badge = (material.requirements_met === false)
                ? '<span class="tinkers-req-badge tinkers-req-badge-warn" title="Требования не выполнены — будет штраф">⚠️</span>'
                : '';
            return `
            <button class="craft-material${appliedClass}${pendingClass}"
                    type="button" data-code="${esc(material.code)}">
                <span class="craft-material-icon">${material.icon || '📦'}</span>
                <span class="craft-material-name">${esc(material.name)}${badge}</span>
                <span class="craft-material-stats">${craftMaterialBonusText(material)}</span>
                <span class="craft-material-count">×${esc(material.count)}</span>
            </button>`;
        }).join('')
        : '<div class="craft-empty-inline">Подходящих материалов нет</div>';

    list.querySelectorAll('.craft-material').forEach((button) => {
        button.addEventListener('click', () => {
            const code = button.dataset.code;
            selectCraftMaterial(code);
        });
    });

    // Бонус за слот выделенного материала (статы + стихия)
    const pendingMaterial = findCraftMaterial(craftMaterialPending);
    bonus.textContent = pendingMaterial
        ? `Бонус за слот: ${craftMaterialStatsText(pendingMaterial)}`
        : 'Бонус за слот: —';

    // «Выбрать» активна, только когда material выделен
    chooseBtn.disabled = !craftMaterialPending;

    modal.classList.remove('hidden');
}

// Выделение материала в модалке (без закрытия и применения)
function selectCraftMaterial(code) {
    if (!craftMaterialModal) {
        return;
    }
    craftMaterialPending = code;
    renderCraftMaterialModal();
}

// «Выбрать»: применяет выделенный материал и закрывает модалку
function confirmCraftMaterial() {
    if (!craftMaterialModal || !craftMaterialPending) {
        return;
    }
    const slot = craftMaterialModal.slot;
    const chosen = findCraftMaterial(craftMaterialPending);
    craftSelections[slot] = craftMaterialPending;
    craftSelectedMats[slot] = chosen || null;
    closeCraftMaterialModal();
    renderCraftDetail();
}

// «Отмена»: закрывает модалку без применения выделения
function cancelCraftMaterial() {
    craftMaterialPending = null;
    closeCraftMaterialModal();
}

// Текстовое описание бонуса материала: статы и стихия (для карточки)
function craftMaterialBonusText(material) {
    if (!material) {
        return '';
    }
    const statsText = craftMaterialStatsText(material);
    const element = material.element && material.element !== 'none'
        ? `стихия ${CRAFT_ELEMENT_LABELS[material.element] || material.element}`
        : '';
    const parts = [statsText, element].filter(Boolean);
    return parts.join(', ');
}

// Статы материала одной строкой («+5 выносливости», «+2 брони, +3 HP»)
function craftMaterialStatsText(material) {
    const stats = Object.entries(material.stats || {})
        .map(([key, value]) => `${CRAFT_STAT_LABELS[key] || key} +${value}`)
        .join(', ');
    return stats || 'без бонусов';
}

function closeCraftMaterialModal() {
    document.getElementById('craftMaterialModal').classList.add('hidden');
    craftMaterialModal = null;
    craftMaterialPending = null;
}

// Выполнение крафта (POST /api/player/<id>/craft)
async function doCraft2() {
    try {
        const data = await apiFetch(`/player/${userId}/craft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipe_code: activeCraftCode,
                slot_1_code: craftSelections['slot_1'] || '',
                slot_2_code: craftSelections['slot_2'] || '',
                slot_3_code: craftSelections['slot_3'] || '',
                slot_4_code: craftSelections['slot_4'] || '',
                slot_5_code: craftSelections['slot_5'] || '',
            }),
        });

        // Обновляем инвентарь из ответа сервера
        if (data.inventory) {
            inventoryData = data.inventory;
            renderInventoryPanel();
        }

        const statsText = Object.entries(data.stats || {})
            .map(([key, value]) => `${CRAFT_STAT_LABELS[key] || key} +${value}`)
            .join(', ');
        const penalties = (data.penalties || []).length
            ? ' ⚠️ есть штрафы требований' : '';
        showToast(`🔨 Создано: ${data.item.name}${statsText ? ' (' + statsText + ')' : ''}${penalties}`);

        craftSelections = {};
        craftSelectedMats = {};
        await loadCraftDetail(activeCraftCode);
    } catch (error) {
        showToast(error.code || 'Не удалось создать предмет');
    }
}

// ---------- Загрузка данных ----------
async function loadAll(showLoadingIndicator = true) {
    if (showLoadingIndicator) {
        showLoading();
    }

    try {
        const id = await ensureUserId();
        const [player, inventory, techniques, equipment] = await Promise.all([
            apiFetch(`/player/${id}`),
            apiFetch(`/player/${id}/inventory`),
            apiFetch(`/player/${id}/techniques`),
            apiFetch(`/player/${id}/equipment`),
        ]);

        playerData = player;
        inventoryData = inventory;
        techniquesData = techniques;
        equipmentData = equipment;

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

            // Свежий список рецептов при открытии вкладки «Крафт»
            if (button.dataset.screen === 'screen-craft') {
                loadCrafts();
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
    document.getElementById('modalUse').addEventListener('click', onModalUse);
    document.getElementById('modalDisassemble').addEventListener('click', disassembleItemAction);
    document.getElementById('modalDelete').addEventListener('click', deleteItemAction);

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

    // Модалка выбора материала для крафта
    document.getElementById('btnCraftMaterialClose').addEventListener('click', cancelCraftMaterial);
    document.getElementById('btnCraftMaterialChoose').addEventListener('click', confirmCraftMaterial);
    document.getElementById('btnCraftMaterialCancel').addEventListener('click', cancelCraftMaterial);
    document.getElementById('craftMaterialModal').addEventListener('click', (event) => {
        if (event.target === document.getElementById('craftMaterialModal')) {
            cancelCraftMaterial();
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