import { useState } from 'react';

const ASS_HEADER = `[Script Info]\nTitle: Fast Bilingual\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans,70,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\nStyle: Secondary,Noto Sans,55,&H003CF7F4,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [apiKey, setApiKey] = useState('');

  const formatTime = (t) => {
    if (!t) return "0:00:00.00";
    const [hms, ms] = t.trim().replace(',', '.').split('.');
    const p = hms.split(':');
    return `${parseInt(p[0] || 0)}:${p[1] || '00'}:${p[2] || '00'}.${(ms || '00').substring(0, 2)}`;
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !apiKey) return alert("请填写 Key 并上传");

    setLoading(true);
    setProgress("读取文件中...");
    const reader = new FileReader();

    reader.onload = async (ev) => {
      const blocks = ev.target.result.split(/\n\s*\n/).filter(b => b.includes('-->'));
      const data = blocks.map(b => {
        const lines = b.split('\n').map(l => l.trim());
        const tIdx = lines.findIndex(l => l.includes('-->'));
        return { time: lines[tIdx], text: lines.slice(tIdx + 1).join(' ') };
      });

      // 并发控制：每 50 条一组
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < data.length; i += chunkSize) chunks.push(data.slice(i, i + chunkSize));

      setProgress(`共 ${chunks.length} 组，开始多线程翻译...`);

      try {
        const results = await Promise.all(chunks.map(async (chunk, idx) => {
          try {
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ group: chunk, apiKey })
            });
            const json = await res.json();
            const content = json.choices?.[0]?.message?.content || "";
            
            // 解析 ID 映射
            const map = {};
            content.split('\n').forEach(line => {
              const match = line.match(/\[(\d+)\](.*)/);
              if (match) map[match[1]] = match[2].trim();
            });
            return chunk.map((item, i) => map[i] || "[Timeout]");
          } catch {
            return chunk.map(() => "[Error]");
          }
        }));

        // 强制组装并下载
        let ass = ASS_HEADER;
        chunks.forEach((chunk, cIdx) => {
          chunk.forEach((item, iIdx) => {
            const [s, eTime] = item.time.split('-->');
            const zh = results[cIdx][iIdx];
            ass += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            assEvents += `Dialogue: 0,${formatTime(s)},${formatTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          });
        });

        const url = URL.createObjectURL(new Blob([ass], { type: 'text/plain' }));
        const a = document.createElement('a');
        a.href = url; a.download = file.name.replace('.srt', '.ass');
        a.click();
        setProgress("完成！已触发下载");
      } catch (err) {
        alert("系统错误，请刷新重试");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="main">
      <div className="card">
        <h2>🚀 极速双语字幕 (4.0 并发版)</h2>
        <input type="password" placeholder="DeepSeek API Key" value={apiKey} onChange={e => setApiKey(e.target.value)} />
        <div className="dropzone">
          <input type="file" onChange={processFile} disabled={loading} />
          {loading ? progress : "点击上传 SRT (400行约20秒)"}
        </div>
      </div>
      <style jsx>{`
        .main { background: #000; color: #fff; height: 100vh; display: flex; align-items: center; justify-content: center; font-family: sans-serif; }
        .card { background: #111; padding: 40px; border-radius: 20px; border: 1px solid #333; width: 400px; text-align: center; }
        input { width: 100%; padding: 12px; margin: 20px 0; background: #222; border: 1px solid #444; color: #fff; border-radius: 8px; }
        .dropzone { border: 2px dashed #444; padding: 40px; border-radius: 12px; position: relative; }
        .dropzone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
      `}</style>
    </div>
  );
}
