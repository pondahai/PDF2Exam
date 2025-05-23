import os
import pytesseract
import fitz # PyMuPDF
from dotenv import load_dotenv

load_dotenv()

# 從 .env 讀取 Tesseract 命令路徑 (如果需要)
TESSERACT_CMD = os.getenv("TESSERACT_CMD")
if TESSERACT_CMD and os.path.exists(TESSERACT_CMD):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

MIN_TEXT_LENGTH_TO_SKIP_OCR = 200 # 每頁至少多少字符才認為是文字型PDF，跳過OCR

async def process_pdf_to_text(pdf_path: str) -> str:
    """
    處理 PDF 檔案，首先嘗試直接提取文字，如果文字量不足則進行 OCR。
    """
    full_text = []
    try:
        doc = fitz.open(pdf_path)
        num_pages = len(doc)
        print(f"PDF has {num_pages} pages.")

        for page_num in range(num_pages):
            page = doc.load_page(page_num)
            page_text = page.get_text("text")

            full_text.append(f"\n--- Page {page_num + 1} ---\n")

            if len(page_text.strip()) > MIN_TEXT_LENGTH_TO_SKIP_OCR:
                print(f"Page {page_num + 1}: Extracted text directly (length: {len(page_text)}).")
                full_text.append(page_text)
            else:
                print(f"Page {page_num + 1}: Text length {len(page_text)} too short, attempting OCR.")
                # 提取頁面圖像進行 OCR
                pix = page.get_pixmap(dpi=300) # 提高 DPI 以獲得更好的 OCR 結果
                img_path = f"temp_page_{page_num}.png"
                pix.save(img_path)

                try:
                    # 指定繁體中文: chi_tra, 簡體中文: chi_sim
                    # 可以用 + 連接多個語言包，例如 "chi_tra+chi_sim+eng"
                    ocr_text = pytesseract.image_to_string(img_path, lang='chi_tra+chi_sim')
                    print(f"Page {page_num + 1}: OCR completed (length: {len(ocr_text)}).")
                    full_text.append(ocr_text)
                except pytesseract.TesseractNotFoundError:
                    error_msg = "Tesseract 未安裝或未在系統 PATH 中。請安裝 Tesseract 或在 .env 中設定 TESSERACT_CMD。"
                    print(error_msg)
                    # 如果 Tesseract 未找到，這裡可以選擇是拋出異常還是返回已提取的部分
                    # 為了演示，我們先繼續，但這頁會是空的
                    full_text.append(f"[OCR失敗於此頁：{error_msg}]\n")
                except Exception as e:
                    print(f"OCR error on page {page_num + 1}: {e}")
                    full_text.append(f"[OCR時發生錯誤於此頁：{str(e)}]\n")
                finally:
                    if os.path.exists(img_path):
                        os.remove(img_path) # 清理臨時圖片檔

        doc.close()
        return "".join(full_text)

    except Exception as e:
        print(f"Error processing PDF {pdf_path}: {e}")
        return f"[處理PDF時發生錯誤: {str(e)}]\n" + "".join(full_text) # 返回已處理的部分和錯誤訊息