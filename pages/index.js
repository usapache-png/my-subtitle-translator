import { useState, useRef, useEffect } from 'react';

const ASS_HEADER = `[Script Info]\nTitle: Bilingual\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans,70,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\nStyle: Secondary,Noto Sans,55,&H003CF7F4,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [engine, setEngine] = useState('google');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('等待上传');
  const [resultUrl, setResultUrl] = useState(null);
  const resultRef = useRef(""); // 核心：内存实时存盘

  const formatTime = (t) => {
    if (!t) return "0:00:00.00";
    const parts = t.trim().replace(',', '.').split(':');
    const h = parseInt(parts[0] || 0);
    const m = parts[1] || '00';
    const s = (parts[2] || '00.00').padEnd(5, '0').substring(0, 5);
    return `${h}:${m}:${s}`;
  };

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
    setLoading(true);
    resultRef.current = "";
    setResultUrl(null);
    setStatus('解析文件中...');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const blocks = ev.target.result.trim().split(/\r?\n\s*\r?\n/).filter(b => b.includes('-->'));
      const data = blocks.map(b => {
        const lines = b.split(/\r?\n/).map(l => l.trim());
        const tIdx = lines.findIndex(l => l.includes('-->'));
        return { time: lines[tIdx], text: lines.slice(tIdx + 1).join(' ') };
      });

      try {
        if (engine === 'deepseek') {
          const chunkSize = 60;
          for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            setStatus(`DeepSeek 正在翻译: ${i} - ${Math.min(i + chunkSize, data.length)} 行...`);
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
            
            chunk.forEach((item, idx) => {
              const [s, eTime] = item.time.split('-->');
              const zh = map[idx] || "[Error]";
              resultRef.current += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
              resultRef.current += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
            });
          }
        } else {
          for (let i = 0; i < data.length; i++) {
            setStatus(`Google 进度: ${i + 1} / ${data.length}`);
            const item = data[i];
            const zh = await googleTranslate(item.text);
            const [s, eTime] = item.time.split('-->');
            resultRef.current += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            resultRef.current += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
            if (i % 20 === 0) { // 每20条刷新一下下载链接，防止浏览器卡死
                setResultUrl(URL.createObjectURL(new Blob([ASS_HEADER + resultRef.current], { type: 'text/plain' })));
            }
          }
        }
        
        const finalBlob = new Blob([ASS_HEADER + resultRef.current], { type: 'text/plain' });
        setResultUrl(URL.createObjectURL(finalBlob));
        setStatus('全部翻译完成！请点击下方按钮下载');
      } catch (err) {
        setStatus('出错停止：' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '100vh', padding: '40px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '500px', margin: '0 auto', background: '#111', padding: '30px', borderRadius: '15px', border: '1px solid #333' }}>
        <h2 style={{ textAlign: 'center' }}>🎥 稳如老狗翻译器 5.0</h2>
        
        <select value={engine} onChange={e => setEngine(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#222', color: '#fff', borderRadius: '8px' }}>
          <option value="google">Google 模式 (一行一行搬，最稳)</option>
          <option value="deepseek">DeepSeek 模式 (多行一次搬，最快)</option>
        </select>

        {engine === 'deepseek' && (
          <input type="password" placeholder="DeepSeek API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', background: '#222', color: '#fff', border: '1px solid #444', boxSizing: 'border-box' }} />
        )}

        <div style={{ border: '2px dashed #444', padding: '30px', textAlign: 'center', borderRadius: '10px', position: 'relative' }}>
          <input type="file" accept=".srt" onChange={processFile} disabled={loading} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
          {loading ? status : "第一步：点击这里上传 SRT"}
        </div>

        {resultUrl && (
          <div style={{ marginTop: '30px', textAlign: 'center' }}>
            <p style={{ color: '#0070f3' }}>第二步：随时点击下方下载👇</p>
            <a href={resultUrl} download="subtitle.ass" style={{ display: 'block', padding: '15px', background: '#0070f3', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
              下载已生成的 .ASS 文件
            </a>
            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>如果翻译没完，也可以先下载已经翻译出来的部分</p>
          </div>
        )}
      </div>
    </div>
  );
}
