// ================================================
// СЯНЬСЯ MINI APP — логика
// VK Bridge → получение user_id, аватара и имени →
// сохранение имени на сервере → загрузка данных
// с API → отрисовка персонажа и техник.
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
        const error = new Error(data.error || `HTTP ${response.status}`);
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

    // Строка культивации в панели статов
    const cultivation = player.cultivation;
    document.getElementById('cultivationLine').textContent = cultivation
        ? `${cultivation.stage}.${cultivation.substage} ${cultivation.stage_name}`
        : '—';

    // Характеристики
    document.getElementById('statsGrid').innerHTML = STATS.map(
        (stat) => `
        <div class="stat">
            <span>${stat.label}</span>
            <b>${esc(player[stat.key])}</b>
        </div>`
    ).join('');

    renderInventoryPanel();
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

    // Закрытие модалки по клику на фон
    document.getElementById('modal').addEventListener('click', (event) => {
        if (event.target === document.getElementById('modal')) {
            closeModal();
        }
    });

    loadAll(true);
}

document.addEventListener('DOMContentLoaded', init);