// ai-assistant-widget.js
class AIAssistantWidget {
    constructor(config = {}) {
        this.config = {
            apiUrl: config.apiUrl || 'http://localhost:5000',
            position: config.position || 'bottom-right',
            brandColor: config.brandColor || '#007bff',
            ...config
        };

        this.state = {
            isVisible: false,
            availableTasks: [],
            currentSteps: [],
            isListening: false,
            currentInstructionId: null,
            popularInstructions: [],
            searchQuery: '',
            searchResults: [],
            // Новые состояния для чата
            chatMessages: [],
            currentChatMessage: '',
            activeTab: 'tasks' // 'tasks' или 'chat'
        };
        this.init();
    }

     async init() {
        this.createWidget();
        await this.initializeWidget();
        await this.loadPopularInstructions();
        this.attachEventListeners();
        
        // Добавляем приветственное сообщение в чат
        this.addChatMessage('assistant', 'Привет! Я ваш AI-ассистент. Чем могу помочь?');
    }

    createWidget() {
        // Создаем контейнер виджета
        this.widgetContainer = document.createElement('div');
        this.widgetContainer.className = 'ai-assistant-widget';
        Object.assign(this.widgetContainer.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '10000',
            fontFamily: 'Arial, sans-serif'
        });

        // Создаем кнопку помощи
        this.helpButton = document.createElement('button');
        this.helpButton.innerHTML = '🎯 Помощь';
        Object.assign(this.helpButton.style, {
            padding: '12px 16px',
            backgroundColor: this.config.brandColor,
            color: 'white',
            border: 'none',
            borderRadius: '25px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: '10001'
        });

        // Создаем панель помощи
        this.helpPanel = document.createElement('div');
        Object.assign(this.helpPanel.style, {
            position: 'absolute',
            bottom: '60px',
            right: '0',
            width: '400px', // Увеличили ширину для чата
            height: '500px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: '10002',
            display: 'none',
            flexDirection: 'column'
        });

        this.helpPanel.innerHTML = `
            <div class="ai-header" style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; background-color: #f8f9fa;">
                <div style="display: flex; gap: 10px;">
                    <button class="ai-tab-button active" data-tab="tasks" style="padding: 5px 10px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Задачи</button>
                    <button class="ai-tab-button" data-tab="chat" style="padding: 5px 10px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Чат</button>
                </div>
                <button class="ai-close-btn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">×</button>
            </div>
            
            <div class="ai-tab-content" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                <!-- Вкладка задач -->
                <div class="ai-tab-pane active" data-tab="tasks" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                    <div class="ai-content" style="flex: 1; padding: 15px; overflow-y: auto;">
                        <div class="ai-search-section" style="margin-bottom: 15px;">
                            <input type="text" class="ai-search-input" placeholder="Поиск инструкций..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                        </div>
                        <div class="ai-search-results" style="display: none;"></div>
                        <button class="ai-voice-btn" style="width: 100%; padding: 10px; background-color: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 15px;">
                            🎤 Голосовой ввод
                        </button>
                        <div class="ai-popular-section" style="display: none;"></div>
                        <div class="ai-tasks-section" style="display: none;"></div>
                        <div class="ai-instructions-section" style="display: none;"></div>
                        <div class="ai-no-tasks" style="display: none; text-align: center; color: #6c757d; font-style: italic; padding: 20px;">
                            Нет доступных задач для текущей страницы
                        </div>
                    </div>
                </div>
                
                <!-- Вкладка чата -->
                <div class="ai-tab-pane" data-tab="chat" style="flex: 1; display: none; flex-direction: column;">
                    <div class="ai-chat-messages" style="flex: 1; padding: 15px; overflow-y: auto; border-bottom: 1px solid #eee;"></div>
                    <div class="ai-chat-input" style="padding: 15px; border-top: 1px solid #eee;">
                        <div style="display: flex; gap: 10px;">
                            <input type="text" class="ai-chat-message-input" placeholder="Введите ваш вопрос..." style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <button class="ai-send-message" style="padding: 8px 15px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Отправить</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Добавляем элементы в DOM
        this.widgetContainer.appendChild(this.helpButton);
        this.widgetContainer.appendChild(this.helpPanel);
        document.body.appendChild(this.widgetContainer);

        // Кэшируем элементы для быстрого доступа
        this.elements = {
            closeBtn: this.helpPanel.querySelector('.ai-close-btn'),
            searchInput: this.helpPanel.querySelector('.ai-search-input'),
            searchResults: this.helpPanel.querySelector('.ai-search-results'),
            voiceBtn: this.helpPanel.querySelector('.ai-voice-btn'),
            popularSection: this.helpPanel.querySelector('.ai-popular-section'),
            tasksSection: this.helpPanel.querySelector('.ai-tasks-section'),
            instructionsSection: this.helpPanel.querySelector('.ai-instructions-section'),
            noTasks: this.helpPanel.querySelector('.ai-no-tasks'),
            content: this.helpPanel.querySelector('.ai-content'),
            // Новые элементы чата
            tabButtons: this.helpPanel.querySelectorAll('.ai-tab-button'),
            tabPanes: this.helpPanel.querySelectorAll('.ai-tab-pane'),
            chatMessages: this.helpPanel.querySelector('.ai-chat-messages'),
            chatInput: this.helpPanel.querySelector('.ai-chat-message-input'),
            sendButton: this.helpPanel.querySelector('.ai-send-message')
        };
    }

    attachEventListeners() {
        // Кнопка помощи
        this.helpButton.addEventListener('click', () => this.toggleHelp());

        // Кнопка закрытия
        this.elements.closeBtn.addEventListener('click', () => this.hideHelp());

        // Поиск
        this.elements.searchInput.addEventListener('input', (e) => {
            this.state.searchQuery = e.target.value;
            this.searchInstructions(e.target.value);
        });

        // Голосовой ввод
        this.elements.voiceBtn.addEventListener('click', () => this.startVoiceInput());

        // Кнопки вкладок
        this.elements.tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Чат
        this.elements.sendButton.addEventListener('click', () => this.sendChatMessage());
        this.elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
    }

    attachEventListeners() {
        // Кнопка помощи
        this.helpButton.addEventListener('click', () => this.toggleHelp());

        // Кнопка закрытия
        this.elements.closeBtn.addEventListener('click', () => this.hideHelp());

        // Поиск
        this.elements.searchInput.addEventListener('input', (e) => {
            this.state.searchQuery = e.target.value;
            this.searchInstructions(e.target.value);
        });

        // Голосовой ввод
        this.elements.voiceBtn.addEventListener('click', () => this.startVoiceInput());

        // Кнопки вкладок
        this.elements.tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Чат
        this.elements.sendButton.addEventListener('click', () => this.sendChatMessage());
        this.elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
    }

    switchTab(tabName) {
        // Обновляем активные кнопки вкладок
        this.elements.tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
                btn.style.backgroundColor = this.config.brandColor;
                btn.style.color = 'white';
            } else {
                btn.classList.remove('active');
                btn.style.backgroundColor = 'white';
                btn.style.color = 'black';
            }
        });

        // Обновляем активные панели
        this.elements.tabPanes.forEach(pane => {
            if (pane.dataset.tab === tabName) {
                pane.style.display = 'flex';
            } else {
                pane.style.display = 'none';
            }
        });

        this.state.activeTab = tabName;
    }

    addChatMessage(role, content, instructionData = null) {
        const message = {
            id: Date.now(),
            role, // 'user' или 'assistant'
            content,
            timestamp: new Date().toLocaleTimeString(),
            instructionData
        };

        this.state.chatMessages.push(message);
        this.renderChatMessages();

        // Автоматическая прокрутка вниз
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    renderChatMessages() {
        const messagesHTML = this.state.chatMessages.map(msg => {
            if (msg.role === 'user') {
                return `
                    <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
                        <div style="background: #007bff; color: white; padding: 10px; border-radius: 10px; max-width: 80%;">
                            <div>${msg.content}</div>
                            <small style="font-size: 10px; opacity: 0.8;">${msg.timestamp}</small>
                        </div>
                    </div>
                `;
            } else {
                if (msg.instructionData) {
                    // Сообщение с инструкцией
                    return `
                        <div style="display: flex; justify-content: flex-start; margin-bottom: 10px;">
                            <div style="background: #f8f9fa; padding: 10px; border-radius: 10px; max-width: 80%; border: 1px solid #e9ecef;">
                                <div><strong>${msg.content}</strong></div>
                                <div style="margin-top: 10px;">
                                    ${msg.instructionData.steps.map((step, i) => 
                                        `<div style="margin: 5px 0; padding: 5px; background: white; border-radius: 4px; border-left: 3px solid #007bff;">
                                            <strong>Шаг ${i + 1}:</strong> ${step}
                                        </div>`
                                    ).join('')}
                                </div>
                                <div style="margin-top: 10px; display: flex; gap: 5px;">
                                    <button onclick="window.aiAssistant.exportInstruction('pdf', '${msg.instructionData.instruction_id}')" style="padding: 4px 8px; font-size: 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">📄 PDF</button>
                                    <button onclick="window.aiAssistant.exportInstruction('json', '${msg.instructionData.instruction_id}')" style="padding: 4px 8px; font-size: 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">⚙️ JSON</button>
                                    <button onclick="window.aiAssistant.exportInstruction('txt', '${msg.instructionData.instruction_id}')" style="padding: 4px 8px; font-size: 12px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">📝 TXT</button>
                                </div>
                                <small style="font-size: 10px; opacity: 0.8;">${msg.timestamp}</small>
                            </div>
                        </div>
                    `;
                } else {
                    // Обычное текстовое сообщение
                    return `
                        <div style="display: flex; justify-content: flex-start; margin-bottom: 10px;">
                            <div style="background: #f8f9fa; padding: 10px; border-radius: 10px; max-width: 80%;">
                                <div>${msg.content}</div>
                                <small style="font-size: 10px; opacity: 0.8;">${msg.timestamp}</small>
                            </div>
                        </div>
                    `;
                }
            }
        }).join('');

        this.elements.chatMessages.innerHTML = messagesHTML;
    }

    async sendChatMessage() {
        const message = this.elements.chatInput.value.trim();
        if (!message) return;

        // Добавляем сообщение пользователя
        this.addChatMessage('user', message);
        this.elements.chatInput.value = '';

        // Показываем индикатор загрузки
        const loadingId = Date.now();
        this.addChatMessage('assistant', 'Думаю...');

        try {
            const response = await fetch(`${this.config.apiUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    context: this.getPageContext()
                })
            });

            const data = await response.json();

            // Удаляем индикатор загрузки
            this.state.chatMessages = this.state.chatMessages.filter(msg => msg.content !== 'Думаю...');

            if (data.type === 'instruction') {
                // Ответ с инструкцией
                this.addChatMessage('assistant', data.message, data.instruction_data);
            } else {
                // Обычный текстовый ответ
                this.addChatMessage('assistant', data.message);
            }

        } catch (error) {
            console.error('Chat error:', error);
            this.state.chatMessages = this.state.chatMessages.filter(msg => msg.content !== 'Думаю...');
            this.addChatMessage('assistant', 'Извините, произошла ошибка. Попробуйте еще раз.');
        }
    }

     async processVoiceQuery(text) {
        try {
            const context = this.getPageContext();
            const response = await fetch(`${this.config.apiUrl}/api/process-voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, context })
            });
            const data = await response.json();
            
            // Переключаемся на вкладку чата и показываем результат
            this.switchTab('chat');
            this.addChatMessage('user', text);
            
            if (data.source === 'existing') {
                this.addChatMessage('assistant', data.text, {
                    steps: data.steps,
                    instruction_id: data.instruction_id
                });
            } else {
                this.addChatMessage('assistant', data.text, {
                    steps: data.steps,
                    instruction_id: data.instruction_id
                });
            }
            
        } catch (error) {
            console.error('Ошибка обработки голоса:', error);
            this.addChatMessage('assistant', 'Извините, произошла ошибка при обработке голосового запроса.');
        }
    }

    async initializeWidget() {
        try {
            const context = this.getPageContext();
            const tasks = await this.fetchHelp(context);
            this.state.availableTasks = tasks.available_tasks?.tasks || [];
            this.renderAvailableTasks();
        } catch (error) {
            console.error('Ошибка инициализации ассистента:', error);
        }
    }

    async loadPopularInstructions() {
        try {
            const response = await fetch(`${this.config.apiUrl}/api/popular-instructions`);
            const data = await response.json();
            this.state.popularInstructions = data.popular_instructions || [];
            this.renderPopularInstructions();
        } catch (error) {
            console.error('Ошибка загрузки популярных инструкций:', error);
        }
    }

    getPageContext() {
        return {
            url: window.location.href,
            dom_snapshot: document.documentElement.outerHTML,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
    }

    async fetchHelp(context) {
        const response = await fetch(`${this.config.apiUrl}/api/get-help`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(context)
        });
        return await response.json();
    }

    async showInstruction(taskId, taskName) {
        try {
            const context = this.getPageContext();
            const response = await fetch(`${this.config.apiUrl}/api/get-instruction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    task_id: taskId, 
                    context,
                    task_name: taskName 
                })
            });
            const data = await response.json();
            this.state.currentSteps = data.steps || [];
            this.state.currentInstructionId = data.instruction_id;
            this.renderInstructions();
        } catch (error) {
            console.error('Ошибка получения инструкции:', error);
        }
    }

    startVoiceInput() {
        this.state.isListening = true;
        this.renderVoiceButton();
        
        // В реальной реализации здесь будет Web Speech API
        const text = prompt("Введите ваш голосовой запрос:");
        if (text) {
            this.processVoiceQuery(text);
        }
        
        this.state.isListening = false;
        this.renderVoiceButton();
    }

    async processVoiceQuery(text) {
        try {
            const context = this.getPageContext();
            const response = await fetch(`${this.config.apiUrl}/api/process-voice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, context })
            });
            const data = await response.json();
            this.state.currentSteps = data.steps || [];
            this.state.currentInstructionId = data.instruction_id;
            this.renderInstructions();
        } catch (error) {
            console.error('Ошибка обработки голоса:', error);
        }
    }

    async searchInstructions(query) {
        if (!query.trim()) {
            this.state.searchResults = [];
            this.renderSearchResults();
            return;
        }

        try {
            const response = await fetch(`${this.config.apiUrl}/api/search-instructions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await response.json();
            this.state.searchResults = data.results || [];
            this.renderSearchResults();
        } catch (error) {
            console.error('Ошибка поиска:', error);
        }
    }

    loadInstruction(instruction) {
        this.state.currentSteps = instruction.steps || [];
        this.state.currentInstructionId = instruction.id;
        this.state.searchResults = [];
        this.state.searchQuery = '';
        this.elements.searchInput.value = '';
        this.renderInstructions();
    }

    async exportInstruction(format) {
        if (!this.state.currentInstructionId) return;
        
        try {
            const response = await fetch(
                `${this.config.apiUrl}/api/export/${format}/${this.state.currentInstructionId}`
            );
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `instruction_${this.state.currentInstructionId}.${format}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Ошибка экспорта:', error);
        }
    }

    // Методы рендеринга
    renderAvailableTasks() {
        if (this.state.availableTasks.length === 0) {
            this.elements.tasksSection.style.display = 'none';
            this.elements.noTasks.style.display = 'block';
            return;
        }

        this.elements.noTasks.style.display = 'none';
        this.elements.tasksSection.style.display = 'block';
        
        const tasksHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 14px;">Доступные задачи:</h4>
            ${this.state.availableTasks.map(task => `
                <div class="ai-task-item" 
                     style="padding: 8px 12px; margin: 5px 0; background-color: #e9ecef; border-radius: 4px; cursor: pointer; border: 1px solid #dee2e6; transition: background-color 0.2s;"
                     onclick="window.aiAssistant.showInstruction('${task.id}', '${task.name}')">
                    <div style="font-weight: bold;">${task.name}</div>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">${task.description}</div>
                </div>
            `).join('')}
        `;
        
        this.elements.tasksSection.innerHTML = tasksHTML;
    }

    renderPopularInstructions() {
        if (this.state.popularInstructions.length === 0) return;

        const popularHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 14px;">Популярные инструкции:</h4>
            ${this.state.popularInstructions.map(instruction => `
                <div class="ai-popular-item" 
                     style="padding: 8px; margin: 5px 0; background-color: #e7f3ff; border-radius: 4px; cursor: pointer; border: 1px solid #b3d7ff; display: flex; justify-content: space-between; align-items: center;"
                     onclick="window.aiAssistant.loadInstruction(${JSON.stringify(instruction).replace(/"/g, '&quot;')})">
                    <span>${instruction.task_id}</span>
                    <small style="font-size: 11px; color: #6c757d;">Использовано: ${instruction.usage_count} раз</small>
                </div>
            `).join('')}
        `;
        
        this.elements.popularSection.innerHTML = popularHTML;
        this.elements.popularSection.style.display = 'block';
    }

    renderInstructions() {
        if (this.state.currentSteps.length === 0) return;

        const instructionsHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0; font-size: 14px;">Инструкция:</h4>
                <div style="display: flex; gap: 5px;">
                    <button onclick="window.aiAssistant.exportInstruction('pdf')" 
                            style="padding: 4px 8px; font-size: 12px; background-color: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        📄 PDF
                    </button>
                    <button onclick="window.aiAssistant.exportInstruction('json')" 
                            style="padding: 4px 8px; font-size: 12px; background-color: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        ⚙️ JSON
                    </button>
                    <button onclick="window.aiAssistant.exportInstruction('txt')" 
                            style="padding: 4px 8px; font-size: 12px; background-color: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        📝 TXT
                    </button>
                </div>
            </div>
            ${this.state.currentSteps.map((step, index) => `
                <div class="ai-step" 
                     style="padding: 8px; margin: 5px 0; background-color: #d1ecf1; border-radius: 4px; border-left: 3px solid #0c5460;">
                    <strong>Шаг ${index + 1}:</strong> ${step}
                </div>
            `).join('')}
        `;
        
        this.elements.instructionsSection.innerHTML = instructionsHTML;
        this.elements.instructionsSection.style.display = 'block';
        
        // Скрываем другие секции
        this.elements.tasksSection.style.display = 'none';
        this.elements.popularSection.style.display = 'none';
        this.elements.searchResults.style.display = 'none';
    }

    renderSearchResults() {
        if (this.state.searchResults.length === 0) {
            this.elements.searchResults.style.display = 'none';
            return;
        }

        const searchHTML = `
            <h4 style="margin: 0 0 10px 0; font-size: 14px;">Результаты поиска:</h4>
            ${this.state.searchResults.map(instruction => `
                <div class="ai-search-result" 
                     style="padding: 8px; margin: 5px 0; background-color: #f8f9fa; border-radius: 4px; cursor: pointer; border: 1px solid #dee2e6;"
                     onclick="window.aiAssistant.loadInstruction(${JSON.stringify(instruction).replace(/"/g, '&quot;')})">
                    <strong>${instruction.task_id}</strong>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">
                        ${instruction.steps?.slice(0, 2).join(' ')}...
                    </div>
                </div>
            `).join('')}
        `;
        
        this.elements.searchResults.innerHTML = searchHTML;
        this.elements.searchResults.style.display = 'block';
        
        // Скрываем другие секции при активном поиске
        if (this.state.searchQuery.trim()) {
            this.elements.tasksSection.style.display = 'none';
            this.elements.popularSection.style.display = 'none';
            this.elements.instructionsSection.style.display = 'none';
        }
    }

    renderVoiceButton() {
        if (this.state.isListening) {
            this.elements.voiceBtn.innerHTML = '🎤 Слушаю...';
            this.elements.voiceBtn.style.backgroundColor = '#dc3545';
        } else {
            this.elements.voiceBtn.innerHTML = '🎤 Голосовой ввод';
            this.elements.voiceBtn.style.backgroundColor = '#28a745';
        }
    }

    toggleHelp() {
        if (this.state.isVisible) {
            this.hideHelp();
        } else {
            this.showHelp();
        }
    }

    showHelp() {
        this.helpPanel.style.display = 'block';
        this.state.isVisible = true;
        
        // Показываем соответствующие секции
        if (this.state.currentSteps.length > 0) {
            this.elements.instructionsSection.style.display = 'block';
        } else if (this.state.searchQuery.trim()) {
            this.renderSearchResults();
        } else {
            this.elements.tasksSection.style.display = 'block';
            this.elements.popularSection.style.display = 'block';
        }
    }

    hideHelp() {
        this.helpPanel.style.display = 'none';
        this.state.isVisible = false;
    }

    // Публичные методы для внешнего доступа
    showTaskInstruction(taskId) {
        const task = this.state.availableTasks.find(t => t.id === taskId);
        if (task) {
            this.showInstruction(task.id, task.name);
            this.showHelp();
        }
    }

    destroy() {
        if (this.widgetContainer && this.widgetContainer.parentNode) {
            this.widgetContainer.parentNode.removeChild(this.widgetContainer);
        }
    }
}

// Автоматическая инициализация
function initAIAssistant(config = {}) {
    if (window.aiAssistant) {
        console.warn('AI Assistant уже инициализирован');
        return window.aiAssistant;
    }

    window.aiAssistant = new AIAssistantWidget(config);
    return window.aiAssistant;
}

// Инициализация при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAIAssistant();
    });
} else {
    initAIAssistant();
}
// Экспорт для использования в качестве модуля
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AIAssistantWidget, initAIAssistant };
}