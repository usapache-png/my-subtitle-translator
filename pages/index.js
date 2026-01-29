import { useState } from 'react';
import translate from "translate";

const ASS_HEADER = `[Script Info]
Title: Bilingual Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: Yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans,70,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1
Style: Secondary,Noto Sans,55,&H003CF7F4,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('等待上传...');
  const [engine, setEngine] = useState('google'); // 'google' or 'deepseek'
  const [apiKey, setApiKey] = useState('');

  // DeepSeek 翻译逻辑 (兼容 OpenAI 格式)
  const translateWithDeepSeek = async (text) => {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个专业的字幕翻译专家。请将输入的英文翻译成中文，只输出翻译结果，不要有任何解释。" },
          { role: "user", content: text }
        ],
        temperature: 0.3
      })
    });
    const data = await response.json();
    return data.choices[0].message.content.trim();
  };

  const formatSrtTime = (srtTime) => {
    let [hms, ms] = srtTime.trim().split(',');
    const parts = hms.split(':');
    const h = parseInt(parts[0], 10);
    return `${h}:${parts[1]}:${parts[2]}.${ms.substring(0, 2)}`;
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (engine === 'deepseek' && !apiKey) {
      alert("请先输入 DeepSeek API Key");
      return;
    }

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      const blocks = event.target.result.trim().split(/\n\s*\n/);
      let assEvents = "";

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].split('\n').map(l => l.trim());
        const timeLineIndex = lines.findIndex(l => l.includes('-->'));
        
        if (timeLineIndex !== -1) {
          const timeLine = lines[timeLineIndex];
          const rawText = lines.slice(timeLineIndex + 1).join(' ');

          if (rawText) {
            const [startRaw, endRaw] = timeLine.split('-->');
            const start = formatSrtTime(startRaw);
            const end = formatSrtTime(endRaw);

            try {
              let translated;
              if (engine === 'deepseek') {
                translated = await translateWithDeepSeek(rawText);
                // 适当延时防止 API 并发过高 (DeepSeek 限制)
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                translated = await translate(rawText, { from: "en", to: "zh" });
              }
              
              assEvents += `Dialogue: 0,${start},${end},Secondary,NTP,0000,0000,0000,,${translated}\n`;
              assEvents += `Dialogue: 0,${start},${end},Default,NTP,0000,0000,0000,,${rawText}\n`;
            } catch (error) {
              assEvents += `Dialogue: 0,${start},${end},Default,NTP,0000,0000,0000,,${rawText}\n`;
            }
          }
        }
        setProgress(Math.round(((i + 1) / blocks.length) * 100));
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
