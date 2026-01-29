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
  const [apiKey, setApiKey] = useState('');

  // 时间格式转换: 00:00:04,400 -> 0:00:04.40
  const formatSrtTime = (t) => {
    if(!t) return "0:00:00.00";
    const [hms, ms] = t.trim().split(',');
    const p = hms.split(':');
    return `${parseInt(p[0])}:${p[1]}:${p[2]}.${ms?.substring(0,2) || '00'}`;
  };

  // 单组翻译核心函数
  const translateGroup = async (group, key) => {
    const payload = group.map((item, idx) => `${idx}#${item.text}`).join('\n');
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a translator. Translate to Chinese. Output format: ID#Translation. No preamble." },
          { role: "user", content: payload }
        ],
        temperature: 0.1
      })
    });
    const data = await res.json();
    const translations = new Array(group.length).fill("");
    data.choices[0].message.content.split('\n').forEach(line => {
      const [id, ...text] = line.split('#');
      const i = parseInt(id);
      if (!isNaN(i)) translations[i] = text.join('#').trim();
    });
    return translations;
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !apiKey) return alert("请上传文件并填写 API Key");

    setLoading(true);
    setProgress(10);
    const reader = new FileReader();

    reader.onload = async (event) => {
      const blocks = event.target.result.trim().split(/\n\s*\n/);
      const dataStruct = [];

      // 1. 解析 SRT
      blocks.forEach(b => {
        const lines = b.split('\n');
        const tIdx = lines.findIndex(l => l.includes('-->'));
        if (tIdx > -1) {
          dataStruct.push({
            time: lines[tIdx],
            text: lines.slice(tIdx + 1).join(' ').trim()
          });
        }
      });

      // 2. 分组并行 (每组 150 条，最大程度利用带宽)
      const chunkSize = 150;
      const chunks = [];
      for (let i = 0; i < dataStruct.length; i += chunkSize) {
        chunks.push(dataStruct.slice(i, i + chunkSize));
      }

      try {
        setProgress(30);
        // 并发执行所有组
        const results = await Promise.all(chunks.map(c => translateGroup(c, apiKey)));
        setProgress(90);

        // 3. 拼装 ASS
        let assEvents = "";
        chunks.forEach((chunk, cIdx) => {
          chunk.forEach((item, iIdx) => {
            const [s, eTime] = item.time.split('-->');
            const zh = results[cIdx][iIdx] || item.text;
            assEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            assEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          });
        });

        // 下载
        const blob = new Blob([ASS_HEADER + assEvents], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name.replace('.srt', '.ass');
        a.click();
        setProgress(100);
      } catch (err) {
        alert("翻译失败，请检查 API Key 或余额");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="container">
      <h1>⚡ 极速双语翻译</h1>
      <p>基于 DeepSeek 并发引擎</p>
      
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="password" 
          placeholder="粘贴 DeepSeek API Key" 
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="input-style"
          style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#222', border: '1px solid #444', color: '#fff' }}
        />
      </div>

      <div className="upload-area" style={{ position: 'relative', border: '2px dashed #444', padding: '40px', borderRadius: '15px' }}>
        <input 
          type="file" 
          accept=".srt" 
          onChange={processFile} 
          disabled={loading} 
          style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }}
        />
        {loading ? `翻译中 ${progress}%` : "把 SRT 丢进来"}
      </div>

      {loading && (
        <div className="progress-container" style={{ marginTop: '20px' }}>
          <div className="progress-bar-bg" style={{ height: '4px', background: '#333' }}>
            <div className="progress-bar-fill" style={{ width: `${progress}%`, height: '100%', background: '#0070f3', transition: 'width 0.5s' }}></div>
          </div>
        </div>
      )}
    </div>
  );
}
