# PDF 試卷自動生成器 (原型)

這是一個使用 FastAPI (後端) 和原生 HTML/CSS/JavaScript (前端) 開發的 Web 應用程式原型。它允許使用者上傳 PDF 格式的教材，輸入生成試卷的要求，然後利用大型語言模型 (LLM) 根據 PDF 內容和使用者指令自動生成試卷題目。應用程式支援流式輸出，即時顯示 LLM 的思考過程和生成的試卷內容，並提供將試卷匯出為 HTML 的功能。

![image](https://github.com/user-attachments/assets/3ecaa3ea-6aad-4413-93b7-6e62a6b795a0)

## 主要功能

*   **PDF 上傳與處理**:
    *   支援上傳 PDF 檔案。
    *   使用 PyMuPDF (fitz) 提取 PDF 中的文字內容。
    *   當直接提取文字不足時，自動調用 Tesseract OCR 對頁面圖像進行光學字元辨識 (支援繁簡中文)。
*   **LLM 整合**:
    *   連接到外部的 OpenAI 相容的 LLM API (例如 Ollama、本地部署的 LLM 或商業服務)。
    *   將提取的 PDF 文字和使用者指令組合成提示 (Prompt) 發送給 LLM。
    *   支援流式響應 (Streaming)，即時接收並顯示 LLM 生成的內容。
*   **前端互動**:
    *   簡潔的使用者介面，方便上傳 PDF 和輸入指令。
    *   即時顯示 LLM 的思考過程 (位於 `<think>` 標籤內) 和試卷內容。
    *   使用 Marked.js 和 DOMPurify 將 LLM 生成的 Markdown 格式試卷渲染為 HTML。
    *   提供將生成的試卷匯出為獨立 HTML 檔案的功能，方便列印或分享。
*   **配置性**:
    *   透過 `.env` 檔案配置 LLM API 位址、模型名稱、API 金鑰、上下文長度限制以及 Tesseract 路徑。

## 技術棧

*   **後端**:
    *   Python 3.8+
    *   FastAPI: 高效能的 Web 框架。
    *   Uvicorn: ASGI 伺服器。
    *   python-multipart: FastAPI 處理文件上傳所需。
    *   PyMuPDF (fitz): PDF 文字提取與圖像轉換。
    *   Pytesseract: OCR 文字識別。
    *   python-dotenv: 環境變數管理。
    *   httpx: 非同步 HTTP 客戶端，用於與 LLM API 通訊。
*   **前端**:
    *   HTML5
    *   CSS3
    *   JavaScript (ES6+)
    *   Marked.js: Markdown 解析器。
    *   DOMPurify: HTML 清潔器，防止 XSS。
*   **外部服務**:
    *   Tesseract OCR Engine
    *   OpenAI 相容的 LLM API (例如 Ollama)

## 前置準備

1.  **Python**: 確保已安裝 Python 3.8 或更高版本。
2.  **Pip**: Python 套件安裝器。
3.  **虛擬環境 (推薦)**: 例如 `venv` 或 `conda`。
4.  **Tesseract OCR**:
    *   必須安裝 Tesseract OCR 引擎。您可以從官方網站下載：[https://github.com/tesseract-ocr/tesseract](https://github.com/tesseract-ocr/tesseract)
    *   安裝時，請務必選擇安裝**繁體中文 (chi_tra)** 和**簡體中文 (chi_sim)** 的語言包。
    *   確保 Tesseract 的執行檔路徑已加入到系統的 `PATH` 環境變數中，或者您可以在 `.env` 檔案中設定 `TESSERACT_CMD` 指向其完整路徑。
    *   檢查 Tesseract 的 `tessdata` 目錄是否包含 `chi_tra.traineddata` 和 `chi_sim.traineddata` 檔案。
5.  **LLM API 存取**:
    *   您需要有一個可用的 OpenAI 相容的 LLM API 端點。
    *   一個常見的本地選擇是 [Ollama](https://ollama.com/)。安裝 Ollama 後，您可以拉取並運行一個模型，例如：
        ```bash
        ollama pull qwen2:7b # 或其他您偏好的模型，如 qwen:7b-chat, llama3
        ollama serve # (通常 Ollama 會自動在背景運行服務)
        ```
        Ollama 0.1.30+ 版本開始原生支援 OpenAI 相容的 API 端點，通常在 `http://localhost:11434/v1/chat/completions`。較舊版本或某些配置可能使用原生 API 端點如 `http://localhost:11434/api/chat`。本專案的 `llm_handler.py` 已設計為兼容這兩種常見的 Ollama 流式響應格式。

## 設定與安裝

1.  **克隆儲存庫 (如果您是從 Git 取得)**:
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **建立並啟動虛擬環境 (推薦)**:
    ```bash
    python -m venv venv
    # Windows
    venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate
    ```

3.  **安裝 Python 依賴套件**:
    將以下內容保存為專案根目錄下的 `requirements.txt` 檔案：
    ```txt
    fastapi
    uvicorn[standard]
    python-dotenv
    httpx
    PyMuPDF
    pytesseract
    python-multipart
    ```
    然後運行：
    ```bash
    pip install -r requirements.txt
    ```

4.  **設定環境變數**:
    在專案根目錄下創建一個名為 `.env` 的檔案 (您可以從 `.env.example` 複製，如果有的話)，並填寫必要的設定。範例如下：

    ```ini
    # .env

    # --- LLM API 設定 ---
    # 根據您的 LLM 服務提供商和模型進行調整。
    # llm_handler.py 目前支援解析 Ollama 原生流格式和 OpenAI 相容的流格式。

    # 範例 1: 使用 Ollama 的 OpenAI 相容 API (推薦，Ollama 0.1.30+ 版本)
    LLM_API_URL="http://localhost:11434/v1/chat/completions"
    LLM_MODEL_NAME="qwen2:7b" # 或 "qwen:7b-chat", "llama3", "mistral" 等您已下載並運行的模型

    # 範例 2: 使用 Ollama 的原生 API 端點 (舊版 Ollama 或特定配置)
    # LLM_API_URL="http://localhost:11434/api/chat"
    # LLM_MODEL_NAME="qwen2:7b"

    # 範例 3: 使用您提供的遠程 Ollama 服務 (或其他 OpenAI 相容服務)
    # LLM_API_URL="http://ubuntu:1234/v1/chat/completions"
    # LLM_MODEL_NAME="qwen:7b-chat"

    # API 金鑰 (如果您的 LLM 服務需要)
    LLM_API_KEY="" # Ollama 本地運行通常不需要 API Key

    # --- PDF 內容上下文長度限制 ---
    # 發送給 LLM 的 PDF 內容的最大字元數。超出部分將被截斷。
    # 請根據您的 LLM 模型限制和硬體資源調整。
    MAX_CONTEXT_LENGTH_CHARS=8000

    # --- Tesseract OCR 設定 ---
    # 如果 Tesseract OCR 的執行檔路徑未加入系統 PATH 環境變數，請在此處指定完整路徑。
    # 如果已加入 PATH，則此行可以留空或註釋掉。

    # Windows 範例 (假設 Tesseract 安裝在 C:\Program Files\Tesseract-OCR):
    TESSERACT_CMD="C:/Program Files/Tesseract-OCR/tesseract.exe"

    # macOS/Linux 範例 (假設 tesseract 在 /usr/local/bin/tesseract 或 /opt/homebrew/bin/tesseract):
    # TESSERACT_CMD="/usr/local/bin/tesseract"
    ```
    *   **`LLM_API_URL`**: 您的 LLM 服務的 API 端點。
    *   **`LLM_MODEL_NAME`**: 您要使用的模型名稱。
    *   **`LLM_API_KEY`**: 如果您的 LLM API 需要 Bearer Token 認證，請填寫。
    *   **`MAX_CONTEXT_LENGTH_CHARS`**: 發送給 LLM 的 PDF 文字內容的最大字元數。
    *   **`TESSERACT_CMD`**: 如果 `pytesseract` 無法自動找到 Tesseract，請指定其可執行檔的完整路徑。

## 運行應用程式

1.  確保您的 LLM 服務正在運行 (例如 Ollama)。
2.  在專案根目錄下，運行 FastAPI 應用程式：
    ```bash
    python main.py
    ```
    或者，使用 Uvicorn 進行開發，並啟用自動重載：
    ```bash
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ```
3.  開啟您的網頁瀏覽器，訪問 `http://localhost:8000` (或者如果您使用了 `--host 0.0.0.0`，則可以透過您機器的局域網 IP 位址從其他設備訪問，例如 `http://<your-local-ip>:8000`)。

## 使用說明

1.  **選擇 PDF 檔案**: 點擊 "選擇 PDF 課本" 按鈕，選擇您要處理的 PDF 檔案。
2.  **輸入試卷生成指令**: 在文字區域中輸入您對試卷的具體要求。例如："請根據課本內容，出5題關於[某個主題]的選擇題，並附上答案。" 如果留空，將使用預設指令。
3.  **生成試卷**: 點擊 "生成試卷" 按鈕。
4.  **查看結果**:
    *   **狀態區**: 會顯示當前的處理狀態 (例如 "處理 PDF 中...", "LLM 生成中...", "完成")。
    *   **LLM 思考過程**: 如果 LLM 的輸出包含 `<think>...</think>` 標籤，這部分內容會即時顯示在此區域。此區域預設是折疊的，可以點擊展開。
    *   **試卷預覽**: LLM 生成的試卷內容 (Markdown 格式) 會即時顯示並渲染在此區域。
5.  **匯出試卷**: 試卷生成完成後，"匯出為HTML" 按鈕將變為可用。點擊此按鈕會在新視窗/分頁中打開一個包含試卷內容和思考過程（如果有的話）的 HTML 頁面，方便列印或保存。

## 專案結構

```
.
├── main.py                     # FastAPI 應用程式主文件，處理 HTTP 請求和路由
├── llm_handler.py              # 處理與 LLM API 的所有互動 (請求、流式響應)
├── pdf_processor.py            # 處理 PDF 文字提取和 OCR
├── static/
│   ├── index.html              # 前端 HTML 結構
│   ├── script.js               # 前端 JavaScript 邏輯
│   └── style.css               # 前端 CSS 樣式
├── temp_files/                 # 上傳的 PDF 檔案的臨時存放目錄 (自動創建)
├── .env                        # (您需要自行創建) 環境變數配置文件
├── requirements.txt            # Python 依賴列表
└── README.md                   # 本文件
