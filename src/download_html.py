# download_html.py - Обновленная версия для интеграции с бэкендом
import requests
import os
import json
import subprocess
import sys

def download_urls(urls, html_dir="html_files"):
    """Функция для скачивания URL-ов (можно импортировать)"""
    os.makedirs(html_dir, exist_ok=True)
    downloaded_files = []
    
    for i, url in enumerate(urls):
        try:
            # Устанавливаем кодировку для requests
            response = requests.get(url)
            response.encoding = 'utf-8'  # Явно указываем кодировку
            response.raise_for_status()
            
            filename = f"page_{i+1}.html"
            filepath = os.path.join(html_dir, filename)
            
            # Сохраняем с явным указанием кодировки UTF-8
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(response.text)
            downloaded_files.append(filepath)
            print(f"Downloaded: {url} -> {filepath}")
            
        except Exception as e:
            print(f"Error downloading {url}: {str(e)}")
    
    return downloaded_files

if __name__ == "__main__":
    # Устанавливаем кодировку для вывода в консоль
    if sys.platform.startswith('win'):
        os.system('chcp 65001 > nul')  # Для Windows меняем кодировку консоли на UTF-8
    
    # Список URL для скачивания
    urls = [
        "http://localhost:8000/index.html" #захардкожено
    ]
    
    html_files = download_urls(urls)
    
    # Сохраняем пути в временный файл с UTF-8 кодировкой
    temp_file = "temp_files.json"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(html_files, f, ensure_ascii=False, indent=2)
    
    print("HTML files downloaded successfully")