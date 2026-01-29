import { useState } from 'react';

const ASS_HEADER = `[Script Info]\nTitle: Bilingual\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans,70,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\nStyle: Secondary,Noto Sans,55,&H003CF7F4,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [engine, setEngine] = useState('google');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('等待上传 SRT');

  const formatTime = (t) => {
    if (!t) return "0:00:00.00";
    const [hms, ms] = t.trim().replace(',', '.').split('.');
    const p = hms.split(':');
    return `${parseInt(p[0] || 0)}:${p[1] || '00'}:${p[2] || '00'}.${(ms || '00').substring(0, 2)}`;
  };

  // 原生 Google 翻译函数（避开库依赖）
  const googleTranslate = async (text) => {
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`);
      const data = await res.json();
      return data[0].map(x => x[0]).join('');
    } catch { return "[Google Error]"; }
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (engine === 'deepseek' && !apiKey) return alert("请先填写 DeepSeek API Key");

    setLoading(true);
    setStatus('正在解析 SRT 文件...');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = ev.target.result;
        const blocks = content.trim().split(/\r?\n\s*\r?\n/).filter(b => b.includes('-->'));
        
        const data = blocks.map(b => {
          const lines = b.split(/\r?\n/).map(l => l.trim());
          const tIdx = lines.findIndex(l => l.includes('-->'));
          return { time: lines[tIdx], text: lines.slice(tIdx + 1).join(' ') };
        });

        if (data.length === 0) throw new Error("无法识别 SRT 格式");

        let assEvents = "";

        if (engine === 'deepseek') {
          const chunkSize = 60;
          const chunks = [];
          for (let i = 0; i < data.length; i += chunkSize) chunks.push(data.slice(i, i + chunkSize));
          
          setStatus(`DeepSeek 正在并发处理 ${chunks.length} 个任务...`);
          const results = await Promise.all(chunks.map(async (chunk) => {
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ group: chunk, apiKey })
            });
            const json = await res.json();
            const map = {};
            (json.choices?.[0]?.message?.content || "").split('\n').forEach(line => {
              const m = line.match(/\[(\d+)\](.*)/);
              if (m) map[m[1]] = m[2].trim();
            });
            return chunk.map((_, i) => map[i] || "[Timeout]");
          }));

          chunks.forEach((chunk, cIdx) => {
            chunk.forEach((item, iIdx) => {
              const [s, eTime] = item.time.split('-->');
              const zh = results[cIdx][iIdx];
              assEvents += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
              assEvents += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
            });
          });
        } else {
          // Google 模式
          for (let i = 0; i < data.length; i++) {
            setStatus(`Google 翻译中: ${i + 1} / ${data.length}`);
            const item = data[i];
            const [s, eTime] = item.time.split('-->');
            const zh = await googleTranslate(item.text);
            assEvents += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            assEvents += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          }
        }

        const url = URL.createObjectURL(new Blob([ASS_HEADER + assEvents], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.replace('.srt', '.ass');
        a.click();
        setStatus('翻译成功！已下载');
      } catch (err) {
        setStatus('出错啦: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ background: '#111', padding: '40px', borderRadius: '24px', border: '1px solid #333', width: '90%', maxWidth: '500px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>🎬 最终修正版翻译器</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <select value={engine} onChange={e => setEngine(e.target.value)} style={{ width: '100%', padding: '12px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '10px' }}>
            <option value="google">Google 翻译 (免费/稳健)</option>
            <option value="deepseek">DeepSeek (高速/需 Key)</option>
          </select>
        </div>

        {engine === 'deepseek' && (
          <input 
            type="password" 
            placeholder="粘贴 DeepSeek API Key" 
            value={apiKey} 
            onChange={e => setApiKey(e.target.value)} 
            style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '10px', boxSizing: 'border-box' }}
          />
        )}

        <div style={{ border: '2px dashed #444', padding: '40px', borderRadius: '15px', textAlign: 'center', cursor: 'pointer', position: 'relative' }}>
          <input type="file" accept=".srt" onChange={processFile} disabled={loading} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          {loading ? (
            <div style={{ color: '#0070f3' }}>{status}</div>
          ) : (
            <div>点击或拖拽上传 SRT<br/><small style={{ color: '#666' }}>支持 400+ 行超长字幕</small></div>
          )}
        </div>
      </div>
    </div>
  );
}
