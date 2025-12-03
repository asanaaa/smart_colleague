// widget-loader.js - Универсальный загрузчик для React и обычных сайтов
class AIAssistantLoader {
  constructor() {
    this.isReactApp = this.detectReact();
    this.loadWidget();
  }

  detectReact() {
    // Проверяем, используется ли React на странице
    return typeof React !== 'undefined' && 
           typeof ReactDOM !== 'undefined';
  }

  loadWidget() {
    if (this.isReactApp) {
      this.loadReactWidget();
    } else {
      this.loadVanillaWidget();
    }
  }

  loadReactWidget() {
    // Динамически импортируем и рендерим React-компонент
    import('./AIAssistantWidget.jsx').then(module => {
      const AIAssistantWidget = module.default;
      const widgetContainer = document.createElement('div');
      widgetContainer.className = 'ai-assistant-root';
      document.body.appendChild(widgetContainer);
      
      ReactDOM.render(React.createElement(AIAssistantWidget), widgetContainer);
    });
  }

  loadVanillaWidget() {
    // Резервная реализация на чистом JS для не-React сайтов
    const button = document.createElement('button');
    button.innerHTML = '🎯 Помощь';
    Object.assign(button.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '10000',
      padding: '12px 16px',
      backgroundColor: 'var(--brand-color, #007bff)',
      color: 'white',
      border: 'none',
      borderRadius: '25px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    });
    
    document.body.appendChild(button);
    
    // Добавляем базовую функциональность
    button.addEventListener('click', () => {
      alert('Ассистент помощи - React-версия не загружена');
    });
  }
}

// Автоматическая инициализация при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new AIAssistantLoader();
  });
} else {
  new AIAssistantLoader();
}