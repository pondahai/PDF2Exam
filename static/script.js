// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    const pdfFileInput = document.getElementById('pdfFile');
    const userQueryInput = document.getElementById('userQuery');
    const generateBtn = document.getElementById('generateBtn');
    const examOutputDiv = document.getElementById('examOutput'); // 用於最終渲染
    const statusArea = document.getElementById('statusArea');

    const thinkAreaContainer = document.getElementById('thinkAreaContainer');
    const thinkOutputDiv = document.getElementById('thinkOutput'); // 用於最終渲染

	const exportHtmlBtn = document.getElementById('exportHtmlBtn');

    // 新增：用於即時顯示原始文本流的臨時容器
    let tempThinkStreamDiv = null;
    let tempExamStreamDiv = null;

    const DEFAULT_USER_QUERY = "請根據提供的課本內容，生成一份包含5道選擇題和2道簡答題的綜合測驗卷，選擇題需有四個選項，並請提供所有題目的正確答案。";

    marked.setOptions({
        pedantic: false,
        gfm: true,
        breaks: true, // 設置為 true，讓單個換行符也產生 <br>，更像即時打字效果
        sanitize: false,
        smartLists: true,
        smartypants: false,
        xhtml: false
    });

    // 函數：將文本追加到 DOM 元素，並滾動
    function appendTextToElement(element, text) {
        if (element && text) {
            // 為了安全，簡單轉義 HTML 特殊字符，避免直接插入未經處理的文本到 innerHTML
            // 但更好的做法是創建文本節點 appendChild
            // const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            // element.innerHTML += escapedText.replace(/\n/g, "<br>"); // 將換行符轉為 <br>

            // 使用 textContent 或創建文本節點追加更安全且高效
            const lines = text.split('\n');
            lines.forEach((line, index) => {
                element.appendChild(document.createTextNode(line));
                if (index < lines.length - 1) {
                    element.appendChild(document.createElement('br'));
                }
            });
            element.scrollTop = element.scrollHeight;
        }
    }

    // 函數：在流結束後，對累加的 Markdown 文本進行最終渲染
    function finalRender(targetDiv, accumulatedMarkdown) {
        if (targetDiv) {
            if (accumulatedMarkdown && accumulatedMarkdown.trim() !== "") {
                const rawHtml = marked.parse(accumulatedMarkdown);
                targetDiv.innerHTML = DOMPurify.sanitize(rawHtml);
                targetDiv.scrollTop = targetDiv.scrollHeight;
            } else {
                targetDiv.innerHTML = ""; // 清空
            }
        }
    }


    generateBtn.addEventListener('click', async () => {
        const pdfFile = pdfFileInput.files[0];
        let userQuery = userQueryInput.value.trim();
		exportHtmlBtn.disabled = true; // 禁用匯出按鈕

        if (!pdfFile) {
            statusArea.textContent = '錯誤：請先選擇 PDF 檔案！';
            statusArea.style.color = 'red';
            return;
        }
        
        if (!userQuery) {
            userQuery = DEFAULT_USER_QUERY;
            userQueryInput.value = userQuery; 
            statusArea.textContent = '提示：已使用預設生成指令。';
            statusArea.style.color = 'orange'; 
        } else {
            statusArea.textContent = '狀態：正在準備上傳並處理 PDF...';
            statusArea.style.color = '#3c4043';
        }

        generateBtn.disabled = true;
        exportHtmlBtn.disabled = true; 

        // 初始化/重置顯示區域
        examOutputDiv.innerHTML = "<p>處理中，請稍候...</p>"; // 這是最終渲染區
        thinkOutputDiv.innerHTML = "<p><em>LLM 思考過程將顯示於此...</em></p>"; // 這是最終渲染區
        
        // 創建或清空用於即時流的臨時 div (包裹在 .markdown-body 內以繼承樣式)
        // 確保這些臨時 div 被正確地添加到 DOM 中
        if (!document.getElementById('tempExamStreamDiv')) {
            tempExamStreamDiv = document.createElement('div');
            tempExamStreamDiv.id = 'tempExamStreamDiv';
            tempExamStreamDiv.className = 'markdown-body stream-preview'; // 添加class便於樣式控制
            examOutputDiv.parentNode.insertBefore(tempExamStreamDiv, examOutputDiv); // 插入到最終區域之前
        }
        if (!document.getElementById('tempThinkStreamDiv')) {
            tempThinkStreamDiv = document.createElement('div');
            tempThinkStreamDiv.id = 'tempThinkStreamDiv';
            tempThinkStreamDiv.className = 'markdown-body stream-preview';
            thinkOutputDiv.parentNode.insertBefore(tempThinkStreamDiv, thinkOutputDiv);
        }
        
        tempExamStreamDiv.innerHTML = "<p>處理中，請稍候...</p>";
        tempThinkStreamDiv.innerHTML = "<p><em>LLM 思考過程將顯示於此...</em></p>";
        
        // 隱藏最終渲染區域，顯示臨時流區域
        examOutputDiv.style.display = 'none';
        thinkOutputDiv.style.display = 'none';
        tempExamStreamDiv.style.display = 'block';
        tempThinkStreamDiv.style.display = 'block'; // 初始隱藏，有內容再顯示

        thinkAreaContainer.style.display = 'none'; // 思考區容器初始隱藏

        generateBtn.disabled = true;

        const formData = new FormData();
        formData.append('pdf_file', pdfFile);
        formData.append('user_query', userQuery);

        let accumulatedExamMarkdown = ""; // 用於最終渲染
        let accumulatedThinkMarkdown = ""; // 用於最終渲染

        let generationSuccess = false; 
        let thinkBlockEverHadContent = false; 

        try {
            const response = await fetch('/generate_exam', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) { /* ...錯誤處理同前... */ 
                let errorDetail = "未知伺服器錯誤";
                try {
                    const errorData = await response.json();
                    errorDetail = errorData.detail || JSON.stringify(errorData);
                } catch (e) {
                    errorDetail = await response.text() || response.statusText;
                }
                throw new Error(`伺服器錯誤: ${response.status} - ${errorDetail}`);
            }
            if (!response.body) { throw new Error("伺服器未返回流式響應體。"); }

            statusArea.textContent = '狀態：試卷生成中 (流式接收)...';
            statusArea.style.color = '#3c4043';
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            
            // 清空臨時區域的 "處理中"
            tempExamStreamDiv.innerHTML = ""; 
            tempThinkStreamDiv.innerHTML = "";

            let inThinkBlock = false;
            let thinkBlockEverHadContent = false;
            const thinkStartTag = "<think>";
            const thinkEndTag = "</think>";

            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    break; // 跳出循環，在 finally 中進行最終渲染
                }
                
                let currentChunk = decoder.decode(value, { stream: true });

                while (currentChunk.length > 0) {
                    let textToAppend = "";
                    let targetTempDiv = null;

                    if (inThinkBlock) {
                        const endTagIndex = currentChunk.indexOf(thinkEndTag);
                        if (endTagIndex !== -1) {
                            textToAppend = currentChunk.substring(0, endTagIndex);
                            accumulatedThinkMarkdown += textToAppend;
                            targetTempDiv = tempThinkStreamDiv;
                            
                            currentChunk = currentChunk.substring(endTagIndex + thinkEndTag.length);
                            inThinkBlock = false;
                        } else {
                            textToAppend = currentChunk;
                            accumulatedThinkMarkdown += textToAppend;
                            targetTempDiv = tempThinkStreamDiv;
                            currentChunk = ""; 
                        }
                    } else { // not inThinkBlock
                        const startTagIndex = currentChunk.indexOf(thinkStartTag);
                        if (startTagIndex !== -1) {
                            textToAppend = currentChunk.substring(0, startTagIndex);
                            if (textToAppend) { 
								accumulatedExamMarkdown += textToAppend;
                            }
                            targetTempDiv = tempExamStreamDiv;
                            
                            thinkBlockEverHadContent = true;
                            thinkAreaContainer.style.display = 'block'; // 顯示思考區的 details 容器
                            tempThinkStreamDiv.style.display = 'block'; // 確保臨時思考流區域也顯示
                            // if (!thinkAreaContainer.open) { thinkAreaContainer.open = true; }
                            
                            currentChunk = currentChunk.substring(startTagIndex + thinkStartTag.length);
                            inThinkBlock = true;
                        } else {
                            textToAppend = currentChunk;
                            accumulatedExamMarkdown += textToAppend;
                            targetTempDiv = tempExamStreamDiv;
                            currentChunk = ""; 
                        }
						// if (textToAppend && targetTempDiv) { 
							// appendTextToElement(targetTempDiv, textToAppend);
						// }
                    }
                    
                    // 即時追加原始文本到臨時 div
                    if (textToAppend) {
                        appendTextToElement(targetTempDiv, textToAppend);
                    }
                }
            }
            
            statusArea.textContent = '狀態：試卷生成完畢！正在進行最終渲染...';
			
            generationSuccess = true; 

        } catch (error) {
            console.error('生成試卷時發生錯誤:', error);
            statusArea.textContent = `錯誤：${error.message}`;
            statusArea.style.color = 'red';
            generationSuccess = false;
            // 清理臨時區域並顯示錯誤
            // if (tempExamStreamDiv) tempExamStreamDiv.innerHTML = `<p style="color:red;">生成失敗：${error.message}</p>`;
            // if (tempThinkStreamDiv) tempThinkStreamDiv.innerHTML = ""; // 清空
            // examOutputDiv.style.display = 'none'; // 保持隱藏最終區
            // thinkOutputDiv.style.display = 'none';

        } finally {
            // 流結束或出錯後，進行最終的 Markdown 渲染
            finalRender(examOutputDiv, accumulatedExamMarkdown);
            finalRender(thinkOutputDiv, accumulatedThinkMarkdown);

            // 隱藏臨時流區域，顯示最終渲染區域
            if (tempExamStreamDiv) tempExamStreamDiv.style.display = 'none';
            if (tempThinkStreamDiv) tempThinkStreamDiv.style.display = 'none';
            examOutputDiv.style.display = 'block';
            thinkOutputDiv.style.display = 'block';


            if (thinkBlockEverHadContent && accumulatedThinkMarkdown.trim() === "") {
                thinkOutputDiv.innerHTML = "<p><em>思考過程為空。</em></p>"; // 在最終渲染區顯示
            } else if (!thinkBlockEverHadContent) {
                // thinkAreaContainer.style.display = 'none';
            }
            
            generateBtn.disabled = false;
			
            if (generationSuccess && accumulatedExamMarkdown.trim() !== "") {
                exportHtmlBtn.disabled = false; 
                statusArea.textContent = '狀態：試卷已生成。'; 
                statusArea.style.color = '#3c4043'; 
            } else if (generationSuccess && accumulatedExamMarkdown.trim() === "") {
                exportHtmlBtn.disabled = true;
                statusArea.textContent = '狀態：試卷生成完畢，但內容為空。';
                statusArea.style.color = 'orange';
            } else { // generationSuccess is false (即出錯了)
                exportHtmlBtn.disabled = true;
                // statusArea 的錯誤信息和顏色已在 catch 塊中設置
            }
        }
    });
	exportHtmlBtn.addEventListener('click', () => {
		if (!examOutputDiv.innerHTML.trim()) {
			alert("試卷內容為空，無法匯出。");
			return;
		}

		const examTitle = "試卷內容"; 
		let thinkContentHtml = "";
		if (thinkAreaContainer.style.display !== 'none' && thinkOutputDiv.innerHTML.trim()) {
			thinkContentHtml = `
				<details open style="border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 20px; background-color: #f9f9f9;">
					<summary style="padding: 10px 15px; font-weight: 600; cursor: pointer; background-color: #efefef; border-bottom: 1px solid #e0e0e0; border-radius: 6px 6px 0 0;">LLM 思考過程</summary>
					<div style="padding: 15px; max-height: none; overflow-y: visible; background-color: #ffffff; border-radius: 0 0 6px 6px; font-size: 0.9em; color: #444;">
						${thinkOutputDiv.innerHTML}
					</div>
				</details>
			`;
		}
		
		const examContentHtml = examOutputDiv.innerHTML;

		let styles = `
			body { font-family: sans-serif; margin: 20px; line-height: 1.6; }
			.markdown-body { box-sizing: border-box; min-width: 200px; margin: 0 auto; padding: 10px 0; }
			.markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1.2em; margin-bottom: 0.6em; font-weight: 600; }
			.markdown-body p { margin-bottom: 0.8em; }
			.markdown-body ul, .markdown-body ol { margin-bottom: 0.8em; padding-left: 2em; }
			.markdown-body pre { background-color: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; margin-bottom: 1em; border: 1px solid #ddd;}
			.markdown-body code { font-family: monospace; background-color: #e8e8e8; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em;}
			.markdown-body pre code { background-color: transparent; padding: 0; border: none; font-size: 1em;}
			@media print { 
				body { margin: 1cm; } 
				button, .export-controls, .left-panel, #statusArea, details summary { display: none !important; } 
				.right-panel, .container { width: 100% !important; display: block !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
				details[open] { page-break-inside: avoid; } 
				.markdown-body { max-width: none; }
				#thinkAreaContainer, #examOutput { overflow-y: visible !important; max-height: none !important;}
			}
		`;
		
		const fullHtml = `
			<!DOCTYPE html>
			<html lang="zh-TW">
			<head>
				<meta charset="UTF-8">
				<title>${examTitle} - 可列印</title>
				<style>${styles}</style>
			</head>
			<body>
				<h1>${examTitle}</h1>
				${thinkContentHtml}
				<div class="markdown-body">${examContentHtml}</div>
			</body>
			</html>
		`;

		const printWindow = window.open('', '_blank');
		printWindow.document.open();
		printWindow.document.write(fullHtml);
		printWindow.document.close();
	});	
});