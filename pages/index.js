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
  const [engine, setEngine] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('等待上传');

  const formatSrtTime = (t) => {
    if (!t) return "0:00:00.00";
    const cleanT = t.trim().replace(',', '.');
    const p = cleanT.split(':');
    if (p.length < 3) return cleanT;
    const h = parseInt(p[0] || 0);
    const m = p[1];
    const sWithMs = p[2].padEnd(5, '0').substring(0, 5); // 保证 00.00 格式
    return `${h}:${m}:${sWithMs}`;
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (engine === 'deepseek' && !apiKey) return alert("请填写 API Key");

    setLoading(true);
    setStatus('正在解析字幕结构...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target.result;
      // 更加精准的分割逻辑
      const blocks = content.trim().split(/\r?\n\s*\r?\n/);
      const dataStruct = [];

      blocks.forEach(b => {
        const lines = b.split('\n').map(l => l.trim());
        const tIdx = lines.findIndex(l => l.includes('-->'));
        if (tIdx > -1) {
          const originalText = lines.slice(tIdx + 1).join(' ');
          if (originalText) {
            dataStruct.push({ time: lines[tIdx], text: originalText });
          }
        }
      });

      try {
        let finalAssEvents = "";

        if (engine === 'deepseek') {
          const chunkSize = 50; // 减小尺寸，提高翻译精准度
          const chunks = [];
          for (let i = 0; i < dataStruct.length; i += chunkSize) chunks.push(dataStruct.slice(i, i + chunkSize));

          const allResults = await Promise.all(chunks.map(async (chunk, idx) => {
            setStatus(`正在并发翻译第 ${idx + 1} 组...`);
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ group: chunk, apiKey })
            });
            const data = await res.json();
            
            const translations = new Array(chunk.length).fill("");
            const content = data.choices?.[0]?.message?.content || "";
            content.split('\n').forEach(line => {
              const match = line.match(/ID:(\d+)\s*\|\s*(.*)/i);
              if (match) {
                const i = parseInt(match[1]);
                translations[i] = match[2].replace(/^Text:/i, '').trim();
              }
            });
            return translations;
          }));

          // 组装结果
          chunks.forEach((chunk, cIdx) => {
            chunk.forEach((item, iIdx) => {
              const [s, eTime] = item.time.split('-->');
              const zh = allResults[cIdx][iIdx] || "[翻译失败]";
              finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
              finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
            });
          });
        } else {
          // Google 备用模式 (免费且支持)
          for (let i = 0; i < dataStruct.length; i++) {
            setStatus(`Google 翻译中: ${i+1}/${dataStruct.length}`);
            const item = dataStruct[i];
            const [s, eTime] = item.time.split('-->');
            const zh = await translate(item.text, { from: "en", to: "zh" }).catch(() => "[Error]");
            finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            finalAssEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          }
        }

        const blob = new Blob([ASS_HEADER + finalAssEvents], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name.replace('.srt', '.ass');
        a.click();
        setStatus('搞定！');
      } catch (err) {
        setStatus('失败了，请检查网络或 Key');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="container" style={{maxWidth:'600px', margin:'50px auto', padding:'30px', background:'#1a1a1a', borderRadius:'15px', color:'white'}}>
      <h1 style={{textAlign:'center', fontSize:'24px'}}>🎬 专业双语字幕翻译</h1>
      
      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        <select value={engine} onChange={(e)=>setEngine(e.target.value)} style={{flex:1, padding:'10px', borderRadius:'8px', background:'#333', color:'#fff', border:'none'}}>
          <option value="deepseek">DeepSeek (全量秒切)</option>
          <option value="google">Google (稳健备用)</option>
        </select>
        {engine === 'deepseek' && (
          <input type="password" placeholder="API Key" value={apiKey} onChange={(e)=>setApiKey(e.target.value)} style={{flex:2, padding:'10px', borderRadius:'8px', border:'1px solid #444', background:'#222', color:'#fff'}} />
        )}
      </div>

      <div style={{border:'2px dashed #444', padding:'50px', borderRadius:'12px', textAlign:'center', position:'relative'}}>
        <input type="file" accept=".srt" onChange={processFile} disabled={loading} style={{opacity:0, position:'absolute', inset:0, cursor:'pointer'}} />
        {loading ? status : "把 SRT 文件拖到这里"}
      </div>

      {loading && <div style={{marginTop:'20px', height:'4px', background:'#333', overflow:'hidden'}}><div className="loading-bar"></div></div>}
      
      <style jsx>{`
        .loading-bar {
          width: 100%; height: 100%; background: #0070f3;
          animation: loading 2s infinite linear;
          transform-origin: 0% 50%;
        }
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
