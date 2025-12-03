// Состояние приложения
let products = [];
let brands = [];
let blogPosts = [];
let cart = [];
let wishlist = [];
let orders = [];
let userProfile = {};
let currentPage = 'home';
let currentProduct = null;
let currentPageCatalog = 1;
const productsPerPage = 8;
let appliedFilters = {
    category: [],
    brand: [],
    features: [],
    rating: null,
    priceRange: [0, 10000]
};

// API базовый URL
const API_BASE_URL = 'http://localhost:5001/api';

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, начинаем инициализацию...');
    
    // Сначала показываем главную страницу
    showPage('home');
    
    // Затем загружаем данные
    initializeApp();
    
    // Инициализируем обработчики событий
    setupEventListeners();
    setupModalEventListeners();
    setupSearch();
    updateCartCount();
    checkAuthStatus();
    //addDebugButtons();
});

function addDebugButtons() {
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 10000;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px;
        border-radius: 5px;
        font-size: 12px;
    `;
    
    debugDiv.innerHTML = `
        <button onclick="initializeApp()">Перезагрузить данные</button>
        <button onclick="debugDataState()">Показать состояние</button>
        <button onclick="loadProductsFromServer().then(p => { products = p; renderProducts(p); })">Загрузить товары</button>
    `;
    
    document.body.appendChild(debugDiv);
}

// Улучшенная инициализация
async function initializeApp() {
    try {
        console.log('Начинаем загрузку данных с сервера...');
        
        // Загружаем данные последовательно
        products = await loadProductsFromServer();
        console.log('Товары загружены:', products.length);
        
        cart = await loadCartFromServer();
        console.log('Корзина загружена:', cart.length);
        
        wishlist = await loadWishlistFromServer();
        console.log('Избранное загружено:', wishlist.length);
        
        orders = await loadOrdersFromServer();
        console.log('Заказы загружены:', orders.length);
        
        userProfile = await loadUserProfileFromServer();
        console.log('Профиль загружен:', userProfile);
        
        brands = await loadBrandsFromServer();
        console.log('Бренды загружены:', brands.length);
        
        blogPosts = await loadBlogPostsFromServer();
        console.log('Посты блога загружены:', blogPosts.length);
        
        showMessage('Данные успешно загружены', 'success');
        
        // Инициализируем пагинацию
        renderProductsWithPagination(products);
        
        // Обновляем интерфейс
        updateUIAfterDataLoad();
        
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        useLocalData();
    }
}

function useLocalData() {
    console.log('Переходим в офлайн режим...');
    
    // Проверяем localStorage
    products = JSON.parse(localStorage.getItem('products')) || [];
    cart = JSON.parse(localStorage.getItem('cart')) || [];
    wishlist = JSON.parse(localStorage.getItem('wishlist')) || [];
    orders = JSON.parse(localStorage.getItem('orders')) || [];
    userProfile = JSON.parse(localStorage.getItem('userProfile')) || {
        name: 'Иван Иванов',
        email: 'ivan@example.com',
        phone: '+7 999 123-45-67',
        bonuses: 150
    };
    
    console.log('Локальные данные:', {
        products: products.length,
        cart: cart.length,
        wishlist: wishlist.length,
        orders: orders.length
    });
    
    updateCartCount();
    updateUIAfterDataLoad();
    showMessage('Приложение работает в офлайн режиме', 'info');
}

function updateUIAfterDataLoad() {
    console.log('Обновление UI...');
    
    // Всегда обновляем главную страницу
    loadHomePage();
    
    // Обновляем текущую страницу
    if (currentPage === 'catalog') {
        renderProducts(products);
    } else if (currentPage === 'cart') {
        renderCart();
    } else if (currentPage === 'account') {
        updateProfileDisplay();
        loadOrderHistory();
        loadWishlist();
        displayBonuses();
    }
}

function setupEventListeners() {
    // Навигация
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const pageId = this.getAttribute('href').substring(1);
            showPage(pageId);
            closeMobileMenu();
        });
    });

    // Гамбургер меню
    document.querySelector('.hamburger').addEventListener('click', toggleMobileMenu);

    // Поиск
    document.getElementById('search-input').addEventListener('input', debounce(function(e) {
        if (e.target.value.length > 2) {
            searchProducts(e.target.value);
        } else if (e.target.value.length === 0) {
            renderProducts(products);
        }
    }, 300));

    // Фильтры
    document.getElementById('price-range').addEventListener('input', function(e) {
        document.getElementById('max-price').value = e.target.value;
        applyFilters();
    });

    document.getElementById('min-price').addEventListener('change', function(e) {
        appliedFilters.priceRange[0] = parseInt(e.target.value) || 0;
        applyFilters();
    });

    document.getElementById('max-price').addEventListener('change', function(e) {
        appliedFilters.priceRange[1] = parseInt(e.target.value) || 10000;
        applyFilters();
    });

    document.querySelectorAll('input[data-filter="category"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateCategoryFilters);
    });

    document.querySelectorAll('input[data-filter="features"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateFeatureFilters);
    });

    document.querySelectorAll('input[data-filter="rating"]').forEach(radio => {
        radio.addEventListener('change', updateRatingFilter);
    });

    // Модальные окна
    document.getElementById('login-btn').addEventListener('click', showLoginModal);
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', closeModals);
    });

    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModals();
        }
    });

    // Обработчики для форм
    document.getElementById('login-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        performLogin();
    });

    document.getElementById('register-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        performRegister();
    });

    document.querySelector('.newsletter-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        subscribeNewsletter();
    });

    // Обработка форм
    document.addEventListener('submit', function(e) {
        e.preventDefault();
    });

    // Сохранение данных при изменении
    window.addEventListener('beforeunload', saveAppState);
}

// Добавляем обработчики для модальных окон регистрации
function setupModalEventListeners() {
    // Существующие обработчики...
    
    // Добавляем переключение между логином и регистрацией
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    
    if (showRegisterLink) {
        showRegisterLink.addEventListener('click', function(e) {
            e.preventDefault();
            closeModals();
            showRegisterModal();
        });
    }
    
    if (showLoginLink) {
        showLoginLink.addEventListener('click', function(e) {
            e.preventDefault();
            closeModals();
            showLoginModal();
        });
    }
}

// Функция для отображения хлебных крошек
function updateBreadcrumbs(pageId) {
    const breadcrumbs = document.getElementById('breadcrumbs');
    const pageNames = {
        'home': 'Главная',
        'catalog': 'Каталог',
        'product': 'Товар',
        'cart': 'Корзина',
        'checkout': 'Оформление заказа',
        'account': 'Личный кабинет',
        'blog': 'Блог'
    };
    
    let breadcrumbHTML = `<a href="#home" onclick="showPage('home')">Главная</a>`;
    
    if (pageId !== 'home') {
        breadcrumbHTML += ` > <span>${pageNames[pageId] || pageId}</span>`;
    }
    
    if (pageId === 'product' && currentProduct) {
        breadcrumbHTML += ` > <span>${currentProduct.name}</span>`;
    }
    
    breadcrumbs.innerHTML = breadcrumbHTML;
}

// Функция для закрытия модальных окон
function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// Реализация функции сортировки товаров
function sortProducts() {
    const sortBy = document.getElementById('sort-select').value;
    let sortedProducts = [...products];
    
    switch(sortBy) {
        case 'price-asc':
            sortedProducts.sort((a, b) => a.price - b.price);
            showMessage('Товары отсортированы по цене (по возрастанию)', 'success');
            break;
        case 'price-desc':
            sortedProducts.sort((a, b) => b.price - a.price);
            showMessage('Товары отсортированы по цене (по убыванию)', 'success');
            break;
        case 'newest':
            sortedProducts.sort((a, b) => {
                if (a.isNew && !b.isNew) return -1;
                if (!a.isNew && b.isNew) return 1;
                return 0;
            });
            showMessage('Товары отсортированы по новизне', 'success');
            break;
        case 'rating':
            sortedProducts.sort((a, b) => b.rating - a.rating);
            showMessage('Товары отсортированы по рейтингу', 'success');
            break;
        case 'popularity':
        default:
            sortedProducts.sort((a, b) => b.reviews - a.reviews);
            showMessage('Товары отсортированы по популярности', 'success');
    }
    
    renderProducts(sortedProducts);
}

function showDeliveryInfo() {
    showMessage("🚚 Доставка по всей России\n• Бесплатная доставка при заказе от 2000₽\n• Курьерская доставка: 2-3 дня, 300₽\n• Самовывоз: 1-2 дня, бесплатно\n• Все заказы упаковываются в экологичную упаковку", "info");
}

function showDiscountInfo() {
    showMessage("🎁 Скидка 20% на первую покупку!\nИспользуйте промокод: WELCOME20\nКак активировать:\n1. Добавьте товары в корзину\n2. Перейдите к оформлению заказа\n3. Введите промокод в поле 'Промокод'\n4. Нажмите 'Применить'", "success");
}


function showVeganPromo() {
    showPage('catalog');
    document.querySelector('input[value="vegan"]').checked = true;
    updateFeatureFilters();
    showMessage("Показаны все веганские товары со скидками!", "success");
}

function showCategory(category) {
    showPage('catalog');
    const checkbox = document.querySelector(`input[value="${category}"]`);
    if (checkbox) {
        checkbox.checked = true;
        updateCategoryFilters();
    }
    showMessage(`Показаны товары из категории: ${getCategoryName(category)}`, "success");
}

function getCategoryName(category) {
    const names = {
        'food': 'Еда',
        'cosmetics': 'Косметика',
        'home': 'Дом',
        'bottles': 'Многоразовые бутылки'
    };
    return names[category] || category;
}

// Улучшенная функция подписки на рассылку
async function subscribeNewsletter() {
    const emailInput = document.getElementById('newsletter-email');
    const email = emailInput.value.trim();
    
    if (!email) {
        showMessage('Пожалуйста, введите email адрес', 'error');
        emailInput.focus();
        return;
    }
    
    if (!validateEmail(email)) {
        showMessage('Пожалуйста, введите корректный email адрес', 'error');
        emailInput.focus();
        return;
    }
    
    // Показываем загрузку
    const subscribeBtn = document.querySelector('.newsletter-form button');
    const originalText = subscribeBtn.textContent;
    subscribeBtn.innerHTML = '<div class="loading"></div>';
    subscribeBtn.disabled = true;
    
    try {
        // Отправляем запрос на сервер
        const response = await fetch(`${API_BASE_URL}/newsletter/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ошибка сервера');
        }
        
        const data = await response.json();
        
        // Сохраняем локально
        const subscriptions = JSON.parse(localStorage.getItem('newsletterSubscriptions')) || [];
        if (!subscriptions.includes(email)) {
            subscriptions.push(email);
            localStorage.setItem('newsletterSubscriptions', JSON.stringify(subscriptions));
        }
        
        showMessage(`Спасибо за подписку! На ${email} будут приходить уведомления о скидках.`, "success");
        emailInput.value = '';
        
    } catch (error) {
        console.error('Ошибка подписки:', error);
        
        // Офлайн режим - сохраняем только локально
        const subscriptions = JSON.parse(localStorage.getItem('newsletterSubscriptions')) || [];
        if (!subscriptions.includes(email)) {
            subscriptions.push(email);
            localStorage.setItem('newsletterSubscriptions', JSON.stringify(subscriptions));
            showMessage(`Подписка сохранена локально (офлайн режим). На ${email} будут приходить уведомления.`, "info");
            emailInput.value = '';
        } else {
            showMessage('Этот email уже подписан на рассылку', 'info');
        }
    } finally {
        // Восстанавливаем кнопку
        subscribeBtn.textContent = originalText;
        subscribeBtn.disabled = false;
    }
}

// Функции продуктов
// Базовые функции (упрощенные версии)
function loadPopularProducts() {
    const container = document.getElementById('popular-products');
    const popularProducts = products.filter(p => p.rating >= 4.0).slice(0, 4);
    
    container.innerHTML = popularProducts.map(product => `
        <div class="product-card" onclick="showProductDetail(${product.id})">
            <div class="product-image">${product.image}</div>
            <h4>${product.name}</h4>
            <div class="product-price">${product.price}₽</div>
            <button class="add-to-cart" onclick="event.stopPropagation(); addToCart(${product.id})">В корзину</button>
        </div>
    `).join('');
}

function loadNewProducts() {
    const container = document.getElementById('new-products');
    const newProducts = products.filter(p => p.isNew).slice(0, 4);
    
    container.innerHTML = newProducts.map(product => `
        <div class="product-card" onclick="showProductDetail(${product.id})">
            <div class="product-image">${product.image}</div>
            <h4>${product.name}</h4>
            <div class="product-price">${product.price}₽</div>
            <button class="add-to-cart" onclick="event.stopPropagation(); addToCart(${product.id})">В корзину</button>
        </div>
    `).join('');
}

function displayBonuses() {
    const container = document.getElementById('bonuses-tab');
    container.innerHTML = `
        <div class="bonus-info">
            <h3>Бонусная программа</h3>
            <div class="bonus-balance">
                <span>Ваш баланс:</span>
                <strong id="bonus-balance">${userProfile.bonuses}</strong> баллов
            </div>
            <p>1 балл = 1 рубль при оплате заказов</p>
            <div class="bonus-rules" style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4>Как получить бонусы:</h4>
                <ul style="margin-top: 10px;">
                    <li>1% от суммы каждого заказа</li>
                    <li>+100 баллов за первую покупку</li>
                    <li>+50 баллов за отзыв о товаре</li>
                </ul>
            </div>
        </div>
    `;
}

function loadProfile() {
    updateProfileDisplay();
}

function loadHomePage() {
    showPage('home');
    loadPopularProducts();
    loadNewProducts();
}

// Улучшенная функция загрузки продуктов с обработкой ошибок
async function loadProductsFromServer() {
    try {
        console.log('Загрузка товаров с сервера...');
        const response = await fetch(`${API_BASE_URL}/products`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const serverProducts = await response.json();
        console.log('Получены товары с сервера:', serverProducts);
        
        // Сохраняем в localStorage для офлайн режима
        localStorage.setItem('products', JSON.stringify(serverProducts));
        
        return serverProducts;
        
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        throw error; // Пробрасываем ошибку дальше
    }
}

// Исправленная функция отображения товаров
function renderProducts(productsToRender) {
    const container = document.getElementById('products-grid');
    if (!container) return;
    
    // Обновляем счетчик товаров
    const productsCount = document.getElementById('products-count');
    if (productsCount) {
        productsCount.textContent = productsToRender.length;
    }
    
    if (productsToRender.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <h3>Товары не найдены</h3>
                <p>Попробуйте изменить параметры поиска или фильтры</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = productsToRender.map(createProductCard).join('');
}

// Функция для отображения товаров с пагинацией
function renderProductsWithPagination(productsToRender) {
    const container = document.getElementById('products-grid');
    if (!container) return;
    
    const startIndex = (currentPageCatalog - 1) * productsPerPage;
    const endIndex = startIndex + productsPerPage;
    const productsToShow = productsToRender.slice(0, endIndex);
    
    container.innerHTML = productsToShow.map(createProductCard).join('');
    
    // Показываем кнопку "Показать еще", если есть еще товары
    const loadMoreBtn = document.getElementById('load-more');
    if (loadMoreBtn) {
        if (endIndex >= productsToRender.length) {
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = 'block';
        }
    }
}

// Функция для загрузки дополнительных товаров
function loadMoreProducts() {
    currentPageCatalog++;
    const container = document.getElementById('products-grid');
    const startIndex = (currentPageCatalog - 1) * productsPerPage;
    const endIndex = startIndex + productsPerPage;
    const productsToShow = products.slice(0, endIndex);
    
    container.innerHTML = productsToShow.map(createProductCard).join('');
    
    const loadMoreBtn = document.getElementById('load-more');
    if (endIndex >= products.length) {
        loadMoreBtn.style.display = 'none';
    }
}

function createProductCard(product) {
    return `
        <div class="product-card" onclick="showProductDetail(${product.id})">
            ${product.originalPrice ? `<div class="discount-badge">-${Math.round((1 - product.price/product.originalPrice)*100)}%</div>` : ''}
            <div class="product-image">${product.image}</div>
            <h4>${product.name}</h4>
            <div class="product-brand">${product.brand}</div>
            <div class="product-rating">${'★'.repeat(Math.floor(product.rating))}${'☆'.repeat(5-Math.floor(product.rating))} (${product.reviews})</div>
            <div class="product-price">
                ${product.originalPrice ? `<span class="original-price">${product.originalPrice}₽</span> ` : ''}
                ${product.price}₽
            </div>
            <button class="add-to-cart" onclick="event.stopPropagation(); addToCart(${product.id})">В корзину</button>
            <button class="quick-view" onclick="event.stopPropagation(); showQuickView(${product.id})">Быстрый просмотр</button>
        </div>
    `;
}

// Улучшенная функция синхронизации корзины
async function syncCartWithServer() {
    try {
        const serverCart = await apiCall(`${API_BASE_URL}/cart`);
        
        // Синхронизируем корзину
        cart = serverCart;
        updateCartCount();
        if (currentPage === 'cart') renderCart();
        
    } catch (error) {
        console.log('Не удалось синхронизировать корзину');
    }
}

function searchProducts(query) {
    showLoading('products-grid');
    setTimeout(() => {
        const filtered = products.filter(product => 
            product.name.toLowerCase().includes(query.toLowerCase()) ||
            product.brand.toLowerCase().includes(query.toLowerCase()) ||
            product.description.toLowerCase().includes(query.toLowerCase())
        );
        renderProducts(filtered);
    }, 500);
}

function buyNow(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) {
        showMessage('Товар не найден', 'error');
        return;
    }
    
    // Очищаем корзину и добавляем только этот товар
    cart = [{
        ...product,
        quantity: 1,
        addedAt: new Date().toISOString()
    }];
    
    updateCartCount();
    saveCart();
    showMessage('Товар добавлен для быстрой покупки!', 'success');
    
    // Переходим к оформлению заказа
    showPage('checkout');
    renderCheckoutSummary();
}

// Исправленная функция поиска
function performSearch() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    
    if (!query) {
        renderProducts(products);
        return;
    }
    
    const filteredProducts = products.filter(product => {
        const searchFields = [
            product.name?.toLowerCase(),
            product.brand?.toLowerCase(),
            product.description?.toLowerCase(),
            product.category?.toLowerCase()
        ].filter(Boolean);
        
        return searchFields.some(field => field.includes(query));
    });
    
    renderProducts(filteredProducts);
    
    if (filteredProducts.length === 0) {
        showMessage(`По запросу "${query}" ничего не найдено`, 'info');
    }
}

// Улучшенная функция поиска с дебаунсом
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    
    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.trim().toLowerCase();
        
        clearTimeout(searchTimeout);
        
        if (query.length === 0) {
            renderProducts(products);
            return;
        }
        
        if (query.length < 2) {
            return;
        }
        
        searchTimeout = setTimeout(() => {
            performSearch();
        }, 300);
    });
    
    // Поиск при нажатии Enter
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// Функции фильтров
function initializeBrandFilters() {
    const container = document.getElementById('brand-filters');
    container.innerHTML = brands.map(brand => `
        <label><input type="checkbox" value="${brand}" data-filter="brand"> ${brand}</label>
    `).join('');
    
    document.querySelectorAll('input[data-filter="brand"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateBrandFilters);
    });
}

function updateCategoryFilters() {
    appliedFilters.category = Array.from(document.querySelectorAll('input[data-filter="category"]:checked'))
        .map(checkbox => checkbox.value);
    applyFilters();
}

function updateBrandFilters() {
    appliedFilters.brand = Array.from(document.querySelectorAll('input[data-filter="brand"]:checked'))
        .map(checkbox => checkbox.value);
    applyFilters();
}

function updateFeatureFilters() {
    appliedFilters.features = Array.from(document.querySelectorAll('input[data-filter="features"]:checked'))
        .map(checkbox => checkbox.value);
    applyFilters();
}

function updateRatingFilter() {
    const selectedRating = document.querySelector('input[data-filter="rating"]:checked');
    appliedFilters.rating = selectedRating ? parseInt(selectedRating.value) : null;
    applyFilters();
}

// Исправленная функция применения фильтров
function applyFilters() {
    let filteredProducts = products.filter(product => {
        // Фильтр по цене
        if (product.price < appliedFilters.priceRange[0] || product.price > appliedFilters.priceRange[1]) {
            return false;
        }
        
        // Фильтр по категории
        if (appliedFilters.category.length > 0 && !appliedFilters.category.includes(product.category)) {
            return false;
        }
        
        // Фильтр по бренду
        if (appliedFilters.brand.length > 0 && !appliedFilters.brand.includes(product.brand)) {
            return false;
        }
        
        // Фильтр по особенностям
        if (appliedFilters.features.length > 0) {
            const hasAllFeatures = appliedFilters.features.every(feature => 
                product.features?.includes(feature)
            );
            if (!hasAllFeatures) return false;
        }
        
        // Фильтр по рейтингу
        if (appliedFilters.rating && product.rating < appliedFilters.rating) {
            return false;
        }
        
        return true;
    });
    
    renderProducts(filteredProducts);
}

function clearFilters() {
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.checked = false;
    });
    
    document.getElementById('min-price').value = '';
    document.getElementById('max-price').value = '';
    document.getElementById('price-range').value = 10000;
    
    appliedFilters = {
        category: [],
        brand: [],
        features: [],
        rating: null,
        priceRange: [0, 10000]
    };
    
    renderProducts(products);
    showMessage("Фильтры сброшены", "success");
}

// Улучшенная функция добавления в корзину с обновлением интерфейса
async function addToCart(productId) {
    try {
        const product = products.find(p => p.id === productId);
        if (!product) {
            showMessage('Товар не найден', 'error');
            return;
        }

        // Обновляем локальное состояние
        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({
                ...product,
                quantity: 1
            });
        }

        updateCartCount();
        saveCart();
        animateAddToCart(productId);
        showMessage(`${product.name} добавлен в корзину!`, "success");

        // Обновляем интерфейс если находимся на странице корзины
        if (currentPage === 'cart') {
            renderCart();
        }
        
        // Обновляем отображение товара если находимся на странице товара
        if (currentPage === 'product' && currentProduct && currentProduct.id === productId) {
            updateProductPageUI();
        }
        
    } catch (error) {
        showMessage('Ошибка при добавлении в корзину', 'error');
    }
}

// Функция для анимации добавления в корзину
function animateAddToCart(productId) {
    const productCard = document.querySelector(`.product-card[onclick*="${productId}"]`);
    if (!productCard) return;
    
    const rect = productCard.getBoundingClientRect();
    const animation = document.createElement('div');
    animation.style.cssText = `
        position: fixed;
        width: 40px;
        height: 40px;
        background: #27ae60;
        border-radius: 50%;
        pointer-events: none;
        z-index: 10000;
        left: ${rect.left + rect.width/2}px;
        top: ${rect.top}px;
        transition: all 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
    `;
    animation.textContent = '+1';
    document.body.appendChild(animation);
    
    setTimeout(() => {
        const cartIcon = document.querySelector('.nav-links a[href="#cart"]');
        const cartRect = cartIcon.getBoundingClientRect();
        animation.style.left = `${cartRect.left + cartRect.width/2}px`;
        animation.style.top = `${cartRect.top + cartRect.height/2}px`;
        animation.style.transform = 'scale(0.1)';
        animation.style.opacity = '0.5';
    }, 50);
    
    setTimeout(() => {
        if (animation.parentNode) {
            document.body.removeChild(animation);
        }
    }, 800);
}

function calculateCartTotal() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = parseInt(document.getElementById('discount-amount').textContent) || 0;
    const total = subtotal - discount;
    
    document.getElementById('subtotal-price').textContent = subtotal;
    document.getElementById('total-price').textContent = total > 0 ? total : 0;
}


function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            updateCartCount();
            saveCart();
            renderCart();
        }
    }
}

function renderCart() {
    const container = document.getElementById('cart-items');
    
    if (cart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart" style="text-align: center; padding: 40px;">
                <h3>Корзина пуста</h3>
                <p>Добавьте товары из каталога</p>
                <button onclick="showPage('catalog')" class="cta-button">Перейти в каталог</button>
            </div>
        `;
        calculateCartTotal();
        return;
    }
    
    container.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-image">${item.image}</div>
            <div class="cart-item-details">
                <h4>${item.name}</h4>
                <div class="cart-item-price">${item.price}₽ × ${item.quantity}</div>
                <div class="cart-item-total">${item.price * item.quantity}₽</div>
            </div>
            <div class="quantity-controls">
                <button class="quantity-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                <span>${item.quantity}</span>
                <button class="quantity-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
            </div>
            <button class="remove-btn" onclick="removeFromCart(${item.id})" title="Удалить">🗑️</button>
        </div>
    `).join('');
    
    calculateCartTotal();
}

function applyPromoCode() {
    const promoCode = document.getElementById('promo-code').value.trim();
    
    if (!promoCode) {
        showMessage('Введите промокод', 'error');
        return;
    }
    
    // Показываем загрузку
    const applyBtn = document.querySelector('.promo-section button');
    const originalText = applyBtn.textContent;
    applyBtn.innerHTML = '<div class="loading"></div>';
    applyBtn.disabled = true;
    
    // Проверяем промокод на сервере
    fetch(`${API_BASE_URL}/promo/validate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ promo_code: promoCode })
    })
    .then(response => {
        if (!response.ok) throw new Error('Network error');
        return response.json();
    })
    .then(data => {
        if (data.valid) {
            applyDiscount(data.discount);
            showMessage(`Промокод "${promoCode}" применен! Скидка ${data.discount * 100}%`, "success");
        } else {
            showMessage('Промокод недействителен или истек', "error");
        }
    })
    .catch(error => {
        // Офлайн проверка
        const validPromos = {
            'WELCOME20': 0.2,
            'ECO10': 0.1,
            'NEWYEAR15': 0.15
        };
        
        if (validPromos[promoCode]) {
            applyDiscount(validPromos[promoCode]);
            showMessage(`Промокод "${promoCode}" применен! Скидка ${validPromos[promoCode] * 100}%`, "success");
        } else {
            showMessage('Промокод недействителен', "error");
        }
    })
    .finally(() => {
        applyBtn.textContent = originalText;
        applyBtn.disabled = false;
    });
}

function applyDiscount(discountRate) {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = Math.round(subtotal * discountRate);
    
    document.getElementById('discount-amount').textContent = discount;
    document.getElementById('total-price').textContent = subtotal - discount;
    
    // Обновляем также в оформлении заказа
    if (currentPage === 'checkout') {
        const deliveryCost = document.querySelector('input[name="delivery"]:checked').value === 'courier' ? 300 : 0;
        document.getElementById('checkout-total').textContent = subtotal - discount + deliveryCost;
    }
}

function proceedToCheckout() {
    if (cart.length === 0) {
        showMessage("Корзина пуста!", "error");
        return;
    }
    showPage('checkout');
    renderCheckoutSummary();
}

function renderCheckoutSummary() {
    const container = document.getElementById('checkout-items');
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    container.innerHTML = cart.map(item => `
        <div class="checkout-item" style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <span>${item.name} × ${item.quantity}</span>
            <span>${item.price * item.quantity}₽</span>
        </div>
    `).join('');
    
    document.getElementById('checkout-subtotal').textContent = subtotal;
    updateDeliveryCost();
}

// Функции для перехода по шагам оформления заказа
function nextStep(step) {
    // Валидация текущего шага
    if (step === 2 && !validateStep1()) return;
    if (step === 3 && !validateStep2()) return;
    if (step === 4 && !validateStep3()) return;
    
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step${step}`).classList.add('active');
    
    // Обновляем итоговую стоимость при переходе на шаг доставки
    if (step === 3) {
        updateDeliveryCost();
    }
}

function prevStep(step) {
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step${step}`).classList.add('active');
}

// Валидация форм
function validateStep1() {
    const name = document.getElementById('customer-name').value.trim();
    const email = document.getElementById('customer-email').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    
    if (!name) {
        showMessage('Пожалуйста, введите ваше имя', 'error');
        document.getElementById('customer-name').focus();
        return false;
    }
    
    if (!email) {
        showMessage('Пожалуйста, введите email', 'error');
        document.getElementById('customer-email').focus();
        return false;
    }
    
    if (!validateEmail(email)) {
        showMessage('Пожалуйста, введите корректный email', 'error');
        document.getElementById('customer-email').focus();
        return false;
    }
    
    if (!phone) {
        showMessage('Пожалуйста, введите телефон', 'error');
        document.getElementById('customer-phone').focus();
        return false;
    }
    
    return true;
}

function validateStep2() {
    const city = document.getElementById('delivery-city').value.trim();
    const street = document.getElementById('delivery-street').value.trim();
    const house = document.getElementById('delivery-house').value.trim();
    
    if (!city) {
        showMessage('Пожалуйста, введите город', 'error');
        document.getElementById('delivery-city').focus();
        return false;
    }
    
    if (!street) {
        showMessage('Пожалуйста, введите улицу', 'error');
        document.getElementById('delivery-street').focus();
        return false;
    }
    
    if (!house) {
        showMessage('Пожалуйста, введите номер дома', 'error');
        document.getElementById('delivery-house').focus();
        return false;
    }
    
    return true;
}

function validateStep3() {
    const delivery = document.querySelector('input[name="delivery"]:checked');
    const payment = document.querySelector('input[name="payment"]:checked');
    
    if (!delivery) {
        showMessage('Пожалуйста, выберите способ доставки', 'error');
        return false;
    }
    
    if (!payment) {
        showMessage('Пожалуйста, выберите способ оплаты', 'error');
        return false;
    }
    
    return true;
}

// Функция для расчета стоимости доставки
function updateDeliveryCost() {
    const deliveryType = document.querySelector('input[name="delivery"]:checked');
    const deliveryCost = deliveryType && deliveryType.value === 'courier' ? 300 : 0;
    
    document.getElementById('delivery-cost').textContent = deliveryCost;
    
    // Обновляем итоговую стоимость
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = parseInt(document.getElementById('discount-amount').textContent) || 0;
    const total = subtotal - discount + deliveryCost;
    
    document.getElementById('checkout-total').textContent = total > 0 ? total : 0;
}

// Функция для подтверждения заказа
function confirmOrder() {
    if (!document.getElementById('agree-terms').checked) {
        showMessage('Пожалуйста, согласитесь с правилами доставки и возврата', 'error');
        return;
    }
    
    // Валидация всех шагов
    if (!validateStep1() || !validateStep2() || !validateStep3()) {
        showMessage('Пожалуйста, заполните все данные корректно', 'error');
        return;
    }
    
    const deliveryType = document.querySelector('input[name="delivery"]:checked').value;
    const deliveryCost = deliveryType === 'courier' ? 300 : 0;
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = parseInt(document.getElementById('discount-amount').textContent) || 0;
    const total = subtotal + deliveryCost - discount;
    
    const orderData = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image
        })),
        customer: {
            name: document.getElementById('customer-name').value,
            email: document.getElementById('customer-email').value,
            phone: document.getElementById('customer-phone').value
        },
        delivery: {
            city: document.getElementById('delivery-city').value,
            street: document.getElementById('delivery-street').value,
            house: document.getElementById('delivery-house').value,
            apartment: document.getElementById('delivery-apartment').value,
            type: deliveryType,
            cost: deliveryCost
        },
        payment: document.querySelector('input[name="payment"]:checked').value,
        subtotal: subtotal,
        discount: discount,
        total: total,
        status: 'processing'
    };
    
    // Сохраняем заказ
    orders.unshift(orderData);
    localStorage.setItem('orders', JSON.stringify(orders));
    
    // Очищаем корзину
    cart = [];
    saveCart();
    updateCartCount();
    
    showMessage(`Заказ #${orderData.id} успешно оформлен! Спасибо за покупку.`, "success");
    
    // Переходим на главную через 2 секунды
    setTimeout(() => {
        showPage('home');
    }, 2000);
}


// Функция для показа модального окна регистрации
function showRegisterModal() {
    document.getElementById('register-modal').style.display = 'block';
}

// Функции личного кабинета
function openAccountTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.currentTarget.classList.add('active');
    
    // Обновляем данные при переключении вкладок
    if (tabName === 'orders') {
        loadOrderHistory();
    } else if (tabName === 'wishlist') {
        loadWishlist();
    }
}

// Обновленные функции для избранного
async function loadWishlistFromServer() {
    try {
        console.log('Загрузка избранного с сервера...');
        const response = await fetch(`${API_BASE_URL}/wishlist?user_id=1`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const wishlistItems = await response.json();
        console.log('Получено избранное с сервера:', wishlistItems);
        
        // Избранное хранится как массив ID товаров
        const wishlistIds = wishlistItems.map(item => item.product_id);
        localStorage.setItem('wishlist', JSON.stringify(wishlistIds));
        return wishlistIds;
        
    } catch (error) {
        console.error('Ошибка загрузки избранного:', error);
        throw error;
    }
}

async function addToWishlist(productId) {
    try {
        await apiCall('/wishlist', {
            method: 'POST',
            body: JSON.stringify({
                user_id: 1,
                product_id: productId
            })
        });

        if (!wishlist.includes(productId)) {
            wishlist.push(productId);
            saveWishlist();
        }

        showMessage('Товар добавлен в избранное! ❤️', 'success');
    } catch (error) {
        console.log('Офлайн режим, сохраняем локально');
        if (!wishlist.includes(productId)) {
            wishlist.push(productId);
            saveWishlist();
            showMessage('Товар добавлен в избранное! ❤️', 'success');
        }
    }
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartCount();
    saveCart();
    renderCart();
    showMessage('Товар удален из корзины', 'success');
}

async function removeFromWishlist(productId) {
    try {
        await apiCall(`/wishlist/${productId}?user_id=1`, {
            method: 'DELETE'
        });

        wishlist = wishlist.filter(id => id !== productId);
        saveWishlist();
        loadWishlist();
        showMessage('Товар удален из избранного', 'success');
    } catch (error) {
        console.log('Офлайн режим, удаляем локально');
        wishlist = wishlist.filter(id => id !== productId);
        saveWishlist();
        loadWishlist();
        showMessage('Товар удален из избранного', 'success');
    }
}

// Обновленные функции для заказов
async function loadOrdersFromServer() {
    try {
        console.log('Загрузка заказов с сервера...');
        const response = await fetch(`${API_BASE_URL}/orders?user_id=1`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const ordersData = await response.json();
        console.log('Получены заказы с сервера:', ordersData);
        
        localStorage.setItem('orders', JSON.stringify(ordersData));
        return ordersData;
        
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        throw error;
    }
}

async function createOrder(orderData) {
    try {
        const result = await apiCall('/orders', {
            method: 'POST',
            body: JSON.stringify({
                user_id: 1,
                ...orderData
            })
        });

        // Обновляем локальное состояние
        const newOrder = {
            id: result.order_id,
            created_at: new Date().toISOString(),
            items: cart,
            total: orderData.total_amount,
            status: 'processing',
            customer: orderData.customer,
            delivery: orderData.delivery_address,
            payment: orderData.payment_method
        };

        orders.unshift(newOrder);
        localStorage.setItem('orders', JSON.stringify(orders));

        // Очищаем корзину
        cart = [];
        updateCartCount();
        saveCart();

        showMessage(`Заказ #${result.order_id} успешно оформлен! Спасибо за покупку.`, "success");
        return result;
    } catch (error) {
        console.log('Офлайн режим, сохраняем локально');
        // Fallback to local storage
        const orderId = Date.now();
        const newOrder = {
            id: orderId,
            created_at: new Date().toISOString(),
            items: cart,
            total: orderData.total_amount,
            status: 'processing',
            customer: orderData.customer,
            delivery: orderData.delivery_address,
            payment: orderData.payment_method
        };

        orders.unshift(newOrder);
        localStorage.setItem('orders', JSON.stringify(orders));

        cart = [];
        updateCartCount();
        saveCart();

        showMessage(`Заказ #${orderId} успешно оформлен! Спасибо за покупку.`, "success");
        return { order_id: orderId };
    }
}

// Обновленные функции для пользователя
async function loadUserProfileFromServer() {
    try {
        console.log('Загрузка профиля с сервера...');
        const response = await fetch(`${API_BASE_URL}/users/profile?user_id=1`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const profile = await response.json();
        console.log('Получен профиль с сервера:', profile);
        
        localStorage.setItem('userProfile', JSON.stringify(profile));
        return profile;
        
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
        throw error;
    }
}

async function updateUserProfile(profileData) {
    try {
        await apiCall('/users/profile', {
            method: 'POST',
            body: JSON.stringify({
                user_id: 1,
                ...profileData
            })
        });

        userProfile = { ...userProfile, ...profileData };
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
        showMessage('Профиль успешно обновлен!', 'success');
    } catch (error) {
        console.log('Офлайн режим, сохраняем локально');
        userProfile = { ...userProfile, ...profileData };
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
        showMessage('Профиль успешно обновлен!', 'success');
    }
}

// Функции для работы с промокодами
async function validatePromoCode(code) {
    try {
        const result = await apiCall('/promo/validate', {
            method: 'POST',
            body: JSON.stringify({ promo_code: code })
        });
        return result;
    } catch (error) {
        console.log('Ошибка валидации промокода:', error);
        // Fallback validation
        const validPromos = {
            'WELCOME20': 0.2,
            'ECO10': 0.1,
            'NEWYEAR15': 0.15
        };
        
        if (validPromos[code]) {
            return { valid: true, discount: validPromos[code] };
        } else {
            return { valid: false, error: 'Неверный промокод' };
        }
    }
}

// Функции для работы с рассылкой
async function subscribeToNewsletter(email) {
    try {
        await apiCall('/newsletter/subscribe', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        return { success: true };
    } catch (error) {
        console.log('Ошибка подписки на рассылку:', error);
        // Fallback to local storage
        const subscribers = JSON.parse(localStorage.getItem('newsletter_subscribers')) || [];
        if (!subscribers.includes(email)) {
            subscribers.push(email);
            localStorage.setItem('newsletter_subscribers', JSON.stringify(subscribers));
        }
        return { success: true };
    }
}

// Обновленная функция загрузки личного кабинета
function loadAccountPage() {
    if (!checkAuthentication()) return;
    
    updateProfileDisplay();
    loadOrderHistory();
    loadWishlist();
    displayBonuses();
    updateAuthUI();
}



// Улучшенная функция отображения заказов
function loadOrderHistory() {
    const container = document.getElementById('order-history');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>У вас пока нет заказов</h3>
                <p>Совершите первую покупку!</p>
                <button onclick="showPage('catalog')" class="cta-button">Перейти в каталог</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="order-item">
            <div class="order-header">
                <strong>Заказ #${order.id}</strong>
                <span>${new Date(order.created_at).toLocaleDateString('ru-RU')}</span>
            </div>
            <div class="order-status status-${order.status}">
                📦 ${getOrderStatusText(order.status)}
            </div>
            <div class="order-total">
                Сумма: ${order.total_amount || order.total}₽
            </div>
            <div class="order-items">
                ${order.items ? order.items.map(item => 
                    `${item.name} × ${item.quantity}`).join(', ') : 'Товары не указаны'}
            </div>
        </div>
    `).join('');
}

function renderOrderHistory(ordersArray, container) {
    if (ordersArray.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <h3>У вас пока нет заказов</h3>
                <p>Совершите первую покупку!</p>
                <button onclick="showPage('catalog')" class="cta-button">Перейти в каталог</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = ordersArray.map(order => {
        const orderDate = new Date(order.date || order.created_at);
        const totalPrice = typeof order.total === 'number' ? order.total : 
                          order.items ? order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0;
        
        return `
            <div class="order-item" style="background: white; padding: 20px; border-radius: 10px; margin-bottom: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div class="order-header" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <strong>Заказ #${order.id}</strong>
                    <span>${orderDate.toLocaleDateString('ru-RU')}</span>
                </div>
                <div class="order-status" style="color: ${getOrderStatusColor(order.status)}; margin-bottom: 5px;">
                    📦 Статус: ${getOrderStatusText(order.status)}
                </div>
                <div class="order-total" style="font-weight: bold; margin-bottom: 10px;">
                    Сумма: ${totalPrice}₽
                </div>
                <div class="order-items" style="margin-top: 10px; font-size: 0.9em; color: #666;">
                    ${order.items ? order.items.map(item => 
                        `${item.name} × ${item.quantity} - ${item.price * item.quantity}₽`
                    ).join(', ') : 'Информация о товарах недоступна'}
                </div>
            </div>
        `;
    }).join('');
}

function getOrderStatusColor(status) {
    const colors = {
        'processing': '#3498db',
        'shipped': '#f39c12', 
        'delivered': '#27ae60',
        'cancelled': '#e74c3c'
    };
    return colors[status] || '#666';
}

function getOrderStatusText(status) {
    const statuses = {
        'processing': '🔄 В обработке',
        'shipped': '🚚 Отправлен',
        'delivered': '✅ Доставлен'
    };
    return statuses[status] || status;
}

function renderWishlist(container) {
    const wishlistProducts = products.filter(p => wishlist.includes(p.id));
    
    if (wishlistProducts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666;">
                <h3>Список желаний пуст</h3>
                <p>Добавляйте товары в избранное нажатием на ❤️</p>
                <button onclick="showPage('catalog')" class="cta-button">Перейти в каталог</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="products-grid">
            ${wishlistProducts.map(product => `
                <div class="product-card">
                    ${product.originalPrice ? `<div class="discount-badge">-${Math.round((1 - product.price/product.originalPrice)*100)}%</div>` : ''}
                    <div class="product-image">${product.image}</div>
                    <h4>${product.name}</h4>
                    <div class="product-brand">${product.brand}</div>
                    <div class="product-price">
                        ${product.originalPrice ? `<span class="original-price">${product.originalPrice}₽</span> ` : ''}
                        ${product.price}₽
                    </div>
                    <button class="add-to-cart" onclick="addToCart(${product.id})">В корзину</button>
                    <button class="remove-wishlist" onclick="removeFromWishlist(${product.id})" 
                            style="background: #e74c3c; color: white; border: none; padding: 8px 15px; border-radius: 20px; cursor: pointer; margin-top: 10px; width: 100%;">
                        ❤️ Удалить из избранного
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

// Сохранение избранного
function saveWishlist() {
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
}

async function updateProfile() {
    if (!checkAuthentication()) return;
    
    const name = document.getElementById('profile-name').value.trim();
    const email = document.getElementById('profile-email').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    
    if (!name || !email) {
        showMessage('Пожалуйста, заполните обязательные поля', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showMessage('Пожалуйста, введите корректный email', 'error');
        return;
    }
    
    try {
        const userId = localStorage.getItem('userId') || 1;
        const response = await fetch(`${API_BASE_URL}/users/profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                name,
                email,
                phone,
                bonuses: userProfile.bonuses || 0
            })
        });
        
        if (response.ok) {
            // Обновляем локальные данные
            userProfile = { ...userProfile, name, email, phone };
            localStorage.setItem('userProfile', JSON.stringify(userProfile));
            localStorage.setItem('userName', name);
            localStorage.setItem('userEmail', email);
            
            showMessage('Профиль успешно обновлен!', 'success');
            updateAuthUI();
        } else {
            throw new Error('Ошибка обновления профиля');
        }
        
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        // Офлайн режим
        userProfile = { ...userProfile, name, email, phone };
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
        localStorage.setItem('userName', name);
        localStorage.setItem('userEmail', email);
        
        showMessage('Профиль сохранен локально', 'info');
        updateAuthUI();
    }
}

// Функция для обновления UI страницы товара
function updateProductPageUI() {
    if (currentProduct && document.getElementById('product-detail')) {
        const inCart = cart.find(item => item.id === currentProduct.id);
        const addButton = document.querySelector('.add-to-cart');
        if (addButton && inCart) {
            addButton.textContent = `В корзине (${inCart.quantity})`;
            addButton.style.background = '#27ae60';
        }
    }
}

// Функции для работы с API
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`API Call failed: ${endpoint}`, error);
    throw error; // Пробрасываем ошибку дальше
  }
}

// Улучшенное отображение профиля
function updateProfileDisplay() {
    const userName = localStorage.getItem('userName') || 'Пользователь';
    const userEmail = localStorage.getItem('userEmail') || '';
    
    document.getElementById('profile-name').value = userProfile.name || userName;
    document.getElementById('profile-email').value = userProfile.email || userEmail;
    document.getElementById('profile-phone').value = userProfile.phone || '';
    
    // Обновляем приветствие
    const accountHeader = document.querySelector('#account h1');
    if (accountHeader) {
        accountHeader.textContent = `Личный кабинет - ${userName}`;
    }
}

async function loadBrandsFromServer() {
    try {
        console.log('Загрузка брендов с сервера...');
        const response = await fetch(`${API_BASE_URL}/products/brands`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const brandsData = await response.json();
        console.log('Получены бренды с сервера:', brandsData);
        
        return brandsData;
        
    } catch (error) {
        console.error('Ошибка загрузки брендов:', error);
        return ["EcoBeauty", "EcoBottle", "HealthFood", "EcoHome", "PureSkin", "EcoBag"];
    }
}

function loadBlogPage() {
    showPage('blog');
    renderBlogPosts();
}

async function loadBlogPostsFromServer() {
    try {
        console.log('Загрузка постов блога с сервера...');
        const response = await fetch(`${API_BASE_URL}/blog/posts`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const posts = await response.json();
        console.log('Получены посты блога с сервера:', posts);
        
        return posts;
        
    } catch (error) {
        console.error('Ошибка загрузки постов блога:', error);
        return [];
    }
}

async function loadCartFromServer() {
    try {
        console.log('Загрузка корзины с сервера...');
        const response = await fetch(`${API_BASE_URL}/cart?user_id=1`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const cartItems = await response.json();
        console.log('Получена корзина с сервера:', cartItems);
        
        // Преобразуем формат данных
        const formattedCart = cartItems.map(item => ({
            id: item.product_id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            brand: item.brand
        }));
        
        localStorage.setItem('cart', JSON.stringify(formattedCart));
        return formattedCart;
        
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
        throw error;
    }
}

// Функции для блога
function loadBlogPosts() {
    const container = document.getElementById('blog-posts');
    container.innerHTML = blogPosts.map(post => `
        <div class="blog-post" style="background: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); cursor: pointer;" onclick="readBlogPost(${post.id})">
            <div style="display: flex; gap: 20px; align-items: flex-start;">
                <div class="blog-post-image" style="font-size: 3rem; flex-shrink: 0;">${post.image}</div>
                <div class="blog-post-content" style="flex: 1;">
                    <h3 style="margin-bottom: 10px; color: #2c3e50;">${post.title}</h3>
                    <p style="margin-bottom: 15px; color: #666; line-height: 1.6;">${post.excerpt}</p>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="blog-post-date" style="color: #999; font-size: 0.9em;">
                            ${new Date(post.date).toLocaleDateString()} • ${post.readTime} • ${post.author}
                        </div>
                        <button onclick="event.stopPropagation(); readBlogPost(${post.id})" style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; transition: all 0.3s ease;">
                            Читать далее
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}
// Функция чтения полной статьи
function readBlogPost(postId) {
    const post = blogPosts.find(p => p.id === postId);
    if (!post) {
        showMessage('Статья не найдена', 'error');
        return;
    }
    
    const container = document.getElementById('blog-posts');
    container.innerHTML = `
        <div class="blog-post-full">
            <button class="back-button" onclick="renderBlogPosts()">← Назад к статьям</button>
            <article class="blog-article">
                <header class="blog-header">
                    <div class="blog-image-large">${post.image || '📝'}</div>
                    <h1>${post.title}</h1>
                    <div class="blog-meta-large">
                        <span>${new Date(post.date).toLocaleDateString('ru-RU')}</span>
                        <span>•</span>
                        <span>${post.author || 'Автор'}</span>
                        <span>•</span>
                        <span>${post.readTime || '5 мин'}</span>
                    </div>
                </header>
                <div class="blog-content">
                    ${post.content ? post.content.split('\n').map(paragraph => 
                        `<p>${paragraph}</p>`
                    ).join('') : '<p>Содержание статьи скоро будет добавлено.</p>'}
                </div>
                <footer class="blog-footer">
                    <div class="blog-actions">
                        <button onclick="shareBlogPost(${post.id})">📤 Поделиться</button>
                        <button onclick="showMessage('Спасибо за оценку!', 'success')">⭐ Оценить</button>
                    </div>
                </footer>
            </article>
        </div>
    `;
}

// Функция для шаринга статьи
function shareBlogPost(postId) {
    const post = blogPosts.find(p => p.id === postId);
    if (navigator.share) {
        navigator.share({
            title: post.title,
            text: post.excerpt,
            url: window.location.href + '#blog'
        });
    } else {
        showMessage('Ссылка на статью скопирована в буфер обмена', 'success');
    }
}

// Вспомогательные функции
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    currentPage = pageId;
    
    updateBreadcrumbs(pageId);
    
    // Инициализация страницы
    if (pageId === 'cart') {
        renderCart();
    } else if (pageId === 'account') {
        updateProfileDisplay();
        loadOrderHistory();
        loadWishlist();
        displayBonuses();
    } else if (pageId === 'checkout') {
        renderCheckoutSummary();
    }
}

function updateBreadcrumbs(pageId) {
    const breadcrumbs = document.getElementById('breadcrumbs');
    const pageNames = {
        'home': 'Главная',
        'catalog': 'Каталог',
        'product': 'Товар',
        'cart': 'Корзина',
        'checkout': 'Оформление заказа',
        'account': 'Личный кабинет',
        'blog': 'Блог'
    };
    
    breadcrumbs.innerHTML = `<a href="#home" onclick="showPage('home')">Главная</a>`;
    if (pageId !== 'home') {
        breadcrumbs.innerHTML += ` > <span>${pageNames[pageId]}</span>`;
    }
}

function updateCartCount() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = totalItems;
}

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function saveAppState() {
    localStorage.setItem('cart', JSON.stringify(cart));
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    localStorage.setItem('orders', JSON.stringify(orders));
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
}

// Остальные базовые функции
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Функция debounce для поиска
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showMission() {
    showMessage("Наша миссия: сделать экологичные товары доступными для каждого. Мы заботимся о планете и предлагаем только sustainable продукты.", "info");
}

function showMessage(message, type = 'success') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db'};
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 4000);
}

// Функция для отображения загрузки
function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px;">
            <div class="loading" style="width: 40px; height: 40px; margin: 0 auto 20px;"></div>
            <p>Загрузка...</p>
        </div>
    `;
}

function showLoginModal() {
    document.getElementById('login-modal').style.display = 'block';
}

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    const hamburger = document.querySelector('.hamburger');
    navLinks.classList.toggle('active');
    hamburger.classList.toggle('active');
}

function closeMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    const hamburger = document.querySelector('.hamburger');
    navLinks.classList.remove('active');
    hamburger.classList.remove('active');
}

// Функция для быстрого просмотра товара
function showQuickView(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const modal = document.getElementById('quick-view-modal');
    const content = document.getElementById('quick-view-content');
    
    content.innerHTML = `
        <div class="quick-view-content">
            <div class="product-image-large" style="font-size: 4rem; text-align: center; margin-bottom: 20px;">${product.image}</div>
            <h2 style="margin-bottom: 15px; color: #2c3e50;">${product.name}</h2>
            <div class="product-brand" style="color: #666; margin-bottom: 10px;">${product.brand}</div>
            <div class="product-rating" style="color: #f39c12; margin-bottom: 15px;">
                ${'★'.repeat(Math.floor(product.rating))}${'☆'.repeat(5-Math.floor(product.rating))} (${product.reviews} отзывов)
            </div>
            <p style="margin-bottom: 20px; line-height: 1.6;">${product.description}</p>
            <div class="product-price" style="font-size: 1.5rem; font-weight: bold; color: #e74c3c; margin-bottom: 25px;">
                ${product.originalPrice ? `<span class="original-price" style="text-decoration: line-through; color: #95a5a6; font-size: 1.2rem; margin-right: 10px;">${product.originalPrice}₽</span>` : ''}
                ${product.price}₽
            </div>
            <div class="quick-view-actions" style="display: flex; gap: 10px;">
                <button class="add-to-cart" onclick="addToCart(${product.id}); closeModals();" 
                        style="flex: 1; background: #27ae60; color: white; border: none; padding: 12px; border-radius: 25px; cursor: pointer; font-size: 1.1rem;">
                    В корзину
                </button>
                <button class="buy-now" onclick="buyNow(${product.id}); closeModals();" 
                        style="flex: 1; background: #e74c3c; color: white; border: none; padding: 12px; border-radius: 25px; cursor: pointer; font-size: 1.1rem;">
                    Купить сейчас
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Улучшенная функция регистрации
async function performRegister() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const name = document.getElementById('register-name').value.trim();
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    if (!email || !password || !name || !confirmPassword) {
        showMessage('Пожалуйста, заполните все поля', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showMessage('Пожалуйста, введите корректный email', 'error');
        return;
    }
    
    if (password.length < 6) {
        showMessage('Пароль должен содержать минимум 6 символов', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showMessage('Пароли не совпадают', 'error');
        return;
    }
    
    try {
        // Показываем загрузку
        const submitBtn = document.querySelector('#register-form button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<div class="loading"></div>';
        submitBtn.disabled = true;
        
        // Отправка на сервер
        const response = await fetch(`${API_BASE_URL}/users/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('userLoggedIn', 'true');
            localStorage.setItem('userEmail', email);
            localStorage.setItem('userName', name);
            localStorage.setItem('userId', data.user_id || 1);
            
            showMessage(`Регистрация успешна! Добро пожаловать, ${name}!`, 'success');
            closeModals();
            updateAuthUI();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ошибка регистрации');
        }
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        // Офлайн режим
        localStorage.setItem('userLoggedIn', 'true');
        localStorage.setItem('userEmail', email);
        localStorage.setItem('userName', name);
        localStorage.setItem('userId', Date.now());
        
        showMessage(`Регистрация успешна! Добро пожаловать, ${name}!`, 'success');
        closeModals();
        updateAuthUI();
    }
}

// Улучшенная функция входа
async function performLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showMessage('Пожалуйста, заполните все поля', 'error');
        return;
    }
    
    try {
        // Показываем загрузку
        const submitBtn = document.querySelector('#login-form button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.innerHTML = '<div class="loading"></div>';
        submitBtn.disabled = true;
        
        // Отправка на сервер
        const response = await fetch(`${API_BASE_URL}/users/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('userLoggedIn', 'true');
            localStorage.setItem('userEmail', email);
            localStorage.setItem('userName', data.name || email.split('@')[0]);
            localStorage.setItem('userId', data.user_id || 1);
            
            showMessage(`Добро пожаловать!`, 'success');
            closeModals();
            updateAuthUI();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Неверный email или пароль');
        }
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        // Офлайн режим - базовая проверка
        if (password.length >= 6) {
            localStorage.setItem('userLoggedIn', 'true');
            localStorage.setItem('userEmail', email);
            localStorage.setItem('userName', email.split('@')[0]);
            localStorage.setItem('userId', Date.now());
            
            showMessage(`Добро пожаловать!`, 'success');
            closeModals();
            updateAuthUI();
        } else {
            showMessage('Неверный email или пароль', 'error');
        }
    }
}

async function loadUserData() {
    try {
        const userId = localStorage.getItem('userId') || 1;
        const response = await fetch(`${API_BASE_URL}/users/profile?user_id=${userId}`);
        
        if (response.ok) {
            const userData = await response.json();
            localStorage.setItem('userProfile', JSON.stringify(userData));
            userProfile = userData;
        }
    } catch (error) {
        console.log('Офлайн режим, используем локальные данные');
        // Используем данные из localStorage
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
            userProfile = JSON.parse(savedProfile);
        }
    }
}

// Обновленная функция проверки статуса аутентификации
function checkAuthStatus() {
    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
    if (isLoggedIn) {
        updateAuthUI();
    }
}

// Проверка аутентификации
function checkAuthentication() {
    const isLoggedIn = localStorage.getItem('userLoggedIn') === 'true';
    if (!isLoggedIn) {
        showMessage('Пожалуйста, войдите в систему', 'error');
        showLoginModal();
        return false;
    }
    return true;
}

function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    if (!loginBtn) return;
    
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
        loginBtn.textContent = userEmail;
        loginBtn.title = 'Выйти';
        loginBtn.onclick = function() {
            localStorage.removeItem('userLoggedIn');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userName');
            localStorage.removeItem('userData');
            loginBtn.textContent = 'Войти';
            loginBtn.title = '';
            loginBtn.onclick = showLoginModal;
            showMessage('Вы вышли из системы', 'success');
        };
    }
}

function showProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    currentProduct = product;
    showPage('product');
    
    const container = document.getElementById('product-detail');
    container.innerHTML = `
        <div class="product-detail-content">
            <div class="product-gallery">
                <div class="main-image">${product.image}</div>
            </div>
            <div class="product-info">
                <h1>${product.name}</h1>
                <div class="product-brand">${product.brand}</div>
                <div class="product-rating">${'★'.repeat(Math.floor(product.rating))}${'☆'.repeat(5-Math.floor(product.rating))} (${product.reviews} отзывов)</div>
                <div class="product-price">
                    ${product.originalPrice ? `<span class="original-price">${product.originalPrice}₽</span> ` : ''}
                    <span class="current-price">${product.price}₽</span>
                </div>
                <p class="product-description">${product.description}</p>
                <div class="product-actions">
                    <button class="add-to-cart" onclick="addToCart(${product.id})">В корзину</button>
                    <button class="buy-now" onclick="buyNow(${product.id})">Купить сейчас</button>
                    <button class="add-to-wishlist" onclick="addToWishlist(${product.id})">❤️</button>
                </div>
            </div>
        </div>
        ${renderRelatedProducts(productId)}
    `;
}

function getRelatedProducts(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return [];
    
    // Ищем товары из той же категории или с похожими характеристиками
    return products
        .filter(p => p.id !== productId && (
            p.category === product.category || 
            p.features.some(f => product.features.includes(f))
        ))
        .slice(0, 4);
}

// Функция отображения постов блога
function renderBlogPosts() {
    const container = document.getElementById('blog-posts');
    if (!container) return;
    
    if (blogPosts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px; color: #666;">
                <h3>Статьи скоро будут добавлены</h3>
                <p>Мы работаем над созданием интересного контента для вас</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = blogPosts.map(post => `
        <div class="blog-post" onclick="readBlogPost(${post.id})">
            <div class="blog-post-header">
                <div class="blog-post-image">${post.image || '📝'}</div>
                <div class="blog-post-info">
                    <h3>${post.title}</h3>
                    <p class="blog-excerpt">${post.excerpt || post.content?.substring(0, 150) + '...'}</p>
                    <div class="blog-meta">
                        <span class="blog-date">${new Date(post.date).toLocaleDateString('ru-RU')}</span>
                        <span class="blog-author">${post.author || 'Автор'}</span>
                        <span class="blog-read-time">${post.readTime || '5 мин'}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}


function renderRelatedProducts(productId) {
    const relatedProducts = getRelatedProducts(productId);
    if (relatedProducts.length === 0) return '';
    
    return `
        <div class="related-products">
            <h3 style="font-size: 1.5rem; margin-bottom: 20px; color: #2c3e50;">С этим товаром покупают</h3>
            <div class="carousel-container">
                ${relatedProducts.map(product => `
                    <div class="product-card" onclick="showProductDetail(${product.id})">
                        <div class="product-image">${product.image}</div>
                        <h4>${product.name}</h4>
                        <div class="product-price">
                            ${product.originalPrice ? `<span class="original-price">${product.originalPrice}₽</span> ` : ''}
                            ${product.price}₽
                        </div>
                        <button class="add-to-cart" onclick="event.stopPropagation(); addToCart(${product.id})">В корзину</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function openProductTab(tabName, event) {
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Убираем активный класс со всех табов
    document.querySelectorAll('.product-tabs .tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.borderBottom = '3px solid transparent';
        tab.style.color = '#666';
        tab.style.fontWeight = 'normal';
    });
    
    // Показываем выбранную вкладку
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }
    
    // Активируем выбранный таб
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
        event.currentTarget.style.borderBottom = '3px solid #3498db';
        event.currentTarget.style.color = '#3498db';
        event.currentTarget.style.fontWeight = 'bold';
    }
}

// Инициализация вкладок при загрузке страницы товара
function initializeProductTabs() {
    // По умолчанию показываем вкладку с описанием
    const descriptionTab = document.getElementById('description-tab');
    if (descriptionTab) {
        descriptionTab.style.display = 'block';
    }
}

// Функция для инициализации слайдера на главной
function initHeroSlider() {
    const slides = document.querySelectorAll('.slide');
    const totalSlides = slides.length;
    let currentSlide = 0;
    
    if (totalSlides <= 1) return;
    
    // Функция для переключения слайдов
    function showSlide(index) {
        slides.forEach((slide, i) => {
            slide.classList.remove('active');
            if (i === index) {
                slide.classList.add('active');
            }
        });
    }
    
    // Автоматическое переключение слайдов
    const slideInterval = setInterval(() => {
        currentSlide = (currentSlide + 1) % totalSlides;
        showSlide(currentSlide);
    }, 5000);
    
    // Добавляем индикаторы слайдов
    const slider = document.querySelector('.hero-slider');
    const indicatorsContainer = document.createElement('div');
    indicatorsContainer.className = 'slider-indicators';
    indicatorsContainer.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
    `;
    
    for (let i = 0; i < totalSlides; i++) {
        const indicator = document.createElement('button');
        indicator.className = `slider-indicator ${i === 0 ? 'active' : ''}`;
        indicator.style.cssText = `
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 2px solid white;
            background: ${i === 0 ? 'white' : 'transparent'};
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        indicator.addEventListener('click', () => {
            currentSlide = i;
            showSlide(currentSlide);
            updateIndicators();
            clearInterval(slideInterval);
        });
        indicatorsContainer.appendChild(indicator);
    }
    
    slider.style.position = 'relative';
    slider.appendChild(indicatorsContainer);
    
    function updateIndicators() {
        const indicators = document.querySelectorAll('.slider-indicator');
        indicators.forEach((indicator, i) => {
            indicator.style.background = i === currentSlide ? 'white' : 'transparent';
        });
    }
}
// Запуск слайдера после загрузки
setTimeout(initHeroSlider, 1000);