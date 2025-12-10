from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import json
import logging
import requests
from pathlib import Path

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ==================== Enums & Constants ====================

class ActionType(str, Enum):
    """Типы действий"""
    NAVIGATE = "navigate"
    CLICK = "click"
    SEARCH = "search"
    FILTER = "filter"
    INPUT = "input"
    SUBMIT = "submit"


# ==================== Data Models ====================

@dataclass
class Action:
    """Модель действия"""
    type: str
    target: Optional[str] = None
    element_text: Optional[str] = None
    query_example: Optional[str] = None
    parameters: Optional[List[str]] = None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Action':
        """Создаёт Action из словаря"""
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class TaskNode:
    """Модель узла задачи"""
    task_id: str
    task_name: str
    description: str
    actions: List[Action]
    children: List['TaskNode']
    aliases: Optional[List[str]] = None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TaskNode':
        """Рекурсивно создаёт TaskNode из словаря"""
        actions = [Action.from_dict(a) for a in data.get("actions", [])]
        children = [cls.from_dict(child) for child in data.get("children", [])]
        
        return cls(
            task_id=data.get("task_id", ""),
            task_name=data.get("task_name", ""),
            description=data.get("description", ""),
            actions=actions,
            children=children,
            aliases=data.get("aliases", [])
        )


@dataclass
class InstructionResult:
    """Результат генерации инструкции"""
    task_id: str
    task_name: str
    full_path: str
    depth: int
    instruction: str
    is_leaf: bool
    parent_task_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Преобразует в словарь"""
        return asdict(self)


@dataclass
class ProcessingResult:
    """Результат обработки дерева"""
    status: str  # "success" или "error"
    total_tasks: int
    leaf_tasks: int
    instructions_generated: int
    instructions: List[InstructionResult]
    error_message: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Преобразует в словарь"""
        return {
            "status": self.status,
            "total_tasks": self.total_tasks,
            "leaf_tasks": self.leaf_tasks,
            "instructions_generated": self.instructions_generated,
            "instructions": [instr.to_dict() for instr in self.instructions],
            "error_message": self.error_message
        }


# ==================== API Client ====================

class LLMClient:
    """Клиент для взаимодействия с LLM API"""
    
    def __init__(
        self,
        api_key: str,
        model: str = "tngtech/deepseek-r1t2-chimera:free",
        base_url: str = "https://openrouter.ai/api/v1/chat/completions",
        timeout: int = 120
    ):
        self.api_key: str = api_key
        self.base_url: str = base_url
        self.model: str = model
        self.timeout: int = timeout
    
    def generate_instruction(self, prompt: str) -> str:
        """Генерирует инструкцию через API"""
        
        messages: List[Dict[str, str]] = [
            {"role": "user", "content": prompt}
        ]
        
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
        }
        
        headers: Dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        try:
            logger.info(f"Sending request to {self.base_url} (model: {self.model})")
            
            response: requests.Response = requests.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            
            data = response.json()
            instruction_text = data["choices"][0]["message"]["content"].strip()
            
            logger.info("✅ Instruction generated successfully")
            return instruction_text
        
        except requests.exceptions.Timeout:
            logger.error("❌ API request timed out")
            raise RuntimeError("API request timed out")
        
        except requests.exceptions.HTTPError as e:
            logger.error(f"❌ HTTP Error: {e.response.status_code} - {e.response.text}")
            raise RuntimeError(f"HTTP Error: {e.response.status_code}")
        
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ API request failed: {e}")
            raise RuntimeError(f"API request failed: {str(e)}")


# ==================== Task Tree Processor ====================

class TaskTreeProcessor:
    """Обработчик дерева задач"""
    
    def __init__(self, llm_client: LLMClient):
        self.llm_client: LLMClient = llm_client
        self.total_tasks: int = 0
        self.leaf_tasks: int = 0
    
    
    def load_tree_from_dict(self, tree_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Валидирует дерево задач из словаря"""
        if "root_task" not in tree_dict:
            raise ValueError("Tree must contain 'root_task' key")
        
        if "task_tree_version" not in tree_dict:
            logger.warning("⚠️ 'task_tree_version' not found, assuming 1.0")
            tree_dict["task_tree_version"] = "1.0"
        
        logger.info("✅ Tree dictionary validated")
        return tree_dict
    
    def count_tasks(self, node: TaskNode) -> tuple[int, int]:
        """Подсчитывает общее количество задач и листьев"""
        total = 1
        leaves = 1 if not node.children else 0
        
        for child in node.children:
            child_total, child_leaves = self.count_tasks(child)
            total += child_total
            leaves += child_leaves
        
        return total, leaves
    
    def generate_instructions_recursive(
        self,
        node: TaskNode,
        parent_path: str = "",
        parent_task_id: Optional[str] = None,
        depth: int = 0
    ) -> List[InstructionResult]:
        """Рекурсивно генерирует инструкции для листьев дерева"""
        instructions: List[InstructionResult] = []
        
        full_path: str = f"{parent_path} > {node.task_name}" if parent_path else node.task_name
        
        is_leaf = len(node.children) == 0
        
        if is_leaf:  # Это лист - генерируем инструкцию
            logger.info(f"📝 Generating instruction for leaf: {full_path}")
            
            # Строим контекст из действий
            actions_context = self._format_actions(node.actions)
            
            prompt: str = f"""Ты — инструктор для пользователей онлайн-сайта. Напиши чёткую пошаговую инструкцию.

Название задачи: "{node.task_name}"
Контекст: {parent_path or 'Главная страница'}
Описание: "{node.description}"
Доступные действия: {actions_context}

Требования:
- Используй простой, понятный русский язык
- 3-5 шагов максимум
- Каждый шаг должен быть одним предложением
- Будь практичным и конкретным
- Не добавляй лишних объяснений

Ответ (только шаги, без нумерации и пояснений):
"""
            
            try:
                instruction_text: str = self.llm_client.generate_instruction(prompt)
                
                result = InstructionResult(
                    task_id=node.task_id,
                    task_name=node.task_name,
                    full_path=full_path,
                    depth=depth,
                    instruction=instruction_text,
                    is_leaf=True,
                    parent_task_id=parent_task_id
                )
                instructions.append(result)
                logger.info(f"✅ Instruction generated for: {node.task_id}")
            
            except Exception as e:
                logger.error(f"❌ Failed to generate instruction for {node.task_id}: {e}")
                # Всё равно добавляем результат с ошибкой
                result = InstructionResult(
                    task_id=node.task_id,
                    task_name=node.task_name,
                    full_path=full_path,
                    depth=depth,
                    instruction=f"[ОШИБКА] Не удалось сгенерировать инструкцию: {str(e)}",
                    is_leaf=True,
                    parent_task_id=parent_task_id
                )
                instructions.append(result)
        
        else:  # Рекурсивно обрабатываем детей
            logger.info(f"→ Traversing non-leaf node: {node.task_name} ({len(node.children)} children)")
            
            for child in node.children:
                child_instructions = self.generate_instructions_recursive(
                    child,
                    full_path,
                    parent_task_id=node.task_id,
                    depth=depth + 1
                )
                instructions.extend(child_instructions)
        
        return instructions
    
    @staticmethod
    def _format_actions(actions: List[Action]) -> str:
        """Форматирует действия в понятный текст"""
        if not actions:
            return "нет"
        
        action_strs = []
        for action in actions:
            if action.type == ActionType.NAVIGATE:
                action_strs.append(f"Перейти на {action.target}")
            elif action.type == ActionType.CLICK:
                action_strs.append(f"Кликнуть на '{action.element_text}'")
            elif action.type == ActionType.SEARCH:
                action_strs.append(f"Поиск (пример: {action.query_example})")
            elif action.type == ActionType.FILTER:
                params = ", ".join(action.parameters) if action.parameters else "параметры"
                action_strs.append(f"Фильтр по {params}")
            else:
                action_strs.append(f"{action.type}")
        
        return "; ".join(action_strs)
    
    def process(self, tree_dict: Dict[str, Any]) -> ProcessingResult:
        """Основной метод обработки дерева"""
        try:
            # Валидация
            tree_dict = self.load_tree_from_dict(tree_dict)
            
            # Парсинг корневого узла
            root_node = TaskNode.from_dict(tree_dict["root_task"])
            
            # Подсчёт задач
            self.total_tasks, self.leaf_tasks = self.count_tasks(root_node)
            logger.info(f"📊 Total tasks: {self.total_tasks}, Leaf tasks: {self.leaf_tasks}")
            
            # Генерация инструкций
            instructions = self.generate_instructions_recursive(root_node)
            
            logger.info(f"✅ Processing completed: {len(instructions)} instructions generated")
            
            return ProcessingResult(
                status="success",
                total_tasks=self.total_tasks,
                leaf_tasks=self.leaf_tasks,
                instructions_generated=len(instructions),
                instructions=instructions
            )
        
        except Exception as e:
            logger.error(f"❌ Processing failed: {e}")
            return ProcessingResult(
                status="error",
                total_tasks=0,
                leaf_tasks=0,
                instructions_generated=0,
                instructions=[],
                error_message=str(e)
            )


# ==================== Main Pipeline ====================

class InstructionGenerator:
    """Основной интерфейс для генерации инструкций"""
    
    def __init__(self, api_key: str):
        self.llm_client = LLMClient(api_key=api_key)
        self.processor = TaskTreeProcessor(llm_client=self.llm_client)
    
    def generate_from_dict(self, tree_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Генерирует инструкции из словаря дерева задач
        
        Args:
            tree_dict: Словарь с структурой дерева задач
        
        Returns:
            Результат обработки в формате словаря
        """
        logger.info("🚀 Starting instruction generation from dictionary...")
        result = self.processor.process(tree_dict)
        return result.to_dict()
    


# ==================== API Interface ====================

def process_instructions_pipeline(
    tree_dict: Optional[Dict[str, Any]] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Основная функция для обработки дерева задач
    
    Args:
        tree_dict: Словарь с деревом задач (если передан, используется вместо файла)
        input_file: Путь к JSON-файлу с деревом (если tree_dict не передан)
        output_file: Путь к выходному JSON-файлу с результатом
        api_key: API ключ для LLM (если не передан, читается из окружения)
    
    Returns:
        Словарь с результатом обработки
    
    Example:
        result = process_instructions_pipeline(
            tree_dict=my_tree_dict,
            api_key=""
        )
    """
    # api_key = 

    if api_key is None:
        import os
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("API key must be provided or set in OPENAI_API_KEY env var")
    
    generator = InstructionGenerator(api_key=api_key)
    
    if tree_dict is not None:
        logger.info("Using provided tree dictionary")
        result = generator.generate_from_dict(tree_dict)

    else:
        raise ValueError("Either tree_dict or input_file must be provided")
    
    return result


# ==================== Example Usage ====================

if __name__ == "__main__":
    
    # Пример 1: Использование с JSON-файлом
    """
    result = process_instructions_pipeline(
        input_file="tree_task.json",
        output_file="instructions_result.json",
        api_key="KEY"
    )
    """
    
    # Пример 2: Использование со словарём
    sample_tree = {
        "task_tree_version": "1.0",
        "root_task": {
            "task_id": "root",
            "task_name": "Главная страница",
            "description": "Короткое описание задачи (1-2 предложения)",
            "aliases": ["home", "main_page"],
            "actions": [
                {"type": "navigate", "target": "/"},
                {"type": "click", "element_text": "Каталог", "target": "/shop"}
            ],
            "children": [
                {
                    "task_id": "browse_catalog",
                    "task_name": "Просмотр каталога товаров",
                    "description": "Навигация и поиск товаров по категориям",
                    "aliases": [],
                    "actions": [
                        {"type": "navigate", "target": "/shop"},
                        {"type": "search", "query_example": "ноутбук"},
                        {"type": "filter", "parameters": ["price", "brand"]}
                    ],
                    "children": [
                        {
                            "task_id": "add_to_cart",
                            "task_name": "Добавление товара в корзину",
                            "description": "Добавить выбранный товар в корзину",
                            "actions": [
                                {"type": "click", "element_text": "Добавить в корзину"}
                            ],
                            "children": []
                        }
                    ]
                }
            ]
        }
    }
    
    try:
        result = process_instructions_pipeline(
            tree_dict=sample_tree,
            output_file="instructions_result.json",
            api_key="api_key"
        )
        print("\n✅ Result:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
