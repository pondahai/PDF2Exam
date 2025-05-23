import os
import shutil
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from pdf_processor import process_pdf_to_text
from llm_handler import generate_exam_stream_from_llm

load_dotenv()

app = FastAPI()

# 掛載 static 資料夾，用於存放 HTML, CSS, JS
app.mount("/static", StaticFiles(directory="static"), name="static")

TEMP_DIR = "temp_files"
os.makedirs(TEMP_DIR, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

@app.post("/generate_exam")
async def generate_exam_endpoint(
    pdf_file: UploadFile = File(...),
    user_query: str = Form(...)
):
    try:
        # 1. 保存上傳的 PDF 檔案
        file_path = os.path.join(TEMP_DIR, pdf_file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(pdf_file.file, buffer)

        # 2. 處理 PDF 提取文字 (調用 pdf_processor)
        # 注意：這裡的 process_pdf_to_text 應該是同步的，如果 OCR 很慢，會阻塞
        # 未來可以考慮改為背景任務
        print(f"Processing PDF: {pdf_file.filename}")
        extracted_text = await process_pdf_to_text(file_path)
        print(f"PDF processing complete. Extracted text length: {len(extracted_text)}")

        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="無法從 PDF 中提取任何文字內容，請檢查 PDF 檔案或 OCR 設定。")

        # 3. 調用 LLM 生成試卷 (流式)
        print(f"Sending to LLM. User query: {user_query}")
        llm_stream = generate_exam_stream_from_llm(extracted_text, user_query)

        # return StreamingResponse(llm_stream, media_type="text/event-stream")
        # Ollama 的 stream 輸出直接是 text/plain 裡夾帶 JSON-like 結構的 SSE
        # 如果是標準 SSE，media_type="text/event-stream"
        # 根據 llm_handler 的 yield 內容，可能直接是 text/plain
        return StreamingResponse(llm_stream, media_type="text/plain; charset=utf-8")

    except HTTPException as e:
        print(f"HTTP Exception: {e.detail}")
        raise e
    except Exception as e:
        print(f"An error occurred: {e}")
        # 在生產環境中，應該記錄更詳細的錯誤日誌
        raise HTTPException(status_code=500, detail=f"伺服器內部錯誤: {str(e)}")
    finally:
        # 清理臨時檔案 (可選，或者定期清理)
        if 'file_path' in locals() and os.path.exists(file_path):
            # os.remove(file_path) # 演示時可以先不清，方便調試
            pass

if __name__ == "__main__":
    import uvicorn
    # 綁定到 0.0.0.0 以便局域網內其他機器訪問
    uvicorn.run(app, host="0.0.0.0", port=8000)