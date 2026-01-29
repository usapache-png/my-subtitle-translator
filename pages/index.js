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
  const [engine, setEngine] = useState('google');
  const [apiKey, setApiKey] = useState('');

  const formatSrtTime = (t) => {
    if (!t) return "0:00:00.00";
    const cleanT = t.trim().replace(',', '.');
    const parts = cleanT.split(':');
    if (parts.length < 3) return cleanT;
    const h = parseInt(parts[0]);
    return `${h}:${parts[1]}:${parts[2].padEnd(5, '0').substring(0, 5)}`;
  };

  const translateWithDeepSeek = async (group, key) => {
    const payload = group.map((item, idx) => `${idx}#${item.text}`).join('\n');
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "system", content: "Translate to Chinese. Output: ID#Translation. No chat." }, { role: "user", content: payload }],
          temperature: 0.1
        })
      });
      const data = await res.json();
      const results = new Array(group.length).fill("");
      data.choices[0].message.content.split('\n').forEach(line => {
        const [id, ...rest] = line.split('#');
        const i = parseInt(id);
        if (!isNaN(i)) results[i] = rest.join('#').trim();
      });
      return results;
    } catch (e) { return group.map(() => ""); }
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (engine === 'deepseek' && !apiKey) return alert("请填写 DeepSeek API Key");

    setLoading(true);
    setProgress(5);
    const reader = new FileReader();

    reader.onload = async (event) => {
      const content = event.target.result;
      const blocks = content.trim().split(/\n\s*\n/);
      const dataStruct = [];

      blocks.forEach(b => {
        const lines = b.split('\n').map(l => l.trim());
        const tIdx = lines.findIndex(l => l.includes('-->'));
        if (tIdx > -1) {
          dataStruct.push({ time: lines[tIdx], text: lines.slice(tIdx + 1).join(' ') });
        }
      });

      let finalAssEvents = "";
      if (engine === 'deepseek') {
        const chunkSize = 100;
        const chunks = [];
        for (let i = 0; i < dataStruct.length; i += chunkSize) chunks.push(dataStruct.slice(i, i + chunkSize));
        
        const allResults = await Promise.all(chunks.map(c => translateWithDeepSeek(c, apiKey)));
        chunks.forEach((chunk, cIdx) => {
          chunk.forEach((item, iIdx) => {
            const [s, eTime] = item.time.split('-->');
            const zh = allResults[cIdx][iIdx] || "[翻译失败]";
            finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          });
        });
      } else {
        // Google 逐行模式
        for (let i = 0; i < dataStruct.length; i++) {
          const item = dataStruct[i];
          const [s, eTime] = item.time.split('-->');
          const zh = await translate(item.text, { from: "en", to: "zh" }).catch(() => "[Error]");
          finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
          finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          setProgress(Math.round(((i + 1) / dataStruct.length) * 100));
        }
      }

      const blob = new Blob([ASS_HEADER + finalAssEvents], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name.replace('.srt', '.ass');
      a.click();
      setLoading(false);
      setProgress(100);
    };
    reader.readAsText(file);
  };

  return (
    <div className="container">
      <h1>🎬 极速字幕翻译</h1>
      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <select value={engine} onChange={(e) => setEngine(e.target.value)} className="select-style" style={{padding:'10px', borderRadius:'8px', background:'#222', color:'#fff'}}>
          <option value="google">Google 翻译 (免费/慢)</option>
          <option value="deepseek">DeepSeek API (高速/准)</option>
        </select>
        {engine === 'deepseek' && (
          <input type="password" placeholder="DeepSeek API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-style" style={{padding:'10px', background:'#222', border:'1px solid #444', color:'#fff', borderRadius:'8px'}} />
        )}
      </div>
      <div className="upload-area" style={{border:'2px dashed #444', padding:'40px', borderRadius:'15px', textAlign:'center', position:'relative'}}>
        <input type="file" accept=".srt" onChange={processFile} disabled={loading} style={{opacity:0, position:'absolute', inset:0, cursor:'pointer'}} />
        {loading ? `处理中... ${engine === 'google' ? progress + '%' : ''}` : "点击上传 SRT 文件"}
      </div>
      {loading && <div style={{marginTop:'10px', height:'4px', background:'#333', borderRadius:'2px'}}><div style={{width:`${progress}%`, height:'100%', background:'#0070f3', transition:'width 0.3s'}}></div></div>}
    </div>
  );
}
