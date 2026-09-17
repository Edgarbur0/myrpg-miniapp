// ================================================
// СЯНЬСЯ MINI APP — логика
// VK Bridge → получение user_id → загрузка данных
// с API → отрисовка 4 экранов и действия игрока.
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

// Подписи характеристик
const STATS = [
    { key: 'strength', label: 'Сила', icon: '💪' },
    { key: 'agility', label: 'Ловкость', icon: '🏃' },
    { key: 'intelligence', label: 'Интеллект', icon: '🧠' },
    { key: 'endurance', label: 'Выносливость', icon: '❤️' },
    { key: 'armor', label: 'Броня', icon: '🛡️' },
    { key: 'luck', label: 'Удача', icon: '🍀' },
];

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
let playerData = null;
let inventoryData = null;
let techniquesData = null;
let toastTimer = null;

// ---------- VK Bridge ----------
async function ensureUserId() {
    if (userId) {
        return userId;
    }

    // Пробуем получить ID через VK Bridge
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

// ---------- Работа с API ----------
async function apiFetch(path, options) {
    const response = await fetch(API_URL + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.error || `HTTP ${response.status}`);
        error.code = data.error;
        throw error;
    }
    return data;
}

// ---------- Утилиты ----------
function setBar(fill, text, current, max) {
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

// ---------- Экран: Персонаж ----------
function renderCharacter() {
    const player = playerData;
    if (!player) {
        return;
    }

    document.getElementById('charName').textContent = player.nickname;
    document.getElementById('charLevel').textContent = `Уровень ${player.level}`;
    document.getElementById('charCult').textContent = player.cultivation
        ? player.cultivation.stage_name
        : '—';

    setBar(
        document.getElementById('hpFill'),
        document.getElementById('hpText'),
        player.hp,
        player.max_hp
    );

    // MP показываем только если API отдаёт эти поля
    const hasMp = player.max_mp > 0;
    document.getElementById('mpWrap').classList.toggle('hidden', !hasMp);
    if (hasMp) {
        setBar(
            document.getElementById('mpFill'),
            document.getElementById('mpText'),
            player.mp,
            player.max_mp
        );
    }

    setBar(
        document.getElementById('xpFill'),
        document.getElementById('xpText'),
        player.experience,
        player.experience_needed
    );

    // Характеристики
    document.getElementById('statsGrid').innerHTML = STATS.map(
        (stat) => `
        <div class="stat">
            <span class="stat-icon">${stat.icon}</span>
            <span class="stat-label">${stat.label}</span>
            <span class="stat-value">${esc(player[stat.key])}</span>
        </div>`
    ).join('');

    // Ресурсы
    document.getElementById('resources').innerHTML = `
        <div class="resource"><span>🪙</span><span>${esc(player.gold)}</span><span class="res-name">золото</span></div>
        <div class="resource"><span>💎</span><span>${esc(player.crystals)}</span><span class="res-name">кристаллы</span></div>
        <div class="resource"><span>✨</span><span>${esc(player.spirit_crystals)}</span><span class="res-name">дух. кристаллы</span></div>
    `;

    // Локация
    const location = player.location;
    const locationBlock = document.getElementById('locationBlock');
    if (location) {
        locationBlock.innerHTML = `
            <div class="location-name">📍 ${esc(location.name)}</div>
            <div class="location-desc">${esc(location.description)}</div>
        `;
    } else {
        locationBlock.innerHTML = `<div class="location-desc">Локация неизвестна</div>`;
    }
}

// ---------- Экран: Инвентарь ----------
function renderInventory() {
    const data = inventoryData;
    if (!data) {
        return;
    }

    const inventory = data.inventory || {};
    const codes = Object.keys(inventory);

    document.getElementById('invSlots').textContent = `Слоты ${data.used_slots}/${data.max_slots}`;
    document.getElementById('invEmpty').classList.toggle('hidden', codes.length > 0);
    document.getElementById('invGrid').classList.toggle('hidden', codes.length === 0);

    const grid = document.getElementById('invGrid');
    grid.innerHTML = codes
        .map((code) => {
            const item = inventory[code];
            const usable = item.type === 'consumable';
            return `
            <button class="inv-cell ${usable ? 'usable' : ''}" data-code="${esc(code)}" type="button">
                <span class="inv-icon">${item.icon}</span>
                <span class="inv-name">${esc(item.name)}</span>
                <span class="inv-count">×${esc(item.count)}</span>
            </button>`;
        })
        .join('');

    // Клик по предмету — модальное окно
    grid.querySelectorAll('.inv-cell').forEach((cell) => {
        cell.addEventListener('click', () => openItemModal(grid.dataset.source || inventory, cell.dataset.code));
    });
}

function openItemModal(inventory, code) {
    const item = inventory[code];
    if (!item) {
        return;
    }

    const usable = item.type === 'consumable';
    const body = document.getElementById('modalBody');
    body.innerHTML = `
        <div class="modal-icon">${item.icon}</div>
        <div class="modal-title">${esc(item.name)}</div>
        <div class="modal-desc">
            <div>Тип<span>${esc(ITEM_TYPE_LABELS[item.type] || 'Предмет')}</span></div>
            <div>Количество<span>×${esc(item.count)}</span></div>
        </div>
        <div class="modal-actions">
            ${usable ? '<button id="modalUse" class="btn btn-gold" type="button">Использовать</button>' : ''}
            <button id="modalCancel" class="btn btn-outline" type="button">Закрыть</button>
        </div>
    `;

    openModal();
    if (usable) {
        document.getElementById('modalUse').addEventListener('click', usePotion);
    }
    document.getElementById('modalCancel').addEventListener('click', closeModal);
}

// Использование зелья (POST /api/player/<id>/use_potion)
async function usePotion() {
    try {
        const data = await apiFetch(`/player/${userId}/use_potion`, { method: 'POST' });
        closeModal();

        if (data.success) {
            // Обновляем данные на месте, без полной перезагрузки
            playerData.hp = data.hp;
            playerData.max_hp = data.max_hp;
            if (inventoryData.inventory.potion_heal) {
                inventoryData.inventory.potion_heal.count = data.potions_left;
                if (data.potions_left <= 0) {
                    delete inventoryData.inventory.potion_heal;
                }
            }
            renderCharacter();
            renderInventory();
            showToast(`+${data.heal} HP 💚`);
        }
    } catch (error) {
        closeModal();
        const messages = {
            no_potion: 'Зелий лечения не осталось',
            full_hp: 'Здоровье уже полное',
            'player not found': 'Игрок не найден',
        };
        showToast(messages[error.code] || 'Не удалось использовать предмет');
    }
}

// ---------- Экран: Культивация ----------
function renderCultivation() {
    const cultivation = playerData && playerData.cultivation;
    if (!cultivation) {
        return;
    }

    document.getElementById('cultName').textContent = cultivation.stage_name;
    // В БД ступени 0–14, игроку показываем 1–15
    document.getElementById('cultNum').textContent = `${cultivation.stage + 1}/15`;
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

    // Кнопка прорыва активна, только когда опыт стадии заполнен
    const canBreakthrough = cultivation.stage_experience >= cultivation.stage_experience_needed;
    document.getElementById('btnBreakthrough').disabled = !canBreakthrough;
}

// Медитация (эндпоинт появится в следующих этапах)
async function meditate() {
    try {
        await apiFetch(`/player/${userId}/meditate`, { method: 'POST' });
        await loadAll(false);
        showToast('Медитация прошла успешно 🧘');
    } catch (error) {
        showToast('Медитация скоро появится в игре');
    }
}

// Прорыв (эндпоинт появится в следующих этапах)
async function breakthrough() {
    try {
        await apiFetch(`/player/${userId}/breakthrough`, { method: 'POST' });
        await loadAll(false);
        showToast('Прорыв совершён ✨');
    } catch (error) {
        showToast('Прорыв недоступен');
    }
}

// ---------- Экран: Техники ----------
function renderTechniques() {
    const data = techniquesData;
    if (!data) {
        return;
    }

    const techniques = data.techniques || [];
    const equipped = techniques.filter((t) => t.is_equipped).length;

    document.getElementById('techSlots').textContent = `Экип ${equipped}/${data.max_equipped}`;
    document.getElementById('techEmpty').classList.toggle('hidden', techniques.length > 0);
    document.getElementById('techList').classList.toggle('hidden', techniques.length === 0);

    const list = document.getElementById('techList');
    list.innerHTML = techniques
        .map((technique) => {
            const icon = ELEMENT_ICONS[technique.element] || ELEMENT_ICONS.none;
            return `
            <button class="tech-row" data-code="${esc(technique.code)}" type="button">
                <span class="tech-icon">${icon}</span>
                <span class="tech-name">${esc(technique.name)}</span>
                <span class="tech-chip">${esc(technique.element || '—')}</span>
                <span class="tech-level">Ур. ${esc(technique.level)}</span>
                ${technique.is_equipped ? '<span class="tech-equipped">★</span>' : ''}
            </button>`;
        })
        .join('');

    // Клик по технике — модальное окно
    list.querySelectorAll('.tech-row').forEach((row) => {
        row.addEventListener('click', () => openTechniqueModal(techniques, row.dataset.code));
    });
}

function openTechniqueModal(techniques, code) {
    const technique = techniques.find((t) => t.code === code);
    if (!technique) {
        return;
    }

    const icon = ELEMENT_ICONS[technique.element] || ELEMENT_ICONS.none;
    const body = document.getElementById('modalBody');
    body.innerHTML = `
        <div class="modal-icon">${icon}</div>
        <div class="modal-title">${esc(technique.name)}</div>
        <div class="modal-desc">
            <div>Элемент<span>${esc(technique.element || '—')}</span></div>
            <div>Уровень<span>${esc(technique.level)}</span></div>
            <div>Экипирована<span>${technique.is_equipped ? 'да' : 'нет'}</span></div>
        </div>
        <div class="modal-actions">
            <button id="modalCancel" class="btn btn-outline" type="button">Закрыть</button>
        </div>
    `;

    openModal();
    document.getElementById('modalCancel').addEventListener('click', closeModal);
}

// ---------- Модальное окно ----------
function openModal() {
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
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
    renderCharacter();
    renderInventory();
    renderCultivation();
    renderTechniques();
}

// ---------- Переключение вкладок ----------
function initTabs() {
    document.querySelectorAll('.nav-btn').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
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
    document.getElementById('btnMeditate').addEventListener('click', meditate);
    document.getElementById('btnBreakthrough').addEventListener('click', breakthrough);

    // Закрытие модалки по клику на фон
    document.getElementById('modal').addEventListener('click', (event) => {
        if (event.target === document.getElementById('modal')) {
            closeModal();
        }
    });

    loadAll(true);
}

document.addEventListener('DOMContentLoaded', init);