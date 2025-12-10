# assistant_api.py - Боевой API ассистента с интеграцией InstructionAssistant

import json
import os
import sys
import uuid
import logging
import sqlite3
from datetime import datetime
from contextlib import contextmanager
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv 
from peewee import (
    Model, SqliteDatabase, TextField, IntegerField, DateTimeField,
    AutoField
)

# Импорт InstructionAssistant
from instruction_finder import InstructionAssistant

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=["*"])

# Конфигурация базы данных
DATABASE_PATH = "ai_assistant.db"


# ==================== Database Manager ====================
# ---------- Peewee DB/модели ----------

db = SqliteDatabase(DATABASE_PATH, pragmas={"foreign_keys": 1})


class BaseModel(Model):
    class Meta:
        database = db


class InstructionsIntents(BaseModel):
    id = AutoField()
    application = TextField()
    analyzed_at = DateTimeField()
    instructions = TextField()

    class Meta:
        table_name = "instructions_intents"


class TasksTrees(BaseModel):
    id = AutoField()
    application = TextField()
    analyzed_at = DateTimeField()
    tasks_json = TextField()
    created_at = DateTimeField()

    class Meta:
        table_name = "tasks_trees"


class Instructions(BaseModel):
    id = AutoField()
    task_id = TextField()
    task_data_json = TextField(null=True)
    steps_json = TextField(null=True)
    user_query = TextField()
    context_json = TextField(null=True)
    timestamp = DateTimeField()
    usage_count = IntegerField()
    last_used = DateTimeField(null=True)
    file_paths_json = TextField(null=True)
    likes = IntegerField()
    dislikes = IntegerField()
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        table_name = "instructions"


class InstructionRatings(BaseModel):
    id = AutoField()
    instruction_id = IntegerField()
    rating = IntegerField()
    user_session = TextField(null=True)

    class Meta:
        table_name = "instruction_ratings"


class ChatHistory(BaseModel):
    id = AutoField()
    session_id = TextField()
    message_text = TextField()
    message_type = TextField()
    instruction_id = IntegerField(null=True)
    created_at = DateTimeField()

    class Meta:
        table_name = "chat_history"


class UserSessions(BaseModel):
    session_id = TextField(primary_key=True)
    user_agent = TextField(null=True)
    ip_address = TextField(null=True)
    last_activity = DateTimeField(null=True)

    class Meta:
        table_name = "user_sessions"


# ---------- Новый DatabaseManager на Peewee ----------

class DatabaseManager:
    """Менеджер базы данных SQLite (read-only для API, но с записью рейтингов и чата)"""

    def __init__(self, db_path):
        global db
        self.db_path = db_path

        if not os.path.exists(db_path):
            logger.error(f"Database not found at {db_path}")
            logger.info("Please run analyzer.py first to initialize the database")
            raise FileNotFoundError(f"Database not found at {db_path}")
        # Peewee сам управляет подключениями; здесь можно просто проверить коннект
        db.connect(reuse_if_open=True)

    @contextmanager
    def get_connection(self):
        """
        Заглушка для совместимости: возвращает объект peewee.db,
        чтобы старый код, если обращается к get_connection, не падал.
        """
        try:
            if db.is_closed():
                db.connect()
            yield db
        finally:
            # соединение оставляем открытым; peewee сам менеджит пул
            pass

    # ---------- методы с тем же интерфейсом ----------

    def get_latest_instructions_intents(self):
        """Получение последних инструкций для интентов из таблицы instructions_intents"""
        try:
            row = (
                InstructionsIntents
                .select()
                .order_by(InstructionsIntents.analyzed_at.desc())
                .limit(1)
                .first()
            )
            if not row:
                return None

            instructions = json.loads(row.instructions)
            return {
                "id": row.id,
                "application": row.application,
                "analyzed_at": row.analyzed_at,
                "instructions": (
                    instructions.get("instructions", [])
                    if isinstance(instructions, dict)
                    else instructions
                ),
            }
        except json.JSONDecodeError:
            logger.error("Failed to parse instructions JSON from DB")
            return None

    def get_latest_tasks_tree(self):
        """Получение последнего дерева задач из БД"""
        row = (
            TasksTrees
            .select()
            .order_by(TasksTrees.created_at.desc())
            .limit(1)
            .first()
        )
        if not row:
            return {}
        return {
            "application": row.application,
            "analyzed_at": row.analyzed_at,
            "tasks": json.loads(row.tasks_json),
        }

    def get_instruction(self, instruction_id):
        """Получение инструкции по ID"""
        row = Instructions.get_or_none(Instructions.id == instruction_id)
        if row:
            return self._row_to_instruction_dict(row)
        return None

    def get_instruction_by_task_id(self, task_id):
        """Получение инструкции по ID задачи"""
        row = (
            Instructions
            .select()
            .where(Instructions.task_id == task_id)
            .order_by(Instructions.usage_count.desc())
            .limit(1)
            .first()
        )
        if row:
            return self._row_to_instruction_dict(row)
        return None

    def update_instruction_usage(self, instruction_id):
        """Обновление счетчика использования инструкции"""
        now_iso = datetime.now().isoformat()
        (
            Instructions
            .update(
                usage_count=Instructions.usage_count + 1,
                last_used=now_iso,
                updated_at=datetime.now(),
            )
            .where(Instructions.id == instruction_id)
            .execute()
        )

    def rate_instruction(self, instruction_id, rating, user_session=None):
        """Оценка инструкции (лайк/дизлайк)"""
        if user_session:
            exists = (
                InstructionRatings
                .select()
                .where(
                    (InstructionRatings.instruction_id == instruction_id)
                    & (InstructionRatings.user_session == user_session)
                )
                .exists()
            )
            if exists:
                return False, "Вы уже оценили эту инструкцию"

        InstructionRatings.create(
            instruction_id=instruction_id,
            rating=rating,
            user_session=user_session,
        )

        if rating == 1:
            (
                Instructions
                .update(likes=Instructions.likes + 1)
                .where(Instructions.id == instruction_id)
                .execute()
            )
        else:
            (
                Instructions
                .update(dislikes=Instructions.dislikes + 1)
                .where(Instructions.id == instruction_id)
                .execute()
            )

        return True, "Оценка сохранена"

    def get_instruction_ratings(self, instruction_id):
        """Получение оценок инструкции"""
        query = (
            InstructionRatings
            .select(InstructionRatings.rating, fn.COUNT(InstructionRatings.id).alias("count"))
            .where(InstructionRatings.instruction_id == instruction_id)
            .group_by(InstructionRatings.rating)
        )
        ratings = {"likes": 0, "dislikes": 0}
        for row in query:
            if row.rating == 1:
                ratings["likes"] = row.count
            else:
                ratings["dislikes"] = row.count
        return ratings

    def get_popular_instructions(self, limit=10):
        """Получение популярных инструкций"""
        query = (
            Instructions
            .select()
            .order_by((Instructions.usage_count + Instructions.likes * 5).desc())
            .limit(limit)
        )
        return [self._row_to_instruction_dict(row) for row in query]

    def search_instructions(self, query):
        """Поиск инструкций по запросу"""
        pattern = f"%{query}%"
        q = (
            Instructions
            .select()
            .where(
                (Instructions.task_id ** pattern)
                | (Instructions.user_query ** pattern)
                | (Instructions.task_data_json ** pattern)
                | (Instructions.steps_json ** pattern)
            )
            .order_by(Instructions.usage_count.desc())
        )
        return [self._row_to_instruction_dict(row) for row in q]

    def save_chat_message(self, session_id, message_text, message_type, instruction_id=None):
        """Сохранение сообщения чата в историю"""
        ChatHistory.create(
            session_id=session_id,
            message_text=message_text,
            message_type=message_type,
            instruction_id=instruction_id,
            created_at=datetime.now(),
        )

    def get_chat_history(self, session_id, limit=50):
        """Получение истории чата для сессии"""
        q = (
            ChatHistory
            .select(
                ChatHistory.message_text,
                ChatHistory.message_type,
                ChatHistory.instruction_id,
                ChatHistory.created_at,
            )
            .where(ChatHistory.session_id == session_id)
            .order_by(ChatHistory.created_at.desc())
            .limit(limit)
        )
        rows = list(q)
        # вернуть список dict как раньше
        result = [
            {
                "message_text": r.message_text,
                "message_type": r.message_type,
                "instruction_id": r.instruction_id,
                "created_at": r.created_at,
            }
            for r in rows
        ]
        return result

    def create_user_session(self, session_id, user_agent=None, ip_address=None):
        """Создание новой пользовательской сессии"""
        UserSessions.insert(
            session_id=session_id,
            user_agent=user_agent,
            ip_address=ip_address,
            last_activity=datetime.now(),
        ).on_conflict_replace().execute()

    def update_session_activity(self, session_id):
        """Обновление времени последней активности сессии"""
        (
            UserSessions
            .update(last_activity=datetime.now())
            .where(UserSessions.session_id == session_id)
            .execute()
        )

    def _row_to_instruction_dict(self, row):
        """Преобразование строки БД в словарь инструкции"""
        # row здесь — объект Instructions
        return {
            "id": row.id,
            "task_id": row.task_id,
            "task_data": json.loads(row.task_data_json) if row.task_data_json else {},
            "steps": json.loads(row.steps_json) if row.steps_json else [],
            "user_query": row.user_query,
            "context": json.loads(row.context_json) if row.context_json else {},
            "timestamp": row.timestamp,
            "usage_count": row.usage_count,
            "last_used": row.last_used,
            "file_paths": json.loads(row.file_paths_json) if row.file_paths_json else {},
            "likes": row.likes,
            "dislikes": row.dislikes,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }


# ==================== Instruction Assistant Manager ====================

class AssistantManager:
    """Менеджер для работы с InstructionAssistant"""
    
    def __init__(self, db_manager: DatabaseManager, api_key: str):
        self.db_manager = db_manager
        self.api_key = api_key
        self.assistant: InstructionAssistant = None
        self.instructions_loaded = False
        self._load_instructions()
    
    def _load_instructions(self):
        """Загружает инструкции из БД и инициализирует ассистента"""
        try:
            # Получаем инструкции из таблицы instructions_intents
            intent_data = self.db_manager.get_latest_instructions_intents()
            
            if not intent_data:
                logger.warning("No intent instructions found in database")
                return False
            
            logger.info(f"Loaded {len(intent_data['instructions'])} instructions from DB")
            
            # Инициализируем ассистента
            self.assistant = InstructionAssistant(api_key=self.api_key)
            self.assistant.load_instructions(intent_data['instructions'])
            
            self.instructions_loaded = True
            logger.info("✅ InstructionAssistant initialized successfully")
            return True
        
        except Exception as e:
            logger.error(f"❌ Failed to load instructions: {e}")
            return False
    
    def answer_question(self, user_query: str) -> dict:
        """Отвечает на вопрос пользователя используя InstructionAssistant"""
        
        if not self.instructions_loaded:
            logger.warning("Instructions not loaded, attempting to reload...")
            if not self._load_instructions():
                return {
                    'status': 'error',
                    'message': 'Инструкции не загружены. Система инициализируется...'
                }
        
        try:
            logger.info(f"Processing query: '{user_query}'")
            
            # Используем InstructionAssistant для поиска
            result = self.assistant.answer_question(
                user_query=user_query,
                min_relevance=0.3,
                top_k=3,
                include_recommendation=True
            )
            
            logger.info(f"Query processed successfully, status: {result.get('status')}")
            
            return result
        
        except Exception as e:
            logger.error(f"Error processing query: {e}")
            return {
                'status': 'error',
                'message': f'Ошибка при обработке запроса: {str(e)}'
            }


# ==================== AI Service ====================

class AIService:
    """Вспомогательный сервис для текстовых ответов"""
    
    def __init__(self, db_manager):
        self.db_manager = db_manager
    
    def chat_response(self, message):
        """Генерация текстового ответа на вопрос (fallback)"""
        responses = {
            "привет": "Привет! Я ваш AI-ассистент. Чем могу помочь?",
            "помощь": "Я помогу вам разобраться с интерфейсом. Просто спросите, как выполнить нужное действие.",
            "как работает": "Задайте конкретный вопрос о том, что вы хотите сделать, и я помогу вам пошагово.",
        }
        
        message_lower = message.lower()
        for key in responses:
            if key in message_lower:
                return responses[key]
        
        return "Я понял ваш вопрос. Уточните, пожалуйста, что именно вы хотите сделать?"


# ==================== Initialization ====================

def get_user_session():
    """Получение или создание пользовательской сессии"""
    session_id = request.headers.get('X-Session-ID') or str(uuid.uuid4())
    user_agent = request.headers.get('User-Agent', '')
    ip_address = request.remote_addr
    
    db_manager.create_user_session(session_id, user_agent, ip_address)
    db_manager.update_session_activity(session_id)
    
    return session_id


# Инициализация сервисов
db_manager = DatabaseManager(DATABASE_PATH)

# API ключ для OpenAI (прочитать из переменных окружения)


load_dotenv()  # подгрузит .env
api_key = os.getenv("OPENROUTER_API_KEY")

# Инициализируем менеджер ассистента
assistant_manager = AssistantManager(db_manager=db_manager, api_key=api_key)

# Вспомогательный сервис
ai_service = AIService(db_manager=db_manager)


# ==================== API ENDPOINTS ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health-check endpoint"""
    try:
        tasks_tree = db_manager.get_latest_tasks_tree()
        is_initialized = bool(tasks_tree)
        
        return jsonify({
            'status': 'ok',
            'database': 'connected',
            'initialized': is_initialized,
            'assistant_ready': assistant_manager.instructions_loaded,
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/get-tasks-tree', methods=['GET'])
def get_tasks_tree():
    """Получение дерева задач"""
    try:
        tasks_tree = db_manager.get_latest_tasks_tree()
        if not tasks_tree:
            return jsonify({'error': 'Tasks tree not found. Please run analyzer first.'}), 404
        
        return jsonify({"tasks_tree": tasks_tree})
    
    except Exception as e:
        logger.error(f"Error getting tasks tree: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/get-help', methods=['POST', 'OPTIONS'])
def get_help():
    """Получение доступных задач для текущей страницы"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.json or {}
        
        # Получаем доступные задачи из дерева задач
        tasks_tree = db_manager.get_latest_tasks_tree()
        available_tasks = tasks_tree.get("tasks", [])
        
        return jsonify({
            'available_tasks': available_tasks,
            'application': tasks_tree.get("application", "Unknown Application")
        })
    
    except Exception as e:
        logger.error(f"Error getting help: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/get-instruction', methods=['POST'])
def get_instruction():
    """Получение инструкции для конкретной задачи"""
    try:
        session_id = get_user_session()
        data = request.json or {}
        task_id = data.get('task_id')
        
        if not task_id:
            return jsonify({"error": "task_id is required"}), 400
        
        # Получаем задачу из дерева задач
        tasks_tree = db_manager.get_latest_tasks_tree()
        task_data = None
        
        for task in tasks_tree.get("tasks", []):
            if task["id"] == task_id:
                task_data = task
                break
        
        if not task_data:
            return jsonify({"error": "Task not found"}), 404
        
        # Ищем инструкцию в БД
        instruction = db_manager.get_instruction_by_task_id(task_id)
        
        if instruction:
            db_manager.update_instruction_usage(instruction['id'])
            db_manager.save_chat_message(
                session_id,
                f"Запрос инструкции: {task_data['name']}",
                'user',
                instruction['id']
            )
            
            return jsonify({
                'steps': instruction['steps'],
                'instruction_id': instruction['id'],
                'task_data': task_data,
                'file_paths': instruction['file_paths'],
                'source': 'database',
                'likes': instruction['likes'],
                'dislikes': instruction['dislikes']
            })
        
        return jsonify({
            'error': 'Instruction not found for this task',
            'task_data': task_data
        }), 404
    
    except Exception as e:
        logger.error(f"Error getting instruction: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat():
    """Обработка чат-запроса пользователя с использованием InstructionAssistant"""
    try:
        logger.info("=" * 60)
        logger.info("Chat request received")
        
        session_id = get_user_session()
        data = request.json or {}
        message = data.get('message', '').strip()
        
        if not message:
            return jsonify({"error": "message is required"}), 400
        
        logger.info(f"User message: '{message}'")
        
        # Сохраняем сообщение пользователя
        db_manager.save_chat_message(session_id, message, 'user')
        
        # Используем InstructionAssistant для обработки запроса
        result = assistant_manager.answer_question(message)
        
        logger.info(f"Assistant response status: {result.get('status')}")
        
        # Формируем ответ для клиента
        if result.get('status') == 'success' or result.get('status') == 'partial':
            top_match = result.get('description')
            
                
            return jsonify({
                'message': top_match,
                'type': 'instruction',
                'search_result': result
            })
        
        # Fallback: текстовый ответ
        response = ai_service.chat_response(message)
        db_manager.save_chat_message(session_id, response, 'assistant')
        
        logger.info("=" * 60)
        
        return jsonify({
            'message': response,
            'type': 'text'
        })
    
    except Exception as e:
        logger.error(f"Error in chat: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/rate-instruction', methods=['POST'])
def rate_instruction():
    """Оценка инструкции (лайк/дизлайк)"""
    try:
        session_id = get_user_session()
        data = request.json or {}
        instruction_id = data.get('instruction_id')
        rating = data.get('rating')  # 1 для лайка, -1 для дизлайка
        
        if not instruction_id or rating not in [1, -1]:
            return jsonify({"error": "instruction_id and rating (1 or -1) are required"}), 400
        
        success, message = db_manager.rate_instruction(instruction_id, rating, session_id)
        
        if success:
            return jsonify({
                'status': 'success',
                'message': message,
                'instruction_id': instruction_id,
                'rating': rating
            })
        else:
            return jsonify({
                'status': 'error',
                'message': message
            }), 400
    
    except Exception as e:
        logger.error(f"Error rating instruction: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/instruction-ratings/<instruction_id>', methods=['GET'])
def get_instruction_ratings_endpoint(instruction_id):
    """Получение оценок инструкции"""
    try:
        ratings = db_manager.get_instruction_ratings(instruction_id)
        instruction = db_manager.get_instruction(instruction_id)
        
        if not instruction:
            return jsonify({'error': 'Instruction not found'}), 404
        
        return jsonify({
            'instruction_id': instruction_id,
            'likes': instruction['likes'],
            'dislikes': instruction['dislikes'],
            'ratings_count': {
                'likes': ratings['likes'],
                'dislikes': ratings['dislikes']
            }
        })
    
    except Exception as e:
        logger.error(f"Error getting ratings: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/popular-instructions', methods=['GET'])
def get_popular_instructions():
    """Получение популярных инструкций"""
    try:
        limit = request.args.get('limit', 10, type=int)
        instructions = db_manager.get_popular_instructions(limit)
        
        return jsonify({
            'count': len(instructions),
            'instructions': instructions
        })
    
    except Exception as e:
        logger.error(f"Error getting popular instructions: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/search-instructions', methods=['GET'])
def search_instructions():
    """Поиск инструкций по запросу"""
    try:
        query = request.args.get('q', '', type=str)
        
        if not query:
            return jsonify({"error": "q parameter is required"}), 400
        
        instructions = db_manager.search_instructions(query)
        
        return jsonify({
            'query': query,
            'count': len(instructions),
            'instructions': instructions
        })
    
    except Exception as e:
        logger.error(f"Error searching instructions: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/chat-history', methods=['GET'])
def get_chat_history():
    """Получение истории чата пользователя"""
    try:
        session_id = get_user_session()
        limit = request.args.get('limit', 50, type=int)
        history = db_manager.get_chat_history(session_id, limit)
        history.reverse()  # Возвращаем в порядке возрастания времени
        
        return jsonify({
            'session_id': session_id,
            'message_count': len(history),
            'messages': history
        })
    
    except Exception as e:
        logger.error(f"Error getting chat history: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ==================== Main ====================

def main():
    """Запуск Flask приложения"""
    logger.info("=" * 60)
    logger.info("ASSISTANT API - Starting")
    logger.info("=" * 60)
    logger.info(f"Database: {DATABASE_PATH}")
    logger.info(f"API URL: http://localhost:5000")
    logger.info(f"Assistant Status: {'✅ Ready' if assistant_manager.instructions_loaded else '⚠️ Initializing'}")
    logger.info("\nAvailable endpoints:")
    logger.info(" - GET /api/health - Health check")
    logger.info(" - GET /api/get-tasks-tree - Get task tree")
    logger.info(" - POST /api/get-help - Get available tasks")
    logger.info(" - POST /api/get-instruction - Get instruction for task")
    logger.info(" - POST /api/chat - Chat with assistant (uses InstructionAssistant)")
    logger.info(" - POST /api/rate-instruction - Rate instruction")
    logger.info(" - GET /api/instruction-ratings/<id> - Get instruction ratings")
    logger.info(" - GET /api/popular-instructions - Get popular instructions")
    logger.info(" - GET /api/search-instructions?q=query - Search instructions")
    logger.info(" - GET /api/chat-history - Get chat history")
    logger.info("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)


if __name__ == "__main__":
    main()
