const processFile = async (e) => {
    // ... 前面读取文件的代码保持不变 ...
    
    // 1. 将字幕块分组，每 20 条为一组 (Batch)
    const batchSize = 20;
    const groups = [];
    for (let i = 0; i < blocks.length; i += batchSize) {
      groups.push(blocks.slice(i, i + batchSize));
    }

    let assEvents = "";
    for (let j = 0; j < groups.length; j++) {
      setStatus(`正在处理第 ${j + 1}/${groups.length} 组...`);
      
      // 2. 将这一组的文本合并成一个大字符串，用特殊符号分隔
      const currentGroup = groups[j];
      const textsToTranslate = currentGroup.map(b => {
        const lines = b.split('\n');
        return lines.slice(lines.findIndex(l => l.includes('-->')) + 1).join(' ');
      }).filter(t => t.trim() !== "");

      const combinedText = textsToTranslate.join('\n[===]\n');

      try {
        // 3. 一次性翻译一整组
        let translatedCombined;
        if (engine === 'deepseek') {
            translatedCombined = await translateWithDeepSeek(combinedText);
        } else {
            translatedCombined = await translate(combinedText, { from: "en", to: "zh" });
        }

        const translatedParts = translatedCombined.split('[===]').map(t => t.trim());

        // 4. 将翻译好的结果写回 ASS 格式
        currentGroup.forEach((block, index) => {
            const lines = block.split('\n');
            const timeLine = lines.find(l => l.includes('-->'));
            if (timeLine) {
                const [startRaw, endRaw] = timeLine.split('-->');
                const start = formatSrtTime(startRaw);
                const end = formatSrtTime(endRaw);
                const originalText = lines.slice(lines.indexOf(timeLine) + 1).join(' ');
                const zhText = translatedParts[index] || "（翻译失败）";

                assEvents += `Dialogue: 0,${start},${end},Secondary,NTP,0000,0000,0000,,${zhText}\n`;
                assEvents += `Dialogue: 0,${start},${end},Default,NTP,0000,0000,0000,,${originalText}\n`;
            }
        });
      } catch (error) {
        console.error("组翻译失败", error);
      }
      
      setProgress(Math.round(((j + 1) / groups.length) * 100));
    }

      const finalContent = ASS_HEADER + assEvents;
      const blob = new Blob([finalContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name.replace('.srt', '.ass');
      link.click();
      setLoading(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="container">
      <h1>🎬 字幕翻译助手</h1>
      
      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <select 
          value={engine} 
          onChange={(e) => setEngine(e.target.value)}
          style={{ padding: '8px', borderRadius: '5px', background: '#333', color: 'white' }}
        >
          <option value="google">Google 翻译 (免费但有限制)</option>
          <option value="deepseek">DeepSeek API (更准确)</option>
        </select>

        {engine === 'deepseek' && (
          <input 
            type="password" 
            placeholder="输入 DeepSeek API Key" 
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ padding: '8px', borderRadius: '5px', border: '1px solid #444' }}
          />
        )}
      </div>

      <div className="upload-area">
        <input type="file" accept=".srt" onChange={processFile} disabled={loading} />
        {loading ? "翻译中，请勿关闭窗口..." : "上传英文 SRT 文件"}
      </div>

      {loading && (
        <div className="progress-container">
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <div className="status-text">进度: {progress}%</div>
        </div>
      )}
    </div>
  );
}

