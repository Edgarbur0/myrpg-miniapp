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
    scroll: 'Свиток техники',
    equipment: 'Экипировка',
    material: 'Материал',
    part: 'Деталь',
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
let activeTechniqueCode = null;    // техника в модалке (для Надеть/Снять)
let activeScrollCode = null;       // свиток в модалке (для Изучить)
let breakthroughForecast = null;     // прогноз прорыва (GET /breakthrough/forecast)
// Подготовка к прорыву: списки и выбранные значения (переживают перерисовку)
let prepCores = [];
let prepSelectedCore = '';
let prepFormOpen = false;            // открыта ли форма подготовки
let craftRecipes = [];              // рецепты крафта (GET /api/crafts)
let craftLoading = false;           // идёт загрузка списка рецептов (для loading-state)
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
        // Широкий фрейм на десктопе (раунд 74) — после Init, параллельно
        expandDesktopWindow();
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

// Широкий фрейм на десктопе (раунд 74): VK показывает мини-аппы в узкой
// колонке ~600px; VKWebAppResizeWindow просит у клиента окно пошире.
// Десктоп only (на мобильных событие игнорируется, но лишний вызов
// не нужен — отсекаем по vk_platform). Высота — не меньше текущей,
// чтобы не обрезать контент; итоговые значения всё равно клампит VK.
// Всё в try/catch: моста может не быть (отладка вне VK), запрос могут
// отклонить — игра обязана работать и в узком фрейме (резина р.73).
function expandDesktopWindow() {
    if (!window.vkBridge) {
        return;
    }
    try {
        const params = new URLSearchParams(window.location.search || '');
        const platform = params.get('vk_platform') || '';
        if (platform && platform.indexOf('desktop') !== 0) {
            return;
        }
        const height = Math.max(window.innerHeight || 0, 900);
        vkBridge.send('VKWebAppResizeWindow', { width: 1000, height })
            .catch((error) => console.warn('VKWebAppResizeWindow:', error));
    } catch (error) {
        console.warn('VKWebAppResizeWindow:', error);
    }
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

// ================= ФОНЫ (раунд 48) =================
// Фон приложения приходит из GET /api/settings (ключ background_url),
// фон локации — из locations.image_url внутри ответа игрока. Оба адреса
// хранятся в БД и заливаются через админку, поэтому клиент не должен
// падать, если фон пустой или не загрузился: во всех случаях есть
// градиентный запасной вариант.

// Градиенты по биому локации — рисуются, когда своей картинки нет.
const LOCATION_BIOME_GRADIENTS = {
    forest: 'linear-gradient(165deg, #10281f 0%, #0d1a1c 60%, #0a1012 100%)',
    cave: 'linear-gradient(170deg, #1b1726 0%, #120f18 60%, #0a0810 100%)',
    mountains: 'linear-gradient(170deg, #16233c 0%, #101726 55%, #0a0d16 100%)',
    river: 'linear-gradient(170deg, #122a3a 0%, #0e1d29 55%, #0a1017 100%)',
    volcano: 'linear-gradient(170deg, #2c1210 0%, #1c0d0e 55%, #0c0709 100%)',
    settlement: 'linear-gradient(170deg, #2a2416 0%, #1c1810 55%, #100e0a 100%)',
    wilderness: 'linear-gradient(170deg, #1a1c2c 0%, #12131f 55%, #0b0c13 100%)',
    dungeon: 'linear-gradient(170deg, #211726 0%, #16101b 55%, #0c0910 100%)',
};

const DEFAULT_LOCATION_GRADIENT =
    'linear-gradient(170deg, #1c1a2c 0%, #141323 55%, #0b0a12 100%)';

// Готовит адрес для CSS url(). Кавычки и обратный слэш убираем всегда,
// закрывающую скобку — тоже: иначе значение вырвется из url() и сломает
// весь фон. Адрес и так приходит нормализованным с сервера, но клиент
// не должен зависеть от этого.
function cssUrl(value) {
    const clean = String(value || '').replace(/["\\]/g, '');
    return clean.split(')').join('');
}

// Ставит --app-bg на <body>. Фон-картинка кладётся первым слоем, под ним
// остаётся фирменный градиент — так текст остаётся читаемым на светлой
// картинке, а пустое место не выглядит дырой.
function applyAppBackground(url) {
    const body = document.body;
    if (!body) {
        return;
    }
    const clean = cssUrl(url).trim();
    if (!clean) {
        body.style.removeProperty('--app-bg');
        return;
    }
    const fallback = getComputedStyle(document.documentElement)
        .getPropertyValue('--app-bg');
    body.style.setProperty(
        '--app-bg',
        `url("${clean}"), ${fallback || DEFAULT_LOCATION_GRADIENT}`
    );
}

// Ставит фон карточки локации: картинка из БД либо градиент по биому.
function applyLocationBackground(box, location) {
    if (!box) {
        return;
    }
    const biome = String((location && location.biome) || '').toLowerCase();
    const type = String((location && location.location_type) || '').toLowerCase();
    const gradient = LOCATION_BIOME_GRADIENTS[biome]
        || LOCATION_BIOME_GRADIENTS[type]
        || DEFAULT_LOCATION_GRADIENT;
    box.style.setProperty('--loc-bg', gradient);
    box.classList.remove('has-image');
    const url = (location && location.image_url) || '';
    if (!url) {
        return;
    }
    // Пробуем грузить картинку: если файла нет (404) — остаётся градиент,
    // а не пустая карточка.
    const src = cssUrl(url);
    const probe = new Image();
    probe.onload = function () {
        if (box.isConnected) {
            box.style.setProperty('--loc-bg', `url("${src}")`);
            box.classList.add('has-image');
        }
    };
    probe.src = src;
}

// Один раз при старте: общий фон приложения (GET /api/settings).
async function loadAppBackground() {
    try {
        const data = await apiFetch('/settings');
        applyAppBackground(data && data.background_url);
    } catch (e) {
        // Фон — украшение, а не данные: молча оставляем градиент из CSS
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
    applyLocationBackground(box, location);

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

// Иконка предмета: картинка из БД (items.image) → пустышка → эмодзи.
// Пустое поле бывает у новых предметов, которым ещё не залили иконку:
// вместо разнородных эмодзи показываем placeholder.png, чтобы все карточки
// выглядели одинаково. Если файл не загрузился (404/битый) — эмодзи,
// чтобы карточка не осталась пустой (раунд 47, дополнено в 48).
const ITEM_IMAGE_PLACEHOLDER = '/static/images/items/placeholder.png';

function itemVisual(item, imgClass) {
    // Эмодзи-фолбэк подставляется в inline-обработчик onerror, поэтому
    // кавычки и обратный слэш из значения убираем — иначе строка развалится.
    const rawEmoji = (item && item.icon) || '📦';
    const emoji = esc(String(rawEmoji).replace(/['"\\<>&]/g, '') || '📦');
    if (!item) {
        return emoji;
    }
    const src = esc(item.image || ITEM_IMAGE_PLACEHOLDER);
    return `<img class="${imgClass}" src="${src}" alt="" loading="lazy"`
        + ` onerror="this.outerHTML='${emoji}'">`;
}

// Иконка валюты (раунд 71): картинка каталожной строки 'gold' → 💰.
// Пустышки нет — золото одно, иконка залита (gold.png).
function goldVisual(info, imgClass) {
    if (!info || !info.image) {
        return '💰';
    }
    const src = esc(info.image);
    return `<img class="${imgClass}" src="${src}" alt="" loading="lazy"`
        + ` onerror="this.outerHTML='💰'">`;
}

// Карточка валюты (раунд 71): золото — счёт state.gold, а не предмет.
// Read-only: описания и количества достаточно, кнопок действий нет
// (валюту нельзя использовать/надеть/разобрать/удалить).
function openGoldModal() {
    const info = (inventoryData && inventoryData.gold_info) || {};
    activeItemCode = null;
    activeInstanceId = null;
    activeScrollCode = null;
    document.getElementById('modalTitle').textContent = info.name || 'Золото';
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${goldVisual(info, 'modal-icon-img')}</div>
        <div class="modal-title">${esc(info.name || 'Золото')}</div>
        <div class="modal-desc">
            <div><span class="muted">Тип</span><span>Валюта</span></div>
            <div><span class="muted">Количество</span><span>${esc(playerData ? playerData.gold : 0)}</span></div>
        </div>
        ${info.description ? `<div class="modal-note">${esc(info.description)}</div>` : ''}
    `;
    document.getElementById('modalUse').classList.add('hidden');
    document.getElementById('modalDisassemble').classList.add('hidden');
    document.getElementById('modalDelete').classList.add('hidden');
    document.getElementById('modalActions').classList.add('hidden');
    openModal();
}

// Картинка техники-книги: иконка из справочника (techniques.image) →
// эмодзи стихии → 📖. Пустышки-подстановки нет: техник мало и у каждой
// должна быть своя иконка из админки (раунд 57). Пустое поле — это
// штатно, а не «сломанная картинка», поэтому <img> рисуем только когда
// адрес есть.
function techVisual(technique, imgClass) {
    const fallback = ELEMENT_ICONS[(technique && technique.element) || 'none'] || '📖';
    const rawEmoji = (technique && technique.icon) || fallback;
    const emoji = esc(String(rawEmoji).replace(/['"\\<>&]/g, '') || '📖');
    if (!technique || !technique.image) {
        return emoji;
    }
    const src = esc(technique.image);
    return `<img class="${imgClass}" src="${src}" alt="" loading="lazy"`
        + ` onerror="this.outerHTML='${emoji}'">`;
}

function renderInventoryPanel() {
    const data = inventoryData;
    const inventory = (data && data.inventory) || {};
    // Порядок — из API (inventory_order, раунд 71): Flask сортирует ключи
    // JSON по алфавиту, поэтому порядок словаря до клиента не доезжает.
    // Фолбэк — ключи как есть (старый API без порядка).
    const apiOrder = (data && data.inventory_order) || [];
    const codes = apiOrder.filter((code) => inventory[code]);
    Object.keys(inventory).forEach((code) => {
        if (codes.indexOf(code) === -1) {
            codes.push(code);
        }
    });

    document.getElementById('invEmpty').classList.toggle(
        'hidden',
        codes.length > 0
        || (techniquesData && (techniquesData.techniques || [])
            .some((technique) => !technique.is_equipped)),
    );

    // Первый элемент — всегда золото (валюта state.gold, не стак).
    // Раунд 65: тултип на иконке, а не на плитке — hover по пустой области
    // тултип не показывает. Раунд 71: плитка — кнопка с картинкой из каталога
    // (gold_info) и read-only карточкой; мусорного стака 'gold' больше нет
    // (API его фильтрует, миграция вычистила из инвентарей и дропов).
    const goldInfo = (data && data.gold_info) || { name: 'Золото' };
    const tiles = [
        `<button class="item tile-gold" data-gold="1" type="button">
            <span class="item-icon" data-tooltip="${esc(goldInfo.name || 'Золото')}">${goldVisual(goldInfo, 'item-img')}</span>
            <span class="item-count">${esc(playerData ? playerData.gold : 0)}</span>
        </button>`,
    ];

    codes.forEach((code) => {
        const item = inventory[code];

        // Экипировка с экземплярами (player_items) — карточка на каждый экземпляр.
        // Надетые экземпляры скрыты (раунд 54): экипированное видно только
        // в Экипировке. Сервер их уже не присылает, фильтр ниже — страховка
        // от старого API.
        if (item.instances && item.instances.length) {
            item.instances.filter((inst) => !inst.equipped).forEach((inst) => {
                // Раунд 95: у экземпляра своя картинка по комбо стихий
                // (Каменная кожа, Регенерация...) и своё имя (display_name) —
                // иначе все нагрудники выглядят одинаково (каталожная иконка).
                const instView = Object.assign({}, item, {
                    name: inst.display_name || item.name,
                    image: ((inst.combo || {}).image) || item.image,
                });
                const instTip = inst.display_name || item.name;
                tiles.push(`
                    <button class="item item-equip"
                            data-code="${esc(code)}" data-instance-id="${inst.id}"
                            type="button">
                        <span class="item-icon" data-tooltip="${esc(instTip)}">${itemVisual(instView, 'item-img')}</span>
                    </button>`);
            });
            return;
        }

        // Стекируемый предмет (материалы, расходники) — одна карточка
        const usable = item.type === 'consumable';
        tiles.push(`
            <button class="item ${usable ? 'usable' : ''}" data-code="${esc(code)}" type="button">
                <span class="item-icon" data-tooltip="${esc(item.name)}">${itemVisual(item, 'item-img')}</span>
                <span class="item-count">×${esc(item.count)}</span>
            </button>`);
    });

    // Техники-книги (раунд 54): изученные техники живут в инвентаре как 📖.
    // Экипированные скрыты — они видны в Экипировке. Клик открывает справочную
    // карточку техники (openTechniqueModal) с кнопкой «Надеть»/«Снять».
    const learnedBooks = (techniquesData && techniquesData.techniques || [])
        .filter((technique) => technique.is_learned !== false && !technique.is_equipped);
    learnedBooks.forEach((technique) => {
        tiles.push(`
            <button class="item item-techbook" data-tech-code="${esc(technique.code)}"
                    type="button">
                <span class="item-icon" data-tooltip="${esc(technique.name)} (Ур. ${esc(technique.level)})">${techVisual(technique, 'item-img')}</span>
            </button>`);
    });

    const grid = document.getElementById('inventoryGrid');
    grid.innerHTML = tiles.join('');

    // Клик по валюте — read-only карточка золота (раунд 71)
    grid.querySelectorAll('.item[data-gold]').forEach((cell) => {
        cell.addEventListener('click', () => {
            try {
                openGoldModal();
            } catch (error) {
                console.error('openGoldModal', error);
                showToast('Не удалось открыть карточку золота');
            }
        });
    });

    // Клик по книге техники — справочная модалка техники
    grid.querySelectorAll('.item[data-tech-code]').forEach((cell) => {
        cell.addEventListener('click', () => {
            try {
                const books = (techniquesData && techniquesData.techniques || [])
                    .concat((techniquesData && techniquesData.catalog || []));
                openTechniqueModal(books, cell.dataset.techCode);
            } catch (error) {
                console.error('openTechniqueModal', error);
                showToast('Не удалось открыть карточку техники');
            }
        });
    });

    // Клик по предмету — модальное окно с действием.
    // Ошибку показываем тостом: раньше исключение внутри openItemModal
    // гасилось браузером, и карточка выглядела «мёртвой» (раунд 47).
    grid.querySelectorAll('.item[data-code]').forEach((cell) => {
        cell.addEventListener('click', () => {
            try {
                openItemModal(inventory, cell.dataset.code, cell.dataset.instanceId);
            } catch (error) {
                console.error('openItemModal', error);
                showToast('Не удалось открыть карточку предмета');
            }
        });
    });
}

function openItemModal(inventory, code, instanceId) {
    const item = inventory[code];
    if (!item) {
        return;
    }

    // Свиток техники — отдельное действие (изучить), зелье — лечение
    const isScroll = !!(item.technique_code || item.type === 'scroll');
    const scrollTechnique = scrollTechniqueCode(item, code);
    const learnable = isScroll && !!scrollTechnique;
    const usable = !isScroll && item.type === 'consumable';
    const equipable = item.type === 'equipment';

    // Активный предмет фиксируем только после всех вычислений: раньше
    // исключение до openModal() оставлял в памяти код ненужного предмета
    activeItemCode = code;
    activeInstanceId = instanceId ? Number(instanceId) : null;

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

    // Комбо экземпляра: название, описание и боевые эффекты (раунд 41)
    const instCombo = (activeInst && activeInst.combo) || item.combo || null;
    const comboRow = instCombo ? `
        <div class="item-combo">
            <div class="item-combo-title">✨ Комбо: ${esc(instCombo.name || '')}</div>
            ${instCombo.description ? `<div class="item-combo-desc">${esc(instCombo.description)}</div>` : ''}
            ${(instCombo.effects && instCombo.effects.length || instCombo.element) ? `
                <div class="item-combo-chips">
                    ${(instCombo.effects || []).map((effect) => `<span class="item-combo-chip">${esc(itemComboEffectLabel(effect))}</span>`).join('')}
                    ${instCombo.element ? `<span class="item-combo-chip item-combo-element">${CRAFT_ELEMENT_LABELS[instCombo.element] || instCombo.element}</span>` : ''}
                </div>` : ''}
        </div>` : '';

    // Свиток: какую технику он даёт и изучена ли она уже
    const learnedTech = (techniquesData && techniquesData.techniques || [])
        .find((technique) => technique.code === scrollTechnique);
    const scrollRow = isScroll
        ? `<div><span class="muted">Техника</span><span>${
            scrollTechnique
                ? `${esc(scrollTechnique)}${learnedTech ? ' ✅ уже изучена' : ''}`
                : 'неизвестна'
        }</span></div>`
        : '';

    document.getElementById('modalTitle').textContent =
        (activeInst && activeInst.display_name) || item.name;
    // Раунд 95: модалка экземпляра — его картинка по комбо и его имя,
    // иначе все нагрудники выглядят одинаково (каталожная иконка).
    const modalView = activeInst
        ? Object.assign({}, item, {
            name: activeInst.display_name || item.name,
            image: ((activeInst.combo || {}).image) || item.image,
        })
        : item;
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${itemVisual(modalView, 'modal-icon-img')}</div>
        <div class="modal-title">${esc(modalView.name)}</div>
        <div class="modal-desc">
            <div><span class="muted">Тип</span><span>${esc(ITEM_TYPE_LABELS[item.type] || 'Предмет')}</span></div>
            ${countLine}
            ${equippedText}
            ${scrollRow}
            ${disassembleRow}
            ${comboRow}
            ${bonusRow}
        </div>
        ${item.description ? `<div class="modal-note">${esc(item.description)}</div>` : ''}
    `;

    if (learnable) {
        activeScrollCode = code;
        document.getElementById('modalUse').textContent = learnedTech ? 'Изучена' : 'Изучить';
        document.getElementById('modalUse').classList.remove('hidden');
        document.getElementById('modalUse').classList.toggle('disabled', !!learnedTech);
    } else {
        activeScrollCode = null;
        document.getElementById('modalUse').textContent = equipable ? 'Надеть' : 'Использовать';
        document.getElementById('modalUse').classList.toggle('hidden', !(usable || equipable));
        document.getElementById('modalUse').classList.remove('disabled');
    }

    // Действия с предметом: разобрать (крафченый) и удалить (не надетый)
    document.getElementById('modalDisassemble').classList.toggle('hidden', !disassemblable);
    document.getElementById('modalDelete').classList.toggle('hidden', isEquipped);
    document.getElementById('modalActions').classList.toggle(
        'hidden', !disassemblable && isEquipped
    );
    openModal();
}

// Подпись боевого эффекта комбо в карточке предмета
function itemComboEffectLabel(effect) {
    const value = effect.value;
    if (effect.type === 'hp_regen') return `💚 HP +${value}/ход`;
    if (effect.type === 'fire_damage_bonus') return `🔥 Урон огнём +${Math.round(value * 100)}%`;
    if (effect.type === 'stat_bonus') return `${CRAFT_STAT_LABELS[effect.stat] || effect.stat} +${value}`;
    if (effect.type === 'all_stats_bonus') return `✨ Все статы +${Math.round(value * 100)}%`;
    return `✨ ${effect.type} +${value}`;
}

// Подписи боевых эффектов техники (раунд 44: полный набор из game_logic)
function techniqueEffectLabel(effect) {
    const value = effect.value;
    const dur = effect.duration ? `, ${effect.duration} ход.` : '';
    const chance = effect.chance ? ` (${effect.chance}%)` : '';
    if (effect.type === 'damage') return `⚔️ Урон ${effect.min ?? value}–${effect.max ?? value}`;
    if (effect.type === 'aoe') return '🌐 По всем врагам';
    if (effect.type === 'heal') return `💚 Лечение ${value}`;
    if (effect.type === 'burn') return `🔥 Ожог ${effect.power} HP/ход${dur}`;
    if (effect.type === 'poison') return `☠️ Яд ${effect.power} HP/ход${dur}`;
    if (effect.type === 'bleed') return `🩸 Кровотечение ${effect.power} HP/ход${dur}`;
    if (effect.type === 'stun') return `💫 Оглушение${chance}${dur}`;
    if (effect.type === 'freeze') return `🧊 Заморозка${chance}${dur}`;
    if (effect.type === 'slow') return `🐌 Замедление −${Math.round(value * 100)}% урона${dur}`;
    if (effect.type === 'armor') return `🛡️ Броня +${value}${dur}`;
    if (effect.type === 'damage_reduction') return `🛡️ Поглощает ${value} урона${dur}`;
    if (effect.type === 'buff_attack') return `⚔️ Атака +${Math.round(value * 100)}%${dur}`;
    if (effect.type === 'regen') return `💚 Регенерация ${value} HP/ход${dur}`;
    if (effect.type === 'immunity') {
        const blocks = effect.blocks || [];
        const names = blocks.map((code) => AFFINITY_EFFECT_LABELS[code] || code).join(', ');
        return `✨ Иммунитет: ${names || '—'}${dur}`;
    }
    if (effect.type === 'extra_attack') return `⚔️ Доп. атака ×${effect.count || value || 1}`;
    if (effect.type === 'dispel') return '💨 Снятие эффектов';
    return `✨ ${effect.type} ${value ?? ''}`.trim();
}

// Подписи защитных эффектов для «Железной воли»
const AFFINITY_EFFECT_LABELS = {
    poison: 'яду',
    bleed: 'кровотечения',
    stun: 'оглушения',
    freeze: 'заморозки',
    slow: 'замедления',
    burn: 'ожога',
};

// Какая техника зашита в свиток: из предмета, из каталога или по коду scroll_<техника>.
// Код передаётся отдельно и обязательно проверяется на строку: раньше здесь
// читался item.code, которого нет в ответе /inventory, и функция падала с
// TypeError на КАЖДОМ не-свитке — карточка не открывала модалку (раунд 47).
function scrollTechniqueCode(item, code) {
    if (!item) {
        return '';
    }
    if (item.technique_code) {
        return item.technique_code;
    }
    const itemCode = typeof code === 'string' && code ? code : (item.code || '');
    if (!itemCode) {
        return '';
    }
    const catalog = (techniquesData && techniquesData.catalog) || [];
    const match = catalog.find((technique) => itemCode === `scroll_${technique.code}`);
    if (match) {
        return match.code;
    }
    return itemCode.indexOf('scroll_') === 0 ? itemCode.slice(7) : '';
}

// Свиток-источник техники по её коду (раунд 56, только для подписи
// «📜 Источник» в модалке книги-навыка). Ищем в инвентаре запись
// с technique_code, иначе — по соглашению scroll_<код техники>.
function findScrollForTechnique(techniqueCode) {
    if (!techniqueCode) {
        return '';
    }
    try {
        const inventory = (inventoryData && inventoryData.inventory) || {};
        const codes = Object.keys(inventory);
        for (const code of codes) {
            const item = inventory[code];
            if (item && item.technique_code === techniqueCode) {
                return item.name || code;
            }
        }
        const fallback = `scroll_${techniqueCode}`;
        if (inventory[fallback] && inventory[fallback].name) {
            return inventory[fallback].name;
        }
    } catch (error) {
        return '';
    }
    return '';
}

// Чипы требований техники (✅ выполнено / ⚠️ не хватает)
function techniqueRequirementsChips(technique) {
    const requirements = technique.requirements || [];
    if (!requirements.length) {
        return '';
    }
    return `<div class="item-combo-chips">
        ${requirements.map((req) => {
            const ok = req.met;
            return `<span class="item-combo-chip ${ok ? 'req-ok' : 'req-warn'}">
                ${ok ? '✅' : '⚠️'} ${esc(req.label)} ${esc(req.value)}/${esc(req.required)}
            </span>`;
        }).join('')}
    </div>`;
}

// ---------- Экипировка ----------
// Фолбэк 8 слотов (хотфикс раунда 54, расширен в раунде 64): сетка
// снаряжения рисуется всегда, даже если API прислал ответ без slots.
// Порядок и ключи — как серверный EQUIPMENT_SLOTS из game_logic.py.
const EQUIPMENT_SLOT_FALLBACK = [
    { key: 'weapon_main', name: 'Правая рука', icon: '⚔️' },
    { key: 'weapon_off', name: 'Левая рука', icon: '🗡️' },
    { key: 'armor', name: 'Броня', icon: '🛡️' },
    { key: 'head', name: 'Шлем', icon: '🪖' },
    { key: 'gloves', name: 'Перчатки', icon: '🧤' },
    { key: 'pants', name: 'Штаны', icon: '👖' },
    { key: 'boots', name: 'Обувь', icon: '🥾' },
    { key: 'accessory', name: 'Аксессуар', icon: '💍' },
];

function renderEquipment() {
    const data = equipmentData;
    if (!data) {
        return;
    }

    const slots = (data.slots && data.slots.length)
        ? data.slots
        : EQUIPMENT_SLOT_FALLBACK;
    const worn = data.equipment || {};
    const box = document.getElementById('equipmentSlots');

    // Единая сетка экипировки (раунд 83): сначала 8 слотов (надетое или
    // картинка пустого слота из админки / эмодзи-фолбэк), затем книги техник
    // в бою — теми же плитками .item, что в инвентаре. Отдельного блока книг
    // (#equipmentTechSlots) больше нет: innerHTML-замена — без дублей.
    const tiles = slots.map((slot) => {
        const equipped = worn[slot.key];
        if (equipped) {
            // Клик по плитке открывает модалку со «Снять», как раньше
            return `
            <button class="item item-equip" data-slot="${esc(slot.key)}" type="button">
                <span class="item-icon" data-tooltip="${esc(equipped.name)}">${itemVisual(equipped, 'item-img')}</span>
            </button>`;
        }
        // Пустой слот: картинка из админки (equipment_slots.image) или эмодзи
        const emptyVisual = slot.image
            ? `<img class="item-img" src="${esc(slot.image)}" alt="" loading="lazy"`
                + ` onerror="this.outerHTML='${esc(String(slot.icon || '▫️').replace(/['"\\<>&]/g, ''))}'">`
            : esc(slot.icon || '▫️');
        return `<div class="item tile-empty equip-empty" data-tooltip="${esc(slot.name)}">`
            + `<span class="item-icon">${emptyVisual}</span></div>`;
    });

    // Экипированные техники-книги — в ту же сетку, после слотов.
    // Источник — equipmentData.equipped_techniques (API), фолбэк — techniquesData.
    const equippedBooks = (data.equipped_techniques
        || (techniquesData && techniquesData.techniques || [])
            .filter((t) => t.is_equipped)
            .map((t) => ({ code: t.code, name: t.name, level: t.level, icon: '📖', image: t.image || '' }))
        || []);
    equippedBooks.forEach((book) => {
        const bookTip = book.level
            ? `${book.name} (Ур. ${book.level})`
            : `${book.name} — в бою`;
        tiles.push(`
            <button class="item item-techbook" data-tech-code="${esc(book.code)}" type="button">
                <span class="item-icon" data-tooltip="${esc(bookTip)}">${techVisual(book, 'item-img')}</span>
            </button>`);
    });
    box.innerHTML = tiles.join('');

    // Клик по надетому слоту — модалка со «Снять»
    box.querySelectorAll('.item-equip').forEach((cell) => {
        cell.addEventListener('click', () => openEquippedModal(cell.dataset.slot));
    });

    // Клик по книге в экипировке — справочная модалка техники
    box.querySelectorAll('.item-techbook').forEach((cell) => {
        cell.addEventListener('click', () => {
            try {
                const books = (techniquesData && techniquesData.techniques || [])
                    .concat((techniquesData && techniquesData.catalog || []));
                openTechniqueModal(books, cell.dataset.techCode);
            } catch (error) {
                console.error('openTechniqueModal', error);
                showToast('Не удалось открыть карточку техники');
            }
        });
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
    const slotMeta = ((data.slots && data.slots.length)
        ? data.slots : EQUIPMENT_SLOT_FALLBACK).find((s) => s.key === slot);

    // Комбо надетого экземпляра (регенерация HP и т.п.)
    const combo = equipped.combo || null;
    const comboRow = combo ? `
        <div class="item-combo">
            <div class="item-combo-title">✨ Комбо: ${esc(combo.name || '')}</div>
            ${combo.description ? `<div class="item-combo-desc">${esc(combo.description)}</div>` : ''}
            ${(combo.effects && combo.effects.length || combo.element) ? `
                <div class="item-combo-chips">
                    ${(combo.effects || []).map((effect) => `<span class="item-combo-chip">${esc(itemComboEffectLabel(effect))}</span>`).join('')}
                    ${combo.element ? `<span class="item-combo-chip item-combo-element">${CRAFT_ELEMENT_LABELS[combo.element] || combo.element}</span>` : ''}
                </div>` : ''}
        </div>` : '';

    document.getElementById('modalTitle').textContent = equipped.name;
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${itemVisual(equipped, 'modal-icon-img')}</div>
        <div class="modal-title">${esc(equipped.name)}</div>
        <div class="modal-desc">
            <div><span class="muted">Слот</span><span>${esc(slotMeta ? slotMeta.name : slot)}</span></div>
            ${comboRow}
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
    // Свиток техники — изучить (POST /api/player/<id>/techniques/learn)
    if (activeScrollCode) {
        await learnTechniqueFromScroll(activeScrollCode);
        return;
    }
    // Сначала снятие — activeEquipSlot задействован только модалкой экипировки
    if (activeEquipSlot) {
        await unequipItem(activeEquipSlot);
        return;
    }
    if (activeTechniqueCode) {
        await toggleTechnique();
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

// Изучение техники из свитка (POST /api/player/<id>/techniques/learn)
async function learnTechniqueFromScroll(itemCode) {
    try {
        const data = await apiFetch(`/player/${userId}/techniques/learn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_code: itemCode }),
        });
        if (data.success) {
            if (data.inventory) {
                inventoryData = data.inventory;
            }
            if (data.techniques) {
                techniquesData = data.techniques;
            }
            renderInventoryPanel();
            renderTechniques();
        }
        closeModal();
        showToast(data.message || '📜 Техника изучена');
    } catch (error) {
        closeModal();
        renderTechniques();
        const messages = {
            already_learned: 'Эта техника уже изучена',
            not_a_scroll: 'Это не свиток с техникой',
            no_technique: 'В свитке не указана техника',
            no_scroll: 'Свитка нет в инвентаре',
            technique_not_found: 'Техника из свитка не найдена',
            player_not_found: 'Игрок не найден',
            resting: 'Ты восстанавливаешься',
        };
        showToast(messages[error.code] || error.message || 'Не удалось изучить технику');
    }
}

// Надеть/снять боевую технику (POST /api/player/<id>/techniques/equip или /unequip)
async function toggleTechnique() {
    if (!activeTechniqueCode) {
        return;
    }
    const technique = techniquesData
        && techniquesData.techniques.find((t) => t.code === activeTechniqueCode);
    if (!technique) {
        return;
    }
    const action = technique.is_equipped ? 'unequip' : 'equip';
    try {
        const data = await apiFetch(`/player/${userId}/techniques/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ technique_code: activeTechniqueCode }),
        });
        if (data.success && data.techniques) {
            techniquesData = data.techniques;
        }
        closeModal();
        activeTechniqueCode = null;
        // Хотфикс раунда 54: книга ушла/вернулась (инвентарь ↔ экипировка) —
        // перезагружаем всё без спиннера, иначе экраны показывают старое
        await loadAll(false);
        showToast(data.message || (technique.is_equipped ? 'Техника снята' : 'Техника экипирована'));
    } catch (error) {
        closeModal();
        activeTechniqueCode = null;
        renderTechniques();
        const messages = {
            slots_full: 'Все слоты боя заняты',
            technique_not_learned: 'Техника не изучена',
            resting: 'Ты восстанавливаешься',
            'player not found': 'Игрок не найден',
        };
        showToast(messages[error.code] || error.message || 'Не удалось изменить экипировку');
    }
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
    const qi = data.qi || 0;
    const qiMax = data.qi_max || qi;

    // Полоска Ци техник (запас энергии для боевых техник)
    setBar(
        document.getElementById('techQiFill'),
        document.getElementById('techQiText'),
        qi,
        qiMax
    );

    // Слоты экипировки — показываем только техники, поставленные в бой
    const slots = document.getElementById('techSlots');
    slots.innerHTML = '';
    const equipped = techniques.filter((t) => t.is_equipped);
    for (let index = 0; index < data.max_equipped; index += 1) {
        const technique = equipped[index];
        if (technique) {
            const cell = document.createElement('button');
            cell.className = 'tech-slot filled';
            cell.type = 'button';
            cell.dataset.code = technique.code;
            // Раунд 65: тултип на ужатой обёртке, а не на слоте
            const techTip = `${technique.name} (Ур. ${technique.level})·Ци ${technique.qi_cost}`;
            cell.innerHTML = `<span class="tech-icon" data-tooltip="${esc(techTip)}">${techVisual(technique, 'tech-img')}</span>`;
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
            const equippedBadge = technique.is_equipped
                ? '<span class="tech-badge tech-badge-equipped">⚔️ В бою</span>'
                : '';
            return `
            <button class="tech-item${technique.is_equipped ? ' equipped' : ''}" data-code="${esc(technique.code)}" type="button">
                <span class="tech-item-icon">${icon}</span>
                <span class="tech-item-meta">
                    <span class="tech-item-name">${esc(technique.name)}</span>
                    <span class="tech-item-sub">${esc(technique.element || '—')}${technique.qi_cost ? ` · 🌀 Ци ${esc(technique.qi_cost)}` : ''}</span>
                </span>
                <span class="tech-item-level">Ур. ${esc(technique.level)}</span>
                ${equippedBadge}
            </button>`;
        })
        .join('');

    // Клик по технике — модальное окно
    list.querySelectorAll('.tech-item').forEach((row) => {
        row.addEventListener('click', () => openTechniqueModal(techniques, row.dataset.code));
    });

    renderTechniqueCatalog();
}

// Каталог всех техник мира: изученные и заблокированные
function renderTechniqueCatalog() {
    const box = document.getElementById('techCatalog');
    if (!box) {
        return;
    }
    const catalog = (techniquesData && techniquesData.catalog) || [];
    if (!catalog.length) {
        box.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');
    box.innerHTML = catalog.map((technique) => {
        const icon = ELEMENT_ICONS[technique.element] || ELEMENT_ICONS.none;
        const learned = technique.is_learned;
        const met = technique.requirements_met;
        const classes = ['tech-item', 'tech-catalog-item'];
        if (learned) {
            classes.push('learned');
        } else if (met) {
            classes.push('available');
        } else {
            classes.push('locked');
        }
        // Недоступно: сначала закрыто, но выполнимо при выполнении требований
        const status = learned
            ? '<span class="tech-badge tech-badge-equipped">✅ Изучена</span>'
            : (met ? '📜 Ищи свиток' : '🔒');
        const sub = [
            technique.required_affinity
                ? `Сродство ${esc(technique.required_affinity)}`
                : 'Без сродства',
            technique.qi_cost ? `🌀 Ци ${esc(technique.qi_cost)}` : '',
        ].filter(Boolean).join(' · ');
        return `
        <button class="${classes.join(' ')}" data-code="${esc(technique.code)}" type="button">
            <span class="tech-item-icon">${icon}</span>
            <span class="tech-item-meta">
                <span class="tech-item-name">${esc(technique.name)}</span>
                <span class="tech-item-sub">${sub}</span>
            </span>
            <span class="tech-item-level">${status}</span>
        </button>`;
    }).join('');

    box.querySelectorAll('.tech-item').forEach((row) => {
        row.addEventListener('click', () => openTechniqueModal(catalog, row.dataset.code));
    });
}

function openTechniqueModal(techniques, code) {
    const technique = techniques.find((t) => t.code === code);
    if (!technique) {
        return;
    }

    const icon = techVisual(technique, 'modal-icon-img');
    const effects = technique.effects || [];
    const effectChips = effects.length
        ? `<div class="item-combo-chips">
            ${effects.map((effect) => `<span class="item-combo-chip">${esc(techniqueEffectLabel(effect))}</span>`).join('')}
        </div>`
        : '';

    // Урон техники: из диапазона с сервера (учитывает уровень игрока)
    let damageRow = '';
    if (technique.damage_max) {
        damageRow = `<div><span class="muted">Урон</span><span>${esc(technique.damage_min)}–${esc(technique.damage_max)}</span></div>`;
    }
    if (technique.base_heal) {
        damageRow += `<div><span class="muted">Лечение</span><span>${esc(technique.base_heal)}</span></div>`;
    }
    const affinityRow = technique.required_affinity
        ? `<div><span class="muted">Сродство</span><span>${esc(technique.required_affinity)}</span></div>`
        : '';
    // Раунд 56: книга-навык 📖 — виртуальная плитка изученной техники.
    // Показываем свиток-источник (информационно, логику не меняет).
    const rawSource = findScrollForTechnique(technique.code) || technique.name;
    // Имя из инвентаря уже вида «Свиток "…"» — не заворачиваем дважды.
    const sourceLabel = /^свиток\s/i.test(rawSource) ? rawSource : `Свиток «${rawSource}»`;
    const sourceRow = technique.is_learned
        ? `<div><span class="muted">📜 Источник</span><span>${esc(sourceLabel)}</span></div>`
        : '';
    const requirementsChips = techniqueRequirementsChips(technique);

    activeTechniqueCode = technique.code;
    activeItemCode = null;
    activeEquipSlot = null;

    document.getElementById('modalTitle').textContent = technique.name;
    document.getElementById('modalBody').innerHTML = `
        <div class="modal-icon">${icon}</div>
        <div class="modal-title">${esc(technique.name)}</div>
        <div class="modal-desc">
            <div><span class="muted">Элемент</span><span>${esc(technique.element || '—')}</span></div>
            <div><span class="muted">Тип</span><span>${esc(technique.tech_type || '—')}</span></div>
            ${technique.is_learned
                ? `<div><span class="muted">Уровень</span><span>${esc(technique.level)}</span></div>`
                : '<div><span class="muted">Статус</span><span>Не изучена</span></div>'}
            <div><span class="muted">Стоимость</span><span>${technique.qi_cost ? `🌀 Ци ${esc(technique.qi_cost)}` : '—'}</span></div>
            ${damageRow}
            ${affinityRow}
            ${sourceRow}
            ${technique.is_learned
                ? `<div><span class="muted">Экипирована</span><span>${technique.is_equipped ? 'да ⚔️' : 'нет'}</span></div>`
                : ''}
        </div>
        ${technique.description ? `<div class="modal-info">${esc(technique.description)}</div>` : ''}
        ${requirementsChips}
        ${effectChips}
    `;
    const useButton = document.getElementById('modalUse');
    useButton.textContent = technique.is_equipped ? 'Снять' : 'Надеть';
    useButton.classList.toggle('hidden', !technique.is_learned);
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
    activeTechniqueCode = null;
    activeScrollCode = null;
}

// ---------- Экран: Крафт ----------

// Загрузка рецептов (при открытии вкладки)
async function loadCrafts() {
    craftLoading = true;
    renderCrafts();
    try {
        const data = await apiFetch(`/crafts`);
        craftRecipes = data.crafts || [];
    } catch (error) {
        craftRecipes = [];
    } finally {
        craftLoading = false;
    }
    // Перезагружаем детали выбранного рецепта, если он открыт
    if (activeCraftCode) {
        await loadCraftDetail(activeCraftCode);
    }
    renderCrafts();
}

// Картинка рецепта крафта: иконка из справочника (crafts.image) → 🔨.
// Пустого поля не боимся: рецептов мало, иконку заливает админ (раунд 61),
// <img> рисуем только когда адрес есть — без чужой пустышки.
function craftRecipeVisual(craft) {
    if (!craft || !craft.image) {
        return '🔨';
    }
    const src = esc(craft.image);
    return `<img class="craft-recipe-img" src="${src}" alt="" loading="lazy"`
        + ` onerror="this.outerHTML='🔨'">`;
}

// Список рецептов (левая колонка 50%)
function renderCrafts() {
    const box = document.getElementById('craftRecipes');
    const empty = document.getElementById('craftEmpty');
    empty.classList.toggle('hidden', craftRecipes.length > 0 || craftLoading);

    // Пока грузится список — не показываем «рецептов нет»
    if (craftLoading) {
        box.innerHTML = '<div class="craft-loading">⏳ Загрузка рецептов…</div>';
        return;
    }

    box.innerHTML = craftRecipes.map((craft) => `
        <button class="craft-recipe${craft.code === activeCraftCode ? ' craft-recipe-active' : ''}"
                type="button" data-code="${esc(craft.code)}"
                title="${esc(craft.description || '')}">
            <span class="craft-recipe-icon">${craftRecipeVisual(craft)}</span>
            <span class="craft-recipe-info">
                <span class="craft-recipe-name">${esc(craft.name)}</span>
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
    // Слоты рецепта: рисуем ТОЛЬКО объявленные — у обычных рецептов их 3,
    // у «Ядра стихий» все 5. Пустые слоты 4–5 не показываем (фикс раунда 39).
    const slotNums = [1, 2, 3, 4, 5].filter((n) => {
        const cats = recipe[`slot_${n}_categories`];
        return Array.isArray(cats) && cats.length > 0;
    });
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
        ${aggregateReqs.map((req) => {
            // Прогресс требования: сила 3/5 → полоска с заполнением
            const percent = req.met
                ? 100
                : Math.min(100, Math.round((req.value || 0) / Math.max(1, req.required) * 100));
            return `
            <div class="tinkers-req ${req.met ? 'tinkers-req-met' : 'tinkers-req-unmet'}">
                <span>${req.met ? '✅' : '⚠️'}</span>
                <span>${REQUIREMENT_LABELS[req.key] || req.key}: ${req.value}/${req.required}</span>
                ${req.met ? '' : '<span class="tinkers-req-penalty">штраф</span>'}
                <span class="tinkers-req-bar">
                    <span class="tinkers-req-bar-fill${req.met ? ' ok' : ''}" style="width:${percent}%"></span>
                </span>
            </div>`;
        }).join('')}
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
        <span class="craft-material-icon">${itemVisual(material, 'craft-material-img')}</span>
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
    const detailBox = document.getElementById('craftDetail');
    const hint = document.getElementById('craftDetailHint');
    if (hint) {
        hint.classList.add('hidden');
    }
    // Показываем loading вместо пустого блока
    detailBox.innerHTML = '<div class="craft-loading">⏳ Загрузка рецепта…</div>';
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
            // Пометка: craft-applied — уже лежит в слоте (✓-бейдж в CSS),
            // craft-pending — выделен сейчас (золотая рамка).
            // Раунд 60: квадратные плитки как в инвентаре — только иконка
            // и счётчик; имя и характеристики живут в тултипе (#craftTooltip)
            // и в строке «Выбрано» под сеткой (для тач-устройств).
            const appliedClass = material.code === applied ? ' craft-applied' : '';
            const pendingClass = material.code === pending ? ' craft-pending' : '';
            const warnBadge = (material.requirements_met === false)
                ? '<span class="craft-tile-warn">⚠️</span>'
                : '';
            return `
            <button class="craft-tile${appliedClass}${pendingClass}"
                    type="button" data-code="${esc(material.code)}">
                <span class="craft-tile-icon">${itemVisual(material, 'craft-material-img')}</span>
                <span class="craft-tile-count">×${esc(material.count)}</span>${warnBadge}
            </button>`;
        }).join('')
        : '<div class="craft-empty-inline">Подходящих материалов нет</div>';

    list.querySelectorAll('.craft-tile').forEach((button) => {
        const code = button.dataset.code;
        button.addEventListener('click', () => {
            selectCraftMaterial(code);
        });
        // Кастомный тултип только для мыши (на таче — модалка и строка
        // «Выбрано» под сеткой). Текст задаём через dataset — безопасно:
        // setAttribute не парсит HTML, экранировать ничего не нужно.
        if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
            button.addEventListener('mouseenter', () => {
                // Раунд 65: якорь тултипа — иконка, а не вся плитка
                scheduleCraftTooltip(
                    button.querySelector('.craft-tile-icon') || button);
            });
            button.addEventListener('mouseleave', () => {
                hideCraftTooltip();
            });
        }
    });

    // Строка под сеткой: выбранный материал с характеристиками.
    // На тач-устройствах заменяет тултип (hover там не работает).
    const pendingMaterial = findCraftMaterial(craftMaterialPending);
    bonus.textContent = pendingMaterial
        ? `Выбрано: ${pendingMaterial.name} — ${craftMaterialBonusText(pendingMaterial)}`
        : 'Выбрано: —';

    // «Выбрать» активна, только когда material выделен
    chooseBtn.disabled = !craftMaterialPending;

    // Тултип привязан к координатам плитки — при скролле модалки прячем,
    // иначе он зависнет не на месте
    const scrollBox = modal.querySelector('.craft-material-modal-content');
    if (scrollBox) {
        scrollBox.onscroll = hideCraftTooltip;
    }

    modal.classList.remove('hidden');
}

// Выделение материала в модалке (без закрытия и применения).
// Раунд 60: повторный клик по выделенной плитке снимает выделение.
function selectCraftMaterial(code) {
    if (!craftMaterialModal) {
        return;
    }
    hideCraftTooltip();
    craftMaterialPending = (craftMaterialPending === code) ? null : code;
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

// ---------- Кастомный тултип материалов крафта (раунд 60) ----------
// CSS-пузырь через attr(data-tooltip) не подошёл: однострочный текст без
// жирного заголовка и, главное, обрезается скроллом модалки. Поэтому тултип
// живёт в body (position: fixed) и позиционируется по getBoundingClientRect
// якоря. Весь текст задаётся через textContent — безопасно (XSS нет).
let craftTooltipEl = null;
let craftTooltipTimer = null;

function getCraftTooltipEl() {
    if (!craftTooltipEl) {
        craftTooltipEl = document.createElement('div');
        craftTooltipEl.id = 'craftTooltip';
        craftTooltipEl.className = 'craft-tooltip hidden';
        document.body.appendChild(craftTooltipEl);
    }
    return craftTooltipEl;
}

// Показать тултип с задержкой 200мс (не мелькает при быстром движении)
function scheduleCraftTooltip(anchor) {
    hideCraftTooltip();
    craftTooltipTimer = setTimeout(() => {
        craftTooltipTimer = null;
        showCraftTooltip(anchor);
    }, 200);
}

function showCraftTooltip(anchor) {
    // Якорь — иконка внутри плитки (раунд 65): код берём у плитки
    const tile = (anchor && anchor.closest)
        ? anchor.closest('.craft-tile') : null;
    const code = ((tile || anchor) && (tile || anchor).dataset)
        ? (tile || anchor).dataset.code : "";
    const material = code ? findCraftMaterial(code) : null;
    if (!material) {
        return;
    }
    const tip = getCraftTooltipEl();
    tip.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'craft-tooltip-title';
    title.textContent = material.name;
    tip.appendChild(title);
    const stats = document.createElement('div');
    stats.className = 'craft-tooltip-stats';
    stats.textContent = craftMaterialStatsText(material);
    tip.appendChild(stats);
    if (material.element && material.element !== 'none') {
        const element = document.createElement('div');
        element.className = 'craft-tooltip-element';
        element.textContent = `Стихия: ${CRAFT_ELEMENT_LABELS[material.element] || material.element}`;
        tip.appendChild(element);
    }
    if (material.requirements_met === false) {
        const warn = document.createElement('div');
        warn.className = 'craft-tooltip-warn';
        warn.textContent = '⚠️ Требования: будет штраф';
        tip.appendChild(warn);
    }
    // Замеряем невидимым, чтобы спозиционировать до показа
    tip.classList.remove('hidden');
    tip.style.visibility = 'hidden';
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const rect = anchor.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));
    let top = rect.top - tipHeight - 10;
    // Над плиткой нет места (первый ряд) — показываем под плиткой
    const below = top < 8;
    if (below) {
        top = rect.bottom + 10;
    }
    tip.classList.toggle('craft-tooltip-below', below);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.visibility = '';
}

function hideCraftTooltip() {
    if (craftTooltipTimer) {
        clearTimeout(craftTooltipTimer);
        craftTooltipTimer = null;
    }
    if (craftTooltipEl) {
        craftTooltipEl.classList.add('hidden');
    }
}

function closeCraftMaterialModal() {
    hideCraftTooltip();
    document.getElementById('craftMaterialModal').classList.add('hidden');
    craftMaterialModal = null;
    craftMaterialPending = null;
}

// Выполнение крафта (POST /api/player/<id>/craft)
async function doCraft2() {
    // Блокируем кнопку «Создать» на время запроса (loading-state)
    const btn = document.getElementById('btnDoCraft2');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Создаю…';
    }
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
        // Возвращаем кнопке прежнее состояние (selections не тронуты)
        renderCraftDetail();
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
            apiFetch(`/player/${id}/techniques?all=1`),
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

// ---------- Квесты (раунд 53, без NPC) ----------
function questRow(q, action) {
    const pct = q.count > 0 ? Math.min(100, Math.round((q.progress / q.count) * 100)) : 0;
    const btn = action === 'claim'
        ? `<button class="btn btn-primary" onclick="claimQuest('${q.code}')">Забрать</button>`
        : (action === 'start'
            ? `<button class="btn btn-outline" onclick="startQuest('${q.code}')">Начать</button>` : '');
    return `<div class="tech-item"><div class="tech-item-meta">`
        + `<span class="tech-item-name">${q.name} (${q.progress}/${q.count})</span>`
        + `<span class="tech-item-sub">${q.description || ''}</span>`
        + `<div class="bar" style="margin-top:6px"><div class="bar-fill fill-xp" style="width:${pct}%"></div></div>`
        + `</div>${btn}</div>`;
}

async function loadQuests() {
    try {
        const id = await ensureUserId();
        const data = await apiFetch(`/player/${id}/quests`);
        const claim = document.getElementById('questClaimable');
        const active = document.getElementById('questActive');
        const avail = document.getElementById('questAvailable');
        if (!claim || !active || !avail) return;
        claim.innerHTML = (data.claimable || []).map((q) => questRow(q, 'claim')).join('')
            || '<div class="tech-empty">Нет готовых наград.</div>';
        active.innerHTML = (data.active || []).map((q) => questRow(q, null)).join('')
            || '<div class="tech-empty">Нет активных квестов.</div>';
        avail.innerHTML = (data.available || []).map((q) => questRow(q, 'start')).join('')
            || '<div class="tech-empty">Нет доступных квестов.</div>';
    } catch (e) { console.error('Квесты:', e); }
}

async function startQuest(code) {
    const id = await ensureUserId();
    await apiFetch(`/player/${id}/quests/start`, { method: 'POST', body: JSON.stringify({ code }) });
    loadQuests();
}

async function claimQuest(code) {
    const id = await ensureUserId();
    const res = await apiFetch(`/player/${id}/quests/claim`, { method: 'POST', body: JSON.stringify({ code }) });
    showToast(res.success ? 'Награда получена!' : ('Ошибка: ' + res.message));
    loadQuests();
    loadAll(false);
}

// ---------- Размеры иконок (раунд 77–78, ступени с раунда 94) ----------
// Хранятся только в браузере игрока (localStorage, сервер не нужен).
// Раунд 78: у инвентаря и экипировки свои размеры и свои панели.
// Старый общий ключ 'myrpg_item_size' (р.77) используется как фолбэк
// при первом запуске, чтобы не сбрасывать настройку игрока.
// Раунд 94: вместо шага 8px — три ступени (1 → 56px, 2 → 72px, 3 → 96px),
// метка панели показывает номер ступени. В localStorage лежат px (ключи
// те же), старые значения маппятся на ближайшую ступень — настройки
// игроков не слетят; дефолт — ступень 2 (72px).
const INV_SIZE_KEY = 'myrpg_inventory_item_size';
const EQ_SIZE_KEY = 'myrpg_equipment_item_size';
const LEGACY_SIZE_KEY = 'myrpg_item_size';
const SIZE_LEVELS = [56, 72, 96];
const ITEM_SIZE_DEFAULT = 72;

function sizeLevelIndex(value) {
    // Ближайшая ступень к значению px; ties — вверх (64 → 72, а не 56).
    const num = parseInt(value, 10);
    if (!Number.isFinite(num)) {
        return SIZE_LEVELS.indexOf(ITEM_SIZE_DEFAULT);
    }
    let best = 0;
    for (let i = 1; i < SIZE_LEVELS.length; i++) {
        if (Math.abs(SIZE_LEVELS[i] - num) <= Math.abs(SIZE_LEVELS[best] - num)) {
            best = i;
        }
    }
    return best;
}

// Конфиг двух панелей: ключ localStorage, CSS-переменная, id элементов.
// draft — индекс ступени (0-based), в CSS-переменную и localStorage идут px.
const SIZE_PANELS = [
    {
        storeKey: INV_SIZE_KEY,
        cssVar: '--inventory-item-size',
        panel: 'inventorySizePanel',
        value: 'invSizeValue',
        minus: 'invSizeMinus',
        plus: 'invSizePlus',
        save: 'invSizeSave',
        close: 'invSizeClose',
        title: 'invTitleBtn',
        draft: 1,
    },
    {
        storeKey: EQ_SIZE_KEY,
        cssVar: '--equipment-item-size',
        panel: 'equipmentSizePanel',
        value: 'eqSizeValue',
        minus: 'eqSizeMinus',
        plus: 'eqSizePlus',
        save: 'eqSizeSave',
        close: 'eqSizeClose',
        title: 'equipTitleBtn',
        draft: 1,
    },
];

function savedItemSize(storeKey) {
    // Новый ключ → legacy-ключ р.77 → дефолт 72px
    return localStorage.getItem(storeKey)
        || localStorage.getItem(LEGACY_SIZE_KEY)
        || String(ITEM_SIZE_DEFAULT);
}

function applyPanelSize(cfg, levelIndex) {
    const idx = Math.max(0, Math.min(SIZE_LEVELS.length - 1, levelIndex | 0));
    cfg.draft = idx;
    document.documentElement.style.setProperty(cfg.cssVar, SIZE_LEVELS[idx] + 'px');
    const label = document.getElementById(cfg.value);
    if (label) {
        label.textContent = String(idx + 1);
    }
}

function initItemSizes() {
    // Загрузка при старте: сохранённые размеры (ступенью) или 72px
    SIZE_PANELS.forEach((cfg) => {
        applyPanelSize(cfg, sizeLevelIndex(savedItemSize(cfg.storeKey)));
        const titleBtn = document.getElementById(cfg.title);
        if (titleBtn) {
            titleBtn.addEventListener('click', () => {
                document.getElementById(cfg.panel).classList.remove('hidden');
            });
        }
        const minus = document.getElementById(cfg.minus);
        const plus = document.getElementById(cfg.plus);
        const save = document.getElementById(cfg.save);
        const close = document.getElementById(cfg.close);
        if (minus) {
            minus.addEventListener('click', () => applyPanelSize(cfg, cfg.draft - 1));
        }
        if (plus) {
            plus.addEventListener('click', () => applyPanelSize(cfg, cfg.draft + 1));
        }
        if (save) {
            save.addEventListener('click', () => {
                localStorage.setItem(cfg.storeKey, String(SIZE_LEVELS[cfg.draft]));
                document.getElementById(cfg.panel).classList.add('hidden');
                showToast('Размер иконок сохранён');
            });
        }
        if (close) {
            // «✕» — закрыть без сохранения, превью откатить к сохранённому
            close.addEventListener('click', () => {
                applyPanelSize(cfg, sizeLevelIndex(savedItemSize(cfg.storeKey)));
                document.getElementById(cfg.panel).classList.add('hidden');
            });
        }
    });
}

// ---------- Синглтон-тултип предметов (раунд 78) ----------
// Заменяет CSS-пузырь р.59 (::after на data-tooltip): тот жил внутри
// скролл-контейнеров — растягивал родителя (ползунки у нижних плиток),
// обрезался краем (левые плитки) и уходил за верх вьюпорта (верхние).
// Синглтон живёт в body (position: fixed): на размеры родителей не влияет
// и их краями не обрезается. Позиция — по getBoundingClientRect якоря,
// с клампом по бокам и флипом вниз (по образцу showCraftTooltip из р.60).
// Текст — через textContent, делегирование — одно на документ (перерендеры
// сеток обработчиков не требуют). Только мышь: на таче — модалка по клику.
let itemTooltipEl = null;
let itemTooltipTimer = null;
let itemTooltipAnchor = null;

function getItemTooltipEl() {
    if (!itemTooltipEl) {
        itemTooltipEl = document.getElementById('itemTooltip');
    }
    return itemTooltipEl;
}

function scheduleItemTooltip(anchor) {
    hideItemTooltip();
    itemTooltipAnchor = anchor;
    itemTooltipTimer = setTimeout(() => {
        itemTooltipTimer = null;
        showItemTooltip(anchor);
    }, 200);
}

function showItemTooltip(anchor) {
    const tip = getItemTooltipEl();
    const text = anchor && anchor.dataset ? (anchor.dataset.tooltip || '') : '';
    if (!tip || !text) {
        return;
    }
    tip.textContent = text;
    // Замеряем невидимым, чтобы спозиционировать до показа
    tip.classList.remove('hidden');
    tip.style.visibility = 'hidden';
    const tipWidth = tip.offsetWidth;
    const tipHeight = tip.offsetHeight;
    const rect = anchor.getBoundingClientRect();
    // По центру над якорем, кламп по левому/правому краю вьюпорта
    let left = rect.left + rect.width / 2 - tipWidth / 2;
    left = Math.max(4, Math.min(left, window.innerWidth - tipWidth - 4));
    let top = rect.top - tipHeight - 8;
    // Сверху нет места (верхний ряд) — флип под якорь
    if (top < 4) {
        top = rect.bottom + 8;
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.visibility = '';
}

function hideItemTooltip() {
    if (itemTooltipTimer) {
        clearTimeout(itemTooltipTimer);
        itemTooltipTimer = null;
    }
    itemTooltipAnchor = null;
    if (itemTooltipEl) {
        itemTooltipEl.classList.add('hidden');
    }
}

function initItemTooltip() {
    if (!window.matchMedia || !window.matchMedia('(hover: hover)').matches) {
        return;
    }
    document.addEventListener('mouseover', (event) => {
        const anchor = event.target && event.target.closest
            ? event.target.closest('[data-tooltip]') : null;
        if (!anchor) {
            return;
        }
        // Уже показан для этого якоря — не перезапускаем таймер
        if (anchor === itemTooltipAnchor && itemTooltipEl
                && !itemTooltipEl.classList.contains('hidden')) {
            return;
        }
        scheduleItemTooltip(anchor);
    });
    document.addEventListener('mouseout', (event) => {
        const anchor = event.target && event.target.closest
            ? event.target.closest('[data-tooltip]') : null;
        if (!anchor) {
            return;
        }
        // Уход внутрь того же якоря — не прячем
        if (event.relatedTarget && anchor.contains
                && anchor.contains(event.relatedTarget)) {
            return;
        }
        hideItemTooltip();
    });
    // Скролл/клик/ресайз — позиция протухла, прячем
    document.addEventListener('scroll', hideItemTooltip, true);
    document.addEventListener('click', hideItemTooltip, true);
    window.addEventListener('resize', hideItemTooltip);
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

            // Квесты при открытии вкладки «Квесты»
            if (button.dataset.screen === 'screen-quests') {
                loadQuests();
            }
        });
    });
}

// ---------- Инициализация ----------
function init() {
    initTabs();
    initItemSizes();
    initItemTooltip();

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

    // Фон приложения (раунд 48): подгружаем отдельно от данных игрока,
    // чтобы медленный /api/settings не задерживал отрисовку профиля
    loadAppBackground();

    loadAll(true);
}

document.addEventListener('DOMContentLoaded', init);