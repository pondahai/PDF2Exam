# llm_handler.py
import os
import json
import httpx
from dotenv import load_dotenv
import traceback
import asyncio

load_dotenv()

LLM_API_URL = os.getenv("LLM_API_URL")
LLM_API_KEY = os.getenv("LLM_API_KEY")
LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME")

MAX_CONTEXT_LENGTH_CHARS = int(os.getenv("MAX_CONTEXT_LENGTH_CHARS", 8000))

YIELD_CHAR_BY_CHAR = False  # 通常設為 False
FORCE_ASYNC_SWITCH_AFTER_YIELD = True # 通常設為 True

async def generate_exam_stream_from_llm(text_content: str, user_query: str):
    if not LLM_API_URL or not LLM_MODEL_NAME:
        print("LLM Handler Error: LLM_API_URL 或 LLM_MODEL_NAME 未在 .env 中設定。")
        yield "錯誤：LLM_API_URL 或 LLM_MODEL_NAME 未在 .env 中設定。"
        return

    headers = {
        "Content-Type": "application/json",
    }
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"

    if len(text_content) > MAX_CONTEXT_LENGTH_CHARS:
        print(f"LLM Handler Warning: Text content length ({len(text_content)}) exceeds MAX_CONTEXT_LENGTH_CHARS ({MAX_CONTEXT_LENGTH_CHARS}). Truncating.")
        text_content_for_llm = text_content[:MAX_CONTEXT_LENGTH_CHARS]
    else:
        text_content_for_llm = text_content
    
    prompt = f"""你是一位專業的教學內容設計師，擅長根據提供的教材內容和使用者要求生成試卷。
在生成試卷之前，你可以先進行思考，將你的思考步驟或分析過程放在 <think> 和 </think> 標籤之間（如果適用）。
然後，請嚴格按照 Markdown 格式輸出試卷題目，每道題目應包含題幹、必要的選項（如選擇題），並在題目後明確標示答案。

提供的課本內容如下：
---
{text_content_for_llm}
---

使用者的要求如下：
"{user_query}"

請開始生成試卷 (思考過程可選)：
"""

    payload = {
        "model": LLM_MODEL_NAME,
        "messages": [
            {"role": "system", "content": "你是一位樂於助人的AI助理，專門從教材內容生成Markdown格式的試卷，並可選擇性地展示你的思考過程。"},
            {"role": "user", "content": prompt}
        ],
        "stream": True,
    }
    
    timeout_config = httpx.Timeout(None) 

    try:
        async with httpx.AsyncClient(timeout=timeout_config) as client:
            print(f"LLM Handler: Sending request to LLM API: {LLM_API_URL} (Model: {LLM_MODEL_NAME})")
            
            async with client.stream("POST", LLM_API_URL, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    error_content_bytes = await response.aread()
                    error_content = error_content_bytes.decode(errors='ignore')
                    print(f"LLM Handler: LLM API Error (Status {response.status_code}): {error_content}")
                    yield f"LLM API 錯誤 (狀態 {response.status_code}): {error_content}"
                    return

                # print(f"LLM Handler: Successfully connected to LLM stream (Status {response.status_code}). Reading stream...")
                
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue

                    if line.startswith("data:"):
                        json_data_part = line[len("data:"):].strip()
                        
                        if json_data_part == "[DONE]":
                            print("LLM Handler: Received [DONE] signal from LLM API.")
                            break 

                        try:
                            event_data = json.loads(json_data_part)
                            content_chunk = ""

                            if "choices" in event_data and isinstance(event_data["choices"], list) and event_data["choices"]:
                                delta = event_data["choices"][0].get("delta", {})
                                content_chunk = delta.get("content", "")
                            elif "message" in event_data and "content" in event_data["message"]:
                                content_chunk = event_data["message"]["content"]
                            elif "response" in event_data and isinstance(event_data.get("response"), str):
                                content_chunk = event_data["response"]
                            elif "error" in event_data:
                                error_msg = event_data.get("error", "LLM API returned an error in stream.")
                                print(f"LLM Handler: Error in LLM stream: {error_msg}")
                                yield f"[LLM Stream Error: {error_msg}]"
                                continue 

                            if isinstance(content_chunk, str) and content_chunk:
                                # 主要的 debug print 已移除
                                # print(f"LLM Handler: Extracted content_chunk (length {len(content_chunk)}): {repr(content_chunk[:70])}")
                                
                                if YIELD_CHAR_BY_CHAR and len(content_chunk) > 0: 
                                    for char_token in content_chunk:
                                        yield char_token
                                        if FORCE_ASYNC_SWITCH_AFTER_YIELD:
                                            await asyncio.sleep(0.0001) 
                                else:
                                    yield content_chunk
                                    if FORCE_ASYNC_SWITCH_AFTER_YIELD:
                                        await asyncio.sleep(0) 
                            
                        except json.JSONDecodeError:
                            print(f"LLM Handler Warning: Could not decode JSON from LLM stream data part: '{json_data_part}'")
                    # else:
                        # print(f"LLM Handler DEBUG: Received non-data line from LLM: '{line}'") # 通常可以註釋掉

                # print("LLM Handler: Finished iterating LLM API stream (aiter_lines completed).")
        
    except httpx.RequestError as e: 
        error_msg = f"LLM Handler: Network request to LLM API failed: {e.__class__.__name__} - {e}"
        print(error_msg)
        yield error_msg
    except httpx.HTTPStatusError as e: 
        error_content_bytes = await e.response.aread()
        error_content = error_content_bytes.decode(errors='ignore')
        error_msg = f"LLM Handler: HTTP error from LLM API (Status {e.response.status_code}): {error_content}"
        print(error_msg)
        yield error_msg
    except Exception as e: 
        tb_str = traceback.format_exc()
        error_msg = f"LLM Handler: An unexpected error occurred while processing LLM response: {e.__class__.__name__} - {e}\nTraceback:\n{tb_str}"
        print(error_msg)
        yield error_msg
    finally:
        print("LLM Handler: generate_exam_stream_from_llm function finished.")