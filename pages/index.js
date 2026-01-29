import { useState, useRef } from 'react';

const ASS_HEADER = `[Script Info]\nTitle: Bilingual\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans,70,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\nStyle: Secondary,Noto Sans,55,&H003CF7F4,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [engine, setEngine] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('等待上传 SRT');
  const [downloadReady, setDownloadReady] = useState(false);
  const finalAssRef = useRef(""); // 实时保存翻译结果

  const formatTime = (t) => {
    if (!t) return "0:00:00.00";
    const [hms, ms] = t.trim().replace(',', '.').split('.');
    const p = hms.split(':');
    return `${parseInt(p[0] || 0)}:${p[1] || '00'}:${p[2] || '00'}.${(ms || '00').substring(0, 2)}`;
  };

  // Google 批量翻译：一次处理多行
  const googleBatchTranslate = async (texts) => {
    const combined = texts.join(' ||| ');
    try {
      const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(combined)}`);
      const data = await res.json();
      const result = data[0].map(x => x[0]).join('');
      return result.split('|||').map(t => t.trim());
    } catch { return texts.map(() => "[Error]"); }
  };

  const downloadFile = (fileName = "subtitle.ass") => {
    const blob = new Blob([ASS_HEADER + finalAssRef.current], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (engine === 'deepseek' && !apiKey) return alert("DeepSeek 需要填写 Key");

    setLoading(true);
    setDownloadReady(false);
    finalAssRef.current = "";
    setStatus('正在解析...');

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const blocks = ev.target.result.trim().split(/\r?\n\s*\r?\n/).filter(b => b.includes('-->'));
      const data = blocks.map(b => {
        const lines = b.split(/\r?\n/).map(l => l.trim());
        const tIdx = lines.findIndex(l => l.includes('-->'));
        return { time: lines[tIdx], text: lines.slice(tIdx + 1).join(' ') };
      });

      const chunkSize = engine === 'deepseek' ? 80 : 20; // Google 每次传 20 行
      const chunks = [];
      for (let i = 0; i < data.length; i += chunkSize) chunks.push(data.slice(i, i + chunkSize));

      try {
        for (let i = 0; i < chunks.length; i++) {
          setStatus(`正在处理第 ${i + 1}/${chunks.length} 组...`);
          let translations = [];

          if (engine === 'deepseek') {
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ group: chunks[i], apiKey })
            });
            const json = await res.json();
            const map = {};
            (json.choices?.[0]?.message?.content || "").split('\n').forEach(line => {
              const m = line.match(/\[(\d+)\](.*)/);
              if (m) map[m[1]] = m[2].trim();
            });
            translations = chunks[i].map((_, idx) => map[idx] || "[Error]");
          } else {
            translations = await googleBatchTranslate(chunks[i].map(c => c.text));
          }

          // 实时将结果存入 Ref
          chunks[i].forEach((item, idx) => {
            const [s, eTime] = item.time.split('-->');
            const zh = translations[idx];
            finalAssRef.current += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            finalAssRef.current += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          });
          setDownloadReady(true); // 只要有一组成功，就允许点击下载
        }
        downloadFile(file.name.replace('.srt', '.ass'));
        setStatus('全部翻译完成！');
      } catch (err) {
        setStatus('部分失败，您可点击下方按钮导出已完成部分');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ background: '#111', padding: '40px', borderRadius: '20px', width: '450px', border: '1px solid #333' }}>
        <h2 style={{ textAlign: 'center' }}>🎬 稳健型双语翻译器</h2>
        
        <select value={engine} onChange={e => setEngine(e.target.value)} style={{ width: '100%', padding: '12px', background: '#222', color: '#fff', border: '1px solid #444', marginBottom: '15px', borderRadius: '8px' }}>
          <option value="google">Google 批量翻译 (加速版)</option>
          <option value="deepseek">DeepSeek (全量秒切)</option>
        </select>

        {engine === 'deepseek' && (
          <input type="password" placeholder="DeepSeek API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ width: '100%', padding: '12px', background: '#222', color: '#fff', border: '1px solid #444', marginBottom: '15px', borderRadius: '8px', boxSizing: 'border-box' }} />
        )}

        <div style={{ border: '2px dashed #444', padding: '30px', borderRadius: '12px', textAlign: 'center', position: 'relative' }}>
          <input type="file" accept=".srt" onChange={processFile} disabled={loading} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
          {loading ? status : "点击上传 600+ 行 SRT"}
        </div>

        {downloadReady && (
          <button onClick={() => downloadFile()} style={{ width: '100%', marginTop: '20px', padding: '12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            立即导出已翻译部分 (.ass)
          </button>
        )}
      </div>
    </div>
  );
}
