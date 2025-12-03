// ============================================
// JavaScript для EcoStore
// ============================================

// ============================================
// PRODUCT DATA
// ============================================

const products = [
    {
        id: 1,
        name: 'Органические яблоки',
        price: 180,
        category: 'food',
        description: 'Свежие органические яблоки от местных фермеров',
        image: '🍎',
        isBestseller: true,
        inStock: true,
    },
    {
        id: 2,
        name: 'Эко-мыло ручной работы',
        price: 320,
        category: 'cosmetics',
        description: 'Натуральное мыло без химии с ароматом лаванды',
        image: '🧼',
        isBestseller: true,
        inStock: true,
    },
    {
        id: 3,
        name: 'Бамбуковая щетка для посуды',
        price: 150,
        category: 'home',
        description: 'Экологичная щетка из натурального бамбука',
        image: '🪮',
        isBestseller: false,
        inStock: true,
    },
    {
        id: 4,
        name: 'Стеклянная бутылка 750ml',
        price: 450,
        category: 'bottles',
        description: 'Многоразовая бутылка из закаленного стекла',
        image: '🍾',
        isBestseller: true,
        inStock: true,
    },
    {
        id: 5,
        name: 'Органические помидоры',
        price: 220,
        category: 'food',
        description: 'Спелые помидоры без пестицидов',
        image: '🍅',
        isBestseller: false,
        inStock: false,
    },
    {
        id: 6,
        name: 'Крем для лица натуральный',
        price: 590,
        category: 'cosmetics',
        description: 'Питательный крем с маслом жожоба и витамином E',
        image: '💅',
        isBestseller: true,
        inStock: true,
    },
    {
        id: 7,
        name: 'Экомешочки для покупок',
        price: 280,
        category: 'home',
        description: 'Набор из 3 реусабельных мешочков разных размеров',
        image: '👜',
        isBestseller: false,
        inStock: true,
    },
    {
        id: 8,
        name: 'Термос из нержавейки 500ml',
        price: 680,
        category: 'bottles',
        description: 'Вакуумный термос сохраняет температуру до 12 часов',
        image: '🫖',
        isBestseller: true,
        inStock: true,
    },
    {
        id: 9,
        name: 'Органический чай зеленый',
        price: 380,
        category: 'food',
        description: 'Чай из горных плантаций без ароматизаторов',
        image: '🍵',
        isBestseller: false,
        inStock: true,
    },
    {
        id: 10,
        name: 'Шампунь твёрдый',
        price: 420,
        category: 'cosmetics',
        description: 'Компактный твёрдый шампунь равен 3 обычным флаконам',
        image: '🧴',
        isBestseller: true,
        inStock: true,
    },
    {
        id: 11,
        name: 'Бамбуковая зубная щетка',
        price: 120,
        category: 'home',
        description: 'Щетка из органического бамбука, 100% биоразлагаемая',
        image: '🪥',
        isBestseller: false,
        inStock: true,
    },
    {
        id: 12,
        name: 'Портативная бутылка для воды',
        price: 380,
        category: 'bottles',
        description: 'Компактная бутылка с фильтром для путешествий',
        image: '💧',
        isBestseller: false,
        inStock: true,
    },
];

// ============================================
// CART & STORAGE
// ============================================

let cart = loadCart();

function saveCart() {
    localStorage.setItem('ecostore_cart', JSON.stringify(cart));
    updateCartCount();
}

function loadCart() {
    const saved = localStorage.getItem('ecostore_cart');
    return saved ? JSON.parse(saved) : [];
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || !product.inStock) return;

    const cartItem = cart.find(item => item.id === productId);
    if (cartItem) {
        cartItem.quantity += 1;
    } else {
        cart.push({
            id: productId,
            name: product.name,
            price: product.price,
            quantity: 1,
            image: product.image,
        });
    }
    saveCart();
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
}

function updateCartItem(productId, quantity) {
    const item = cart.find(item => item.id === productId);
    if (item && quantity > 0) {
        item.quantity = quantity;
        saveCart();
    }
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cartCount').textContent = count;
}

// ============================================
// RENDER FUNCTIONS
// ============================================

function renderProducts(filter = '') {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';

    const filteredProducts = filter
        ? products.filter(p => p.category === filter)
        : products;

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-card__image">
                ${product.image}
                ${product.isBestseller ? '<span class="product-card__badge">Хит</span>' : ''}
            </div>
            <div class="product-card__body">
                <h3 class="product-card__name">${product.name}</h3>
                <p class="product-card__description">${product.description}</p>
                <div class="product-card__price">${product.price} ₽</div>
                <div class="product-card__actions">
                    ${product.inStock
                        ? `<button class="product-card__btn product-card__btn--add" onclick="addToCart(${product.id})">Добавить в корзину</button>`
                        : `<button class="product-card__btn product-card__btn--unavailable" disabled>Нет в наличии</button>`
                    }
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderCart() {
    const cartBody = document.getElementById('cartBody');
    const emptyCart = document.getElementById('emptyCart');
    const cartContainer = document.getElementById('cartContainer');
    const totalPrice = document.getElementById('totalPrice');

    if (cart.length === 0) {
        cartContainer.style.display = 'none';
        emptyCart.style.display = 'block';
    } else {
        cartContainer.style.display = 'block';
        emptyCart.style.display = 'none';

        cartBody.innerHTML = '';
        let total = 0;

        cart.forEach(item => {
            const sum = item.price * item.quantity;
            total += sum;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.image} ${item.name}</td>
                <td>${item.price} ₽</td>
                <td>
                    <div class="cart-qty">
                        <button class="cart-qty__btn" onclick="updateCartItem(${item.id}, ${item.quantity - 1})">−</button>
                        <span class="cart-qty__value">${item.quantity}</span>
                        <button class="cart-qty__btn" onclick="updateCartItem(${item.id}, ${item.quantity + 1})">+</button>
                    </div>
                </td>
                <td>${sum} ₽</td>
                <td>
                    <button class="cart-remove" onclick="removeFromCart(${item.id})">🗑️</button>
                </td>
            `;
            cartBody.appendChild(row);
        });

        totalPrice.textContent = total;
    }
}

// ============================================
// NAVIGATION & SECTIONS
// ============================================

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Show selected section
    const section = document.getElementById(`section-${sectionName}`);
    if (section) {
        section.classList.add('active');

        // Render content based on section
        if (sectionName === 'catalog') {
            renderProducts();
        } else if (sectionName === 'cart') {
            renderCart();
        }
    }

    // Update navigation
    document.querySelectorAll('.nav__link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

    // Scroll to top
    window.scrollTo(0, 0);
}

// ============================================
// NAVIGATION LISTENERS
// ============================================

document.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.getAttribute('data-section');
        showSection(section);
    });
});

// Category cards click
document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
        const category = card.getAttribute('data-category');
        showSection('catalog');
        document.getElementById('categoryFilter').value = category;
        renderProducts(category);
    });
});

// Filter by category
document.getElementById('categoryFilter').addEventListener('change', (e) => {
    renderProducts(e.target.value);
});

// Checkout button
document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (cart.length > 0) {
        alert('Спасибо за покупку! 🎉\n\nТотальная сумма: ' + 
              cart.reduce((sum, item) => sum + item.price * item.quantity, 0) + ' ₽\n\n' +
              'Заказ принят в обработку.');
        cart = [];
        saveCart();
        renderCart();
    }
});

// ============================================
// HELP BUTTON & CHAT WIDGET
// ============================================

const helpBtn = document.getElementById('helpBtn');
const chatWidget = document.getElementById('chatWidget');
const closeWidget = document.getElementById('closeWidget');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');

helpBtn.addEventListener('click', () => {
    chatWidget.classList.toggle('hidden');
});

closeWidget.addEventListener('click', () => {
    chatWidget.classList.add('hidden');
});

// Tab switching
document.querySelectorAll('.chat-widget__tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');

        // Remove active from all tabs
        document.querySelectorAll('.chat-widget__tab').forEach(t => {
            t.classList.remove('active');
        });
        document.querySelectorAll('.chat-widget__content').forEach(content => {
            content.classList.remove('active');
        });

        // Add active to clicked tab
        tab.classList.add('active');
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.querySelector(`.${tabName}-tab`).classList.add('active');
    });
});

// Send chat message
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessageToChat(message, 'user');
    chatInput.value = '';

    // Send to server
    try {
        const response = await fetch('http://localhost:5000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        addMessageToChat(data.message || 'Не получен ответ', 'bot');
    } catch (error) {
        console.error('Chat error:', error);
        addMessageToChat(data.message || 'Не получен ответ', 'bot');
    }
}

function addMessageToChat(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message--${sender}`;
    messageDiv.innerHTML = `<p>${escapeHtml(text)}</p>`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    renderProducts();
    showSection('home');
});

// Close chat widget when pressing Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        chatWidget.classList.add('hidden');
    }
});