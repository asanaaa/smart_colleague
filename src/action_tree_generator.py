# action_tree_generator.py
# Класс для работы с OpenRouter и DeepSeek моделями

import json
import time
import requests
from typing import Union, Dict, Any
import os

class ActionTreeGenerator:
    """
    Класс для вызова OpenRouter/DeepSeek и получения JSON‑ответа
    на основе дерева действий и системного промпта.
    
    Работает со строками и dict, возвращает dict (основное) или str (альтернатива).
    
    Пример использования:
        gen = ActionTreeGenerator(api_key=)
        action_tree: Dict[str, Any] = {"tasks": [...]}
        system_prompt: str = "Ты анализируешь структуру сайта..."
        
        result_dict: Dict[str, Any] = gen.generate_dict(action_tree, system_prompt)
        # или
        result_str: str = gen.generate_str(action_tree, system_prompt)
    """

    def __init__(
        self,
        api_key: str,
        model: str = "x-ai/grok-4.1-fast:free",
        base_url: str = "https://openrouter.ai/api/v1/chat/completions",
    ) -> None:
        """
        Инициализация генератора.
        
        Args:
            api_key: OpenRouter API ключ (str)
            model: Название модели для использования (str)
            base_url: URL OpenRouter API (str)
        """
        self.model: str = model
        self.api_key: str = api_key
        self.base_url: str = base_url

    # ---------- Вспомогательные методы (приватные) ----------

    def _parse_action_tree(self, action_tree: Union[str, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Парсит action_tree из строки JSON или dict.
        
        Args:
            action_tree: JSON строка или dict с деревом действий (Union[str, Dict])
            
        Returns:
            Распарсенный словарь (Dict[str, Any])
            
        Raises:
            json.JSONDecodeError: Если строка не валидный JSON
            TypeError: Если передан неправильный тип
        """
        if isinstance(action_tree, dict):
            return action_tree
        elif isinstance(action_tree, str):
            return json.loads(action_tree)
        else:
            raise TypeError(f"action_tree должен быть str или dict, получен {type(action_tree)}")

    def _build_messages(self, action_tree: Dict[str, Any], system_prompt: str) -> list[Dict[str, str]]:
        """
        Формирует список сообщений для модели.
        
        Args:
            action_tree: Распарсенное дерево действий (Dict[str, Any])
            system_prompt: Системный промпт (str)
            
        Returns:
            Список сообщений для API (list[Dict[str, str]])
        """
        return [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": "Вот дерево всех возможных действий на сайте:\n"
                           + json.dumps(action_tree, ensure_ascii=False),
            },
        ]

    def _clean_model_output(self, content: str) -> str:
        """
        Убирает обёртки ```json ... ``` / ``` ... ```, пробелы и т.п.
        
        Args:
            content: Сырой текст от модели (str)
            
        Returns:
            Очищенный JSON‑текст (str)
        """
        cleaned: str = content.strip()
        cleaned = cleaned.removeprefix("```json")
        cleaned = cleaned.removeprefix("```")
        cleaned = cleaned.removesuffix("```")
        return cleaned.strip()

    def _parse_json_with_fallback(self, content: str) -> Dict[str, Any]:
        """
        Пытается распарсить JSON, при ошибке пробует декодировать
        unicode‑escape (если модель заэкранила кавычки).
        
        Args:
            content: JSON‑текст для парсинга (str)
            
        Returns:
            Распарсенный словарь (Dict[str, Any])
            
        Raises:
            json.JSONDecodeError: Если оба варианта парсинга не сработали
        """
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            try:
                return json.loads(content.encode().decode("unicode_escape"))
            except Exception as e:
                raise json.JSONDecodeError(
                    f"Не удалось распарсить JSON даже с fallback: {str(e)}",
                    content,
                    0
                )

    def _make_api_call(self, messages: list[Dict[str, str]]) -> str:
        """
        Отправляет запрос в OpenRouter API и возвращает содержимое ответа.
        
        Args:
            messages: Список сообщений для модели (list[Dict[str, str]])
            
        Returns:
            Текстовое содержимое ответа от модели (str)
            
        Raises:
            RuntimeError: Если API вернул ошибку (включая 429 rate limit)
            requests.HTTPError: При HTTP ошибке
        """
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
        }

        headers: Dict[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        response: requests.Response = requests.post(
            self.base_url,
            headers=headers,
            json=payload,
            timeout=120,
        )
        response.raise_for_status()

        data: Dict[str, Any] = response.json()
        
        # Проверяем ошибки от OpenRouter
        if "error" in data:
            error_msg: str = data["error"].get("metadata", {}).get("raw") or data["error"].get("message", "Unknown error")
            error_code: int = data["error"].get("code", 0)
            raise RuntimeError(f"OpenRouter API error (код {error_code}): {error_msg}")
        
        # Проверяем наличие choices
        if "choices" not in data or len(data["choices"]) == 0:
            raise RuntimeError("API вернул пустой ответ (нет choices)")
        
        return data["choices"][0]["message"]["content"]

    # ---------- Публичные методы ----------

    def generate_dict(
        self,
        action_tree: Union[str, Dict[str, Any]],
        system_prompt: str,
        verbose: bool = True
    ) -> Dict[str, Any]:
        """
        Основной метод генерации (возвращает dict):
        1) Парсит action_tree из строки или dict
        2) Вызывает модель через OpenRouter
        3) Чистит и парсит ответ в JSON
        4) Возвращает как dict
        
        Args:
            action_tree: JSON строка или dict с деревом действий (Union[str, Dict[str, Any]])
            system_prompt: Системный промпт для модели (str)
            verbose: Выводить ли сообщения о прогрессе (bool)
        
        Returns:
            Распарсенный dict с результатом (Dict[str, Any])
            
        Raises:
            TypeError: Если action_tree неправильного типа
            json.JSONDecodeError: Если action_tree не парсится как JSON
            RuntimeError: Если API вернул ошибку
        """
        if verbose:
            print("📖 Парсинг action_tree...")
        parsed_tree: Dict[str, Any] = self._parse_action_tree(action_tree)

        if verbose:
            print("📨 Формирование запроса...")
        messages: list[Dict[str, str]] = self._build_messages(parsed_tree, system_prompt)

        if verbose:
            print("🔄 Отправка запроса к модели...")
        start: float = time.time()
        raw_content: str = self._make_api_call(messages)
        elapsed: float = time.time() - start
        if verbose:
            print(f"⏱️  Время запроса: {elapsed:.2f} сек")

        if verbose:
            print("🧹 Очистка ответа...")
        cleaned: str = self._clean_model_output(raw_content)
        
        if verbose:
            print("🔍 Парсинг JSON...")
        parsed: Dict[str, Any] = self._parse_json_with_fallback(cleaned)

        if verbose:
            print("✅ Успешно!")

        return parsed

    def generate_str(
        self,
        action_tree: Union[str, Dict[str, Any]],
        system_prompt: str,
        verbose: bool = True
    ) -> str:
        """
        Альтернативный метод: генерирует и возвращает JSON как строку.
        
        Args:
            action_tree: JSON строка или dict с деревом действий (Union[str, Dict[str, Any]])
            system_prompt: Системный промпт для модели (str)
            verbose: Выводить ли сообщения о прогрессе (bool)
        
        Returns:
            JSON строка с результатом (str)
        """
        result_dict: Dict[str, Any] = self.generate_dict(action_tree, system_prompt, verbose=verbose)
        return json.dumps(result_dict, ensure_ascii=False, indent=4)

    def get_info(self) -> Dict[str, str]:
        """
        Возвращает информацию о конфигурации генератора.
        
        Returns:
            Словарь с информацией о настройках (Dict[str, str])
        """
        return {
            "model": self.model,
            "api_url": self.base_url,
        }
