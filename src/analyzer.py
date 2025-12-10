# analyzer.py - Site Analysis and Task Tree Generation

import json
import os
import sys
import logging
import sqlite3
from datetime import datetime
from contextlib import contextmanager
import subprocess
import argparse
from typing import Dict, Any, List, Optional, Union
import uuid

from peewee import (
    Model, SqliteDatabase, AutoField, TextField, IntegerField
)
from action_tree_generator import ActionTreeGenerator
from intent_extracter import process_instructions_pipeline

from dotenv import load_dotenv  # pip install python-dotenv



# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Конфигурация базы данных
DATABASE_PATH: str = "ai_assistant.db"

# Конфигурация API
DEEPSEEK_API_URL: str = "https://api.deepseek.com/v1/chat/completions"



db: SqliteDatabase | None = None


# ---------- модели Peewee ----------

class BaseModel(Model):
    class Meta:
        database = db


class TasksTrees(BaseModel):
    id = AutoField()
    application = TextField()
    analyzed_at = TextField()
    tasks_json = TextField()
    created_at = TextField()  # TEXT DEFAULT CURRENT_TIMESTAMP

    class Meta:
        table_name = "tasks_trees"


class InstructionsIntents(BaseModel):
    id = AutoField()
    application = TextField()
    analyzed_at = TextField()
    instructions = TextField()
    created_at = TextField()

    class Meta:
        table_name = "instructions_intents"


class Instructions(BaseModel):
    id = TextField(primary_key=True)  # TEXT PRIMARY KEY
    task_id = TextField()
    task_data_json = TextField(null=True)
    steps_json = TextField()
    user_query = TextField(null=True)
    context_json = TextField(null=True)
    timestamp = TextField()
    usage_count = IntegerField(default=0)
    last_used = TextField(null=True)
    file_paths_json = TextField(null=True)
    likes = IntegerField(default=0)
    dislikes = IntegerField(default=0)
    created_at = TextField()
    updated_at = TextField()

    class Meta:
        table_name = "instructions"


class InstructionRatings(BaseModel):
    id = AutoField()
    instruction_id = TextField()
    rating = IntegerField()
    user_session = TextField(null=True)
    created_at = TextField()

    class Meta:
        table_name = "instruction_ratings"


class UserSessions(BaseModel):
    session_id = TextField(primary_key=True)
    user_agent = TextField(null=True)
    ip_address = TextField(null=True)
    created_at = TextField()
    last_activity = TextField()

    class Meta:
        table_name = "user_sessions"


class ChatHistory(BaseModel):
    id = AutoField()
    session_id = TextField()
    message_text = TextField()
    message_type = TextField()
    instruction_id = TextField(null=True)
    created_at = TextField()

    class Meta:
        table_name = "chat_history"


# ---------- DatabaseManager на Peewee ----------

class DatabaseManager:
    """Менеджер базы данных SQLite"""

    def __init__(self, db_path: str) -> None:
        """
        Args:
            db_path: Путь к файлу БД (str)
        """
        global db
        self.db_path: str = db_path

        # инициализируем peewee-базу
        db = SqliteDatabase(self.db_path, pragmas={"foreign_keys": 1})
        db.connect(reuse_if_open=True)

        self.init_database()

    @contextmanager
    def get_connection(self):
        """
        Контекстный менеджер для подключения к БД.

        Оставлен для совместимости, но внутри используется peewee db.
        """
        try:
            if db.is_closed():
                db.connect()
            # создаём «псевдо‑conn» с тем же интерфейсом execute/commit/rollback,
            # если где‑то старый код его использует
            yield db
            db.commit()
        except Exception as e:
            db.rollback()
            raise e

    def init_database(self) -> None:
        """Инициализация структуры базы данных"""

        # создаём таблицы, если их нет
        db.create_tables(
            [
                TasksTrees,
                InstructionsIntents,
                Instructions,
                InstructionRatings,
                UserSessions,
                ChatHistory,
            ],
            safe=True,
        )

        # индексы (peewee не знает о них, поэтому создаём сырыми запросами один раз)
        db.execute_sql(
            "CREATE INDEX IF NOT EXISTS idx_instructions_task_id ON instructions(task_id)"
        )
        db.execute_sql(
            "CREATE INDEX IF NOT EXISTS idx_instructions_usage ON instructions(usage_count)"
        )
        db.execute_sql(
            "CREATE INDEX IF NOT EXISTS idx_ratings_instruction_id ON instruction_ratings(instruction_id)"
        )
        db.execute_sql(
            "CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id)"
        )

        logger.info("Database initialized successfully")

    # ---------- те же публичные методы ----------

    def save_tasks_tree(self, tasks_tree_js: Dict[str, Any]) -> None:
        """
        Сохранение дерева задач в БД

        Args:
            tasks_tree_js: Дерево задач (Dict[str, Any])
        """
        application = tasks_tree_js.get("application", "EcoStore")
        analyzed_at = tasks_tree_js.get("analyzed_at", datetime.now().isoformat())
        tasks_json = json.dumps(tasks_tree_js.get("root_task", []), ensure_ascii=False)

        TasksTrees.create(
            application=application,
            analyzed_at=analyzed_at,
            tasks_json=tasks_json,
            created_at=datetime.now().isoformat(),
        )

        logger.info(
            f"Tasks tree saved for application: {tasks_tree_js.get('application', 'EcoStore')}"
        )

    def save_instructions(self, instructions_js: Dict[str, Any]) -> None:
        """
        Сохранение списка намерений в БД

        Args:
            instructions_js: Намерения (Dict[str, Any])
        """
        application = instructions_js.get("application", "EcoStore")
        analyzed_at = instructions_js.get("analyzed_at", datetime.now().isoformat())
        instructions = json.dumps(
            instructions_js.get("instructions", []), ensure_ascii=False
        )

        InstructionsIntents.create(
            application=application,
            analyzed_at=analyzed_at,
            instructions=instructions,
            created_at=datetime.now().isoformat(),
        )

        logger.info(
            f"instructions saved for application: {instructions_js.get('application', 'EcoStore')}"
        )

    def save_instruction(self, instruction_data: Dict[str, Any]) -> None:
        """
        Сохранение инструкции в БД

        Args:
            instruction_data: Данные инструкции (Dict[str, Any])
        """
        now_iso = datetime.now().isoformat()

        Instructions.insert(
            id=instruction_data["id"],
            task_id=instruction_data["task_id"],
            task_data_json=json.dumps(
                instruction_data.get("task_data", {}), ensure_ascii=False
            ),
            steps_json=json.dumps(
                instruction_data.get("steps", []), ensure_ascii=False
            ),
            user_query=instruction_data.get("user_query", ""),
            context_json=json.dumps(
                instruction_data.get("context", {}), ensure_ascii=False
            ),
            timestamp=instruction_data["timestamp"],
            usage_count=instruction_data.get("usage_count", 0),
            last_used=instruction_data.get("last_used"),
            file_paths_json=json.dumps(
                instruction_data.get("file_paths", {}), ensure_ascii=False
            ),
            likes=instruction_data.get("likes", 0),
            dislikes=instruction_data.get("dislikes", 0),
            created_at=now_iso,
            updated_at=now_iso,
        ).on_conflict(
            conflict_target=[Instructions.id],
            preserve=[
                Instructions.created_at,
            ],
            update={
                Instructions.task_id: instruction_data["task_id"],
                Instructions.task_data_json: json.dumps(
                    instruction_data.get("task_data", {}), ensure_ascii=False
                ),
                Instructions.steps_json: json.dumps(
                    instruction_data.get("steps", []), ensure_ascii=False
                ),
                Instructions.user_query: instruction_data.get("user_query", ""),
                Instructions.context_json: json.dumps(
                    instruction_data.get("context", {}), ensure_ascii=False
                ),
                Instructions.timestamp: instruction_data["timestamp"],
                Instructions.usage_count: instruction_data.get("usage_count", 0),
                Instructions.last_used: instruction_data.get("last_used"),
                Instructions.file_paths_json: json.dumps(
                    instruction_data.get("file_paths", {}), ensure_ascii=False
                ),
                Instructions.likes: instruction_data.get("likes", 0),
                Instructions.dislikes: instruction_data.get("dislikes", 0),
                Instructions.updated_at: now_iso,
            },
        ).execute()

        logger.info(f"Instruction saved: {instruction_data['id']}")



class DOMAnalyzer:
    """Класс для анализа DOM структуры сайта"""

    def download_and_analyze(self, urls: Optional[List[str]] = None) -> Union[Dict[str, Any], Dict[str, str]]:
        """
        Скачивание и анализ DOM структуры
        
        Args:
            urls: Список URL для анализа (Optional[List[str]])
            
        Returns:
            Dict с результатами анализа или ошибкой (Dict[str, Any])
        """
        if urls is None:
            urls = ["http://localhost:8000/index.html"]

        try:
            logger.info(f"Starting DOM analysis for URLs: {urls}")

            # Скачиваем HTML файлы
            download_result = subprocess.run(
                [sys.executable, "download_html.py"],
                capture_output=True,
                text=True,
                errors='replace'
            )

            if download_result.returncode != 0:
                error_msg: str = download_result.stderr or "Unknown download error"
                logger.error(f"Download failed: {error_msg}")
                return {"error": f"Download failed: {error_msg}"}

            # Анализируем DOM структуру
            dom_result = subprocess.run(
                ["node", "dom_parser.js", "temp_files.json"],
                capture_output=True,
                text=True,
                errors='replace'
            )

            if dom_result.returncode != 0:
                error_msg: str = dom_result.stderr or "Unknown DOM analysis error"
                logger.error(f"DOM analysis failed: {error_msg}")
                return {"error": f"DOM analysis failed: {error_msg}"}

            # Читаем результат анализа
            with open('dom_analysis.json', 'r', encoding='utf-8') as f:
                dom_analysis: Dict[str, Any] = json.load(f)

            logger.info("DOM analysis completed successfully")
            return dom_analysis

        except Exception as e:
            error_msg: str = str(e)
            logger.error(f"Analysis failed: {error_msg}")
            return {"error": f"Analysis failed: {error_msg}"}


class DeepSeekClient:
    """Клиент для работы с DeepSeek API через ActionTreeGenerator"""

    def __init__(self, api_key: str, api_url: str) -> None:
        """
        Args:
            api_key: OpenRouter API ключ (str)
            api_url: URL для API (str) - не используется, но оставляем для совместимости
        """
        self.api_key: str = api_key
        self.api_url: str = api_url
        self.gen: ActionTreeGenerator = ActionTreeGenerator(api_key=api_key)

    def generate_tasks_tree(
        self,
        dom_analysis: Dict[str, Any],
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Генерация дерева задач на основе анализа DOM
        
        Args:
            dom_analysis: Результат анализа DOM (Dict[str, Any])
            system_prompt: Системный промпт (Optional[str])
            
        Returns:
            Дерево задач (Dict[str, Any])
            
        Raises:
            RuntimeError: Если API вернул ошибку
        """
        if system_prompt is None:
            system_prompt = self._get_default_system_prompt()

        try:
            # ActionTreeGenerator.generate_dict() принимает dict или str и возвращает dict
            tasks_tree: Dict[str, Any] = self.gen.generate_dict(
                action_tree=dom_analysis,
                system_prompt=system_prompt,
                verbose=True
            )

            return tasks_tree
        except RuntimeError as e:
            logger.error(f"API error during task tree generation: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during task tree generation: {str(e)}")
            raise

    def generate_instructions(
        self,
        tasks_tree: Dict[str, Any],
        api_key: str,
    ) -> Dict[str, Any]:
        """
        Генерация намерений на основе анализа DOM
        
        Args:
            tasks_tree: Результат генерации дерева задач (Dict[str, Any])
            
        Returns:
            Список намерений (Dict[str, Any])
            
        Raises:
            RuntimeError: Если API вернул ошибку
        """
        try:
            # ActionTreeGenerator.generate_dict() принимает dict или str и возвращает dict
            tasks_tree: Dict[str, Any] = process_instructions_pipeline(
                tree_dict=tasks_tree,
                api_key=api_key
            )

            return tasks_tree
        except RuntimeError as e:
            logger.error(f"API error during instructions generation: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during instructions generation: {str(e)}")
            raise

    def _get_default_system_prompt(self) -> str:
        """
        Получить системный промпт по умолчанию
        
        Returns:
            Системный промпт (str)
        """
        return """Ты анализируешь структуру веб-сайта и генерируешь дерево всех возможных действий.
На основе анализа DOM верни JSON с упорядоченным списком всех задач/действий, которые пользователь может выполнить на сайте.
Каждая задача должна иметь id, name, description, category, complexity и список CSS селекторов элементов."""



class InstructionManager:
    """Менеджер инструкций"""

    def __init__(self, db_manager: DatabaseManager) -> None:
        """
        Args:
            db_manager: Менеджер БД (DatabaseManager)
        """
        self.db_manager: DatabaseManager = db_manager

    def save_tasks_tree(self, tasks_tree: Dict[str, Any]) -> None:
        """
        Сохранение дерева задач
        
        Args:
            tasks_tree: Дерево задач (Dict[str, Any])
        """
        self.db_manager.save_tasks_tree(tasks_tree)

    def save_instructions(self, instructions: Dict[str, Any]) -> None:
        """
        Сохранение намерений
        
        Args:
            instructions: Список намерений (Dict[str, Any])
        """
        self.db_manager.save_instructions(instructions)

    def save_instruction(
        self,
        task_id: str,
        steps: List[str],
        user_query: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        task_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Сохранение инструкции
        
        Args:
            task_id: ID задачи (str)
            steps: Список шагов (List[str])
            user_query: Запрос пользователя (Optional[str])
            context: Контекст (Optional[Dict[str, Any]])
            task_data: Данные задачи (Optional[Dict[str, Any]])
            
        Returns:
            Сохранённые данные инструкции (Dict[str, Any])
        """
        instruction_id: str = str(uuid.uuid4())
        timestamp: str = datetime.now().isoformat()

        instruction_data: Dict[str, Any] = {
            "id": instruction_id,
            "task_id": task_id,
            "task_data": task_data or {},
             "steps": steps or [],
            "user_query": user_query or "",
            "context": context or {},
            "timestamp": timestamp,
            "usage_count": 0,
            "last_used": None,
            "file_paths": {},
            "likes": 0,
            "dislikes": 0
        }

        self.db_manager.save_instruction(instruction_data)
        logger.info(f"Instruction saved for task: {task_id}")
        return instruction_data




def generate_instructions_recursive(task, dom_analysis, instruction_manager, instructions_accum):
    # Генерация инструкции для текущей задачи
    instruction_data = instruction_manager.save_instruction(
        task_id=task["task_id"],
        task_data=task,
        steps = [],
        context=dom_analysis
    )
    instructions_accum.append({
        "task_id": task["task_id"],
        "task_name": task["task_name"],
        "instruction_id": instruction_data["id"],
    })

    # Рекурсивно вызываем для дочерних задач
    for child_task in task.get("children", []):
        generate_instructions_recursive(child_task, dom_analysis, instruction_manager, instructions_accum)

class SiteAnalyzer:
    """Главный класс для анализа сайта"""

    def __init__(self, db_path: str, api_key: str, api_url: str) -> None:
        """
        Args:
            db_path: Путь к БД (str)
            api_key: OpenRouter API ключ (str)
            api_url: URL API (str)
        """
        self.db_manager: DatabaseManager = DatabaseManager(db_path)
        self.dom_analyzer: DOMAnalyzer = DOMAnalyzer()
        self.deepseek_client: DeepSeekClient = DeepSeekClient(api_key, api_url)
        self.instruction_manager: InstructionManager = InstructionManager(self.db_manager)

    def analyze_site(self, urls: Optional[List[str]] = None, api_key: str =None) -> Dict[str, Any]:
        """
        Полный анализ сайта
        
        Args:
            urls: Список URL для анализа (Optional[List[str]])
            
        Returns:
            Результат анализа (Dict[str, Any])
        """
        logger.info("Starting full site analysis...")

        try:
            # Шаг 1: Анализ DOM
            logger.info("Step 1: Analyzing DOM structure...")
            dom_analysis: Dict[str, Any] = self.dom_analyzer.download_and_analyze(urls)
            with open("prompt.txt", "r", encoding="utf-8") as f:
                system_prompt = f.read()

            if "error" in dom_analysis:
                logger.error(f"DOM analysis error: {dom_analysis['error']}")
                return {"status": "failed", "error": dom_analysis["error"]}

            # Шаг 2: Генерация дерева задач
            logger.info("Step 2: Generating tasks tree...")
            try:
                # generate_dict возвращает Dict[str, Any]
                tasks_tree: Dict[str, Any] = self.deepseek_client.generate_tasks_tree(dom_analysis, system_prompt=system_prompt)
            except RuntimeError as e:
                logger.warning(f"Could not generate tasks tree from API: {str(e)}. Using fallback.")
                tasks_tree: Dict[str, Any] = self._get_fallback_tasks_tree()

            # Сохраняем дерево задач
            self.instruction_manager.save_tasks_tree(tasks_tree)

            # генерация намерений
            logger.info("Step 3: Generating instructions...")
            try:
                # generate_dict возвращает Dict[str, Any]
                instructions: Dict[str, Any] = self.deepseek_client.generate_instructions(tasks_tree, api_key)
            except RuntimeError as e:
                logger.warning(f"Could not generate tasks tree from API: {str(e)}. Using fallback.")
                tasks_tree: Dict[str, Any] = self._get_fallback_tasks_tree()

            self.instruction_manager.save_instructions(instructions)

            # Шаг 3: Генерация инструкций для всех задач
            logger.info("Step 4: Generating instructions for all tasks...")
            generated_instructions: List[Dict[str, Any]] = []
            
            root_task = tasks_tree.get("root_task")
            if root_task:
                generate_instructions_recursive(root_task, dom_analysis, self.instruction_manager, generated_instructions)


            result: Dict[str, Any] = {
                "status": "success",
                "tasks_generated": len(tasks_tree.get("tasks", [])),
                "instructions_created": len(generated_instructions),
                "tasks_tree": tasks_tree,
                "instructions": generated_instructions
            }

            logger.info("Site analysis completed successfully")
            return result

        except Exception as e:
            error_msg: str = str(e)
            logger.error(f"Analysis failed with error: {error_msg}")
            return {"status": "failed", "error": f"Analysis failed: {error_msg}"}

    def _get_fallback_tasks_tree(self) -> Dict[str, Any]:
        """
        Fallback дерево задач если API недоступно
        
        Returns:
            Дерево задач (Dict[str, Any])
        """
        return {
            "application": "EcoStore - Интернет-магазин",
            "analyzed_at": datetime.now().isoformat(),
            "tasks": [
                {
                    "id": "browse_catalog",
                    "name": "Просмотр каталога товаров",
                    "description": "Навигация по категориям и поиск товаров",
                    "category": "Навигация",
                    "complexity": "low",
                    "elements": ["#catalog", ".categories-grid", "#search-input"]
                },
                {
                    "id": "add_to_cart",
                    "name": "Добавление товара в корзину",
                    "description": "Выбор товара и добавление в корзину",
                    "category": "Покупки",
                    "complexity": "medium",
                    "elements": [".product-card", "#cart-count"]
                }
            ]
        }


def main() -> Dict[str, Any]:
    load_dotenv()  # подгрузит .env
    api_key = os.getenv("OPENROUTER_API_KEY")
    """
    Главная функция для запуска анализатора
    
    Returns:
        Результат анализа (Dict[str, Any])
    """
    parser = argparse.ArgumentParser(description="Site Analyzer - Analyze website and generate task tree")
    parser.add_argument('--db', type=str, default=DATABASE_PATH, help='Path to database file')
    parser.add_argument('--urls', type=str, nargs='+', default=None, help='URLs to analyze')
    parser.add_argument('--api-key', type=str, default=api_key, help='OpenRouter API key')
    parser.add_argument('--api-url', type=str, default=DEEPSEEK_API_URL, help='DeepSeek API URL')

    args = parser.parse_args()

    logger.info("="*60)
    logger.info("SITE ANALYZER - Starting")
    logger.info("="*60)
    logger.info(f"Database: {args.db}")
    logger.info("="*60)

    analyzer: SiteAnalyzer = SiteAnalyzer(args.db, args.api_key, args.api_url)
    result: Dict[str, Any] = analyzer.analyze_site(args.urls, args.api_key)

    logger.info("="*60)
    logger.info(f"Result: {result.get('status', 'unknown')}")
    logger.info(f"Tasks generated: {result.get('tasks_generated', 0)}")
    logger.info(f"Instructions created: {result.get('instructions_created', 0)}")
    logger.info("="*60)

    return result


if __name__ == "__main__":
    main()
