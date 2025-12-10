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


# ==================== Data Models ====================


@dataclass
class SearchResult:
    """Результат поиска"""
    description: str
    instruction: str
    user_query: str
    status: str  
    search_time_ms: float = 0.0
    error_message: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Преобразует в словарь"""
        return {
            "description": self.description,
            "instruction": self.instruction,
            "user_query": self.user_query,
            "status": self.status,
            "search_time_ms": round(self.search_time_ms, 2),
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
            
    def call_api(self, messages: List[Dict[str, str]], temperature: float = 0.7) -> str:
        """Низкоуровневый вызов API"""
        
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        
        headers: Dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        try:
            response: requests.Response = requests.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        
        except requests.exceptions.Timeout:
            logger.error("❌ API request timed out")
            raise RuntimeError("API request timed out")
        
        except requests.exceptions.HTTPError as e:
            logger.error(f"❌ HTTP Error: {e.response.status_code}")
            raise RuntimeError(f"HTTP Error: {e.response.status_code}")
        
        except Exception as e:
            logger.error(f"❌ API error: {e}")
            raise RuntimeError(f"API error: {str(e)}")


# ==================== Instruction Search Engine ====================

class InstructionSearchEngine:
    """Поисковый движок для инструкций"""
    
    def __init__(self, llm_client: LLMClient):
        self.llm_client: LLMClient = llm_client
    
    def _extract_relevance_score(self, response_text: str) -> float:
        """Извлекает оценку релевантности из ответа LLM"""
        try:
            # Пытается найти JSON в ответе
            import re
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                score = data.get("relevance_score", 0.0)
                return float(score) / 100.0 if score > 1 else float(score)
        except:
            pass
        
        # Fallback: ищет числа в тексте
        import re
        scores = re.findall(r'\b(0\.\d+|[0-9]+)\b', response_text)
        if scores:
            try:
                score = float(scores[0])
                return score / 100.0 if score > 1 else score
            except:
                pass
        
        return 0.5  # Дефолтное значение
    

    def evaluate_instruction_relevance(
        self,
        user_query: str,
        instruction: str,
    ) -> tuple[float, str]:
        """
        Оценивает релевантность инструкции к запросу пользователя
        
        Returns:
            instruction: str
        """

        prompt = f"""Ты — эксперт по анализу инструкции. Оцени, к какой инструкции из предложенных соответствует запросу пользователя.

Запрос пользователя: "{user_query}"

Инструкции: {instruction}.яи 

Проанализируй:
1. Совпадает ли задача с запросом?
2. Есть ли семантическое сходство?
3. Поможет ли эта инструкция пользователю?

Ответь JSON-объектом:
{{
  "relevance_score": <число от 0 до 1>,
  "instruction": <полностью написанная соответствующая инструкция в любом случае что то выдать>.
  "reasoning": "<краткое объяснение на русском, 1-2 предложения>"
  "description": <напиши пошаговое описание инструкции, не совсем большое но понятное>"
}}

Ответ (только JSON, без других текстов):"""
        
        try:
            logger.info(f"Recognition query: '{user_query}'")
            
            response = self.llm_client.call_api(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3
            )
            # Парсим JSON из ответа
            import re
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            
            if json_match:
                try:
                    data = json.loads(json_match.group())
                    score = float(data.get("relevance_score", 0.5))
                    found_instruction = str(data.get("instruction", None))
                    description = str(data.get("description", None))
                    reasoning = str(data.get("reasoning", "Нет объяснения"))
                    if found_instruction == None or score <0.2:
                        return score, reasoning, "Не смог найти сорян"
                    # Нормализуем score
                    score = max(0.0, min(1.0, score))
                    
                    logger.info(f"  ✓ Score: {score:.2f}, Reasoning: {reasoning[:50]}...")
                    return score, reasoning, found_instruction, description
                
                except json.JSONDecodeError:
                    logger.warning(f"  ⚠️ Failed to parse JSON from response")
                    return 0.5, "Ошибка парсинга ответа API"
            else:
                logger.warning(f"  ⚠️ No JSON found in response")
                return 0.5, "API вернул неправильный формат"
        
        except Exception as e:
            logger.error(f"  ❌ Error evaluating relevance: {e}")
            return 0.0, f"Ошибка: {str(e)}"

    def instructions_to_str(self, instructions: List[Dict[str, Any]]) -> str:
        """
        Преобразует список инструкций в один человекочитаемый текст.
        Ожидается формат элементов:
        {
            "task_id": str,
            "task_name": str,
            "full_path": str,
            "instruction": str,
            ...
        }
        """
        parts: List[str] = []

        for instr in instructions:
            task_name = instr.get("task_name", "")
            full_path = instr.get("full_path", "")
            instruction_text = instr.get("instruction", "")

            block = (
                f"Задача: {task_name}\n"
                f"Путь: {full_path}\n"
                f"Инструкция:\n{instruction_text}\n"
                "------------------------------"
            )
            parts.append(block)

        return "\n".join(parts)

    def search(
        self,
        user_query: str,
        instructions: List[Dict[str, Any]],
    ) -> SearchResult:
        """
        Ищет релевантные инструкции по запросу пользователя
        
        Args:
            user_query: Запрос пользователя
            instructions: Список инструкций из процесса генерации
            min_relevance: Минимальная релевантность (0-1)
            top_k: Количество топ результатов
        
        Returns:
            SearchResult с найденными инструкциями
        """
        import time
        start_time = time.time()
        
        logger.info(f"🔍 Starting search for query: '{user_query}'")
        logger.info(f"📊 Searching through {len(instructions)} instructions...")
        
        instructions_str = self.instructions_to_str(instructions)
        score, reasoning, found_instruction, description = self.evaluate_instruction_relevance(user_query, instructions_str)

        
        search_time = (time.time() - start_time) * 1000  # в миллисекундах
        
        if score < 0.2:
            logger.warning("❌ No relevant instructions found")
            status = "no_matches"
        else:
            logger.info(f"✅ Search completed: found {found_instruction}")
            status = "success"
        
        result = SearchResult(
            instruction = found_instruction,
            description = description,
            user_query=user_query,
            status=status,
            search_time_ms=search_time
        )
        
        return result


# ==================== Question Processor ====================

class QuestionProcessor:
    """Обработчик вопросов и генерация рекомендаций"""
    
    def __init__(self, llm_client: LLMClient, search_engine: InstructionSearchEngine):
        self.llm_client: LLMClient = llm_client
        self.search_engine: InstructionSearchEngine = search_engine
    
    def generate_recommendation(
        self,
        user_query: str,
        search_result: SearchResult
    ) -> str:
        """
        Генерирует рекомендацию на основе результатов поиска
        
        Args:
            user_query: Исходный запрос пользователя
            search_result: Результаты поиска
        
        Returns:
            Текст рекомендации
        """
        
        if search_result.status == "no_matches":
            return f"К сожалению, я не нашел подходящих инструкций для вашего запроса: '{user_query}'. Попробуйте переформулировать вопрос или обратитесь к главному меню."
        
        top_match = search_result.instruction
        
        if top_match is None:
            return "Ошибка: не найдено совпадений"
        
        prompt = f"""Ты — помощник пользователя. На основе найденной инструкции дай краткий совет пользователю.

Запрос пользователя: "{user_query}"

Найденная инструкция:
- Инструкция: {top_match}

Напиши ответ на русском языке:
1. Подтверди, что ты понял запрос пользователя
2. Предложи найденную инструкцию
3. Если есть альтернативы — упомяни их (если их несколько в результатах)
4. Задай уточняющий вопрос, если нужно

Ответ (2-3 предложения, дружелюбный тон):"""
        
        try:
            recommendation = self.llm_client.call_api(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
            return recommendation
        
        except Exception as e:
            logger.error(f"Error generating recommendation: {e}")
            # Fallback ответ
            return f"Попробуйте выполнить задачу '{top_match.task_name}'. Инструкция: {top_match.instruction[:200]}..."


# ==================== Main Interface ====================

class InstructionAssistant:
    """Главный интерфейс ассистента по инструкциям"""
    
    def __init__(self, api_key: str):
        self.llm_client = LLMClient(api_key=api_key)
        self.search_engine = InstructionSearchEngine(llm_client=self.llm_client)
        self.question_processor = QuestionProcessor(
            llm_client=self.llm_client,
            search_engine=self.search_engine
        )
        self.current_instructions: List[Dict[str, Any]] = []
    
    def load_instructions(self, instructions: List[Dict[str, Any]]) -> None:
        """
        Загружает инструкции из результата process_instructions_pipeline
        
        Args:
            instructions: Список инструкций
        """
        self.current_instructions = instructions
        logger.info(f"✅ Loaded {len(instructions)} instructions")
    
    def answer_question(
        self,
        user_query: str,
        min_relevance: float = 0.3,
        top_k: int = 3,
        include_recommendation: bool = True
    ) -> Dict[str, Any]:
        """
        Отвечает на вопрос пользователя
        
        Args:
            user_query: Вопрос пользователя
            min_relevance: Минимальная релевантность результатов
            top_k: Количество топ результатов
            include_recommendation: Генерировать ли рекомендацию
        
        Returns:
            Словарь с результатами
        """
        
        if not self.current_instructions:
            return {
                "status": "error",
                "error_message": "Инструкции не загружены. Используйте load_instructions()."
            }
        
        logger.info(f"\n{'='*60}")
        logger.info(f"💬 User question: '{user_query}'")
        logger.info(f"{'='*60}")
        
        # Поиск релевантных инструкций
        search_result = self.search_engine.search(
            user_query=user_query,
            instructions=self.current_instructions,
        )
        
        result_dict = search_result.to_dict()

        logger.info(f"✅ Question processing complete")
        
        return result_dict

