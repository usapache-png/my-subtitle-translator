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
  const [status, setStatus] = useState('等待上传...');
  const [engine, setEngine] = useState('google');
  const [apiKey, setApiKey] = useState('');

  // 极速全量翻译函数
  const fastTranslate = async (textArray) => {
    // 将数组转化为带编号的字符串，防止大模型漏行
    const numberedText = textArray.map((t, i) => `[${i}] ${t}`).join('\n');
    
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个字幕翻译引擎。请将以下带编号的英文翻译成中文。保持 [编号] 不变。只输出翻译结果，禁止任何解释。" },
          { role: "user", content: numberedText }
        ],
        temperature: 0.1
      })
    });
    
    const data = await response.json();
    const resultText = data.choices[0].message.content;
    
    // 解析回数组
    const translatedArray = new Array(textArray.length).fill("");
    resultText.split('\n').forEach(line => {
      const match = line.match(/^\[(\d+)\]\s*(.*)/);
      if (match) {
        const index = parseInt(match[1]);
        translatedArray[index] = match[2];
      }
    });
    return translatedArray;
  };

  const formatSrtTime = (srtTime) => {
    let [hms, ms] = srtTime.trim().split(',');
    return `${parseInt(hms.split(':')[0], 10)}:${hms.split(':')[1]}:${hms.split(':')[2]}.${ms.substring(0, 2)}`;
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatus('正在极速翻译中...');
    const reader = new FileReader();

    reader.onload = async (event) => {
      const blocks = event.target.result.trim().split(/\n\s*\n/);
      const originalTexts = [];
      const validBlocks = [];

      // 1. 预处理：提取所有文本
      blocks.forEach(block => {
        const lines = block.split('\n').map(l => l.trim());
        const timeIndex = lines.findIndex(l => l.includes('-->'));
        if (timeIndex !== -1 && lines[timeIndex + 1]) {
          validBlocks.push({
            time: lines[timeIndex],
            text: lines.slice(timeIndex + 1).join(' ')
          });
          originalTexts.push(lines.slice(timeIndex + 1).join(' '));
        }
      });

      try {
        let translatedTexts = [];
        if (engine === 'deepseek') {
          // 发送全量请求
          translatedTexts = await fastTranslate(originalTexts);
        } else {
          // Google 免费版不支持超长文本，只能走旧的缓慢逻辑
          alert("免费版无法秒速处理，请使用 DeepSeek API");
          setLoading(false);
          return;
        }

        // 2. 组装 ASS
        let assEvents = "";
        validBlocks.forEach((block, i) => {
          const [startRaw, endRaw] = block.time.split('-->');
          const start = formatSrtTime(startRaw);
          const end = formatSrtTime(endRaw);
          const zh = translatedTexts[i] || block.text;

          assEvents += `Dialogue: 0,${start},${end},Secondary,NTP,0000,0000,0000,,${zh}\n`;
          assEvents += `Dialogue: 0,${start},${end},Default,NTP,0000,0000,0000,,${block.text}\n`;
        });

        const blob = new Blob([ASS_HEADER + assEvents], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name.replace('.srt', '.ass');
        link.click();
        setStatus('秒杀完成！');
      } catch (err) {
        console.error(err);
        setStatus('翻译失败，请检查 API Key');
      }
      setLoading(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="container">
      <h1>⚡️ 秒级双语翻译</h1>
      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <select value={engine} onChange={(e) => setEngine(e.target.value)} className="select-style">
          <option value="deepseek">DeepSeek (全量秒切)</option>
          <option value="google">Google (逐行慢搬)</option>
        </select>
        {engine === 'deepseek' && (
          <input 
            type="password" 
            placeholder="输入 API Key" 
            value={apiKey} 
            onChange={(e) => setApiKey(e.target.value)}
            className="input-style"
          />
        )}
      </div>

      <div className="upload-area">
        <input type="file" accept=".srt" onChange={processFile} disabled={loading} />
        {loading ? "正在处理全量数据..." : "上传 SRT，瞬间完成"}
      </div>
      <p style={{marginTop:'10px'}}>{status}</p>
    </div>
  );
}
