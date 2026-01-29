import { useState } from 'react';

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
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState('等待上传');

  const formatSrtTime = (t) => {
    if (!t) return "0:00:00.00";
    const cleanT = t.trim().replace(',', '.');
    const p = cleanT.split(':');
    return `${parseInt(p[0] || 0)}:${p[1] || '00'}:${p[2] || '00.00'}`;
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !apiKey) return alert("请上传文件并输入 API Key");

    setLoading(true);
    setStatus('正在解析并启动后端翻译...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const blocks = event.target.result.trim().split(/\n\s*\n/);
      const dataStruct = [];

      blocks.forEach(b => {
        const lines = b.split('\n').map(l => l.trim());
        const tIdx = lines.findIndex(l => l.includes('-->'));
        if (tIdx > -1) {
          dataStruct.push({ time: lines[tIdx], text: lines.slice(tIdx + 1).join(' ') });
        }
      });

      // 每 80 条一组，分批并行请求后端
      const chunkSize = 80;
      const chunks = [];
      for (let i = 0; i < dataStruct.length; i += chunkSize) chunks.push(dataStruct.slice(i, i + chunkSize));

      try {
        const allResults = await Promise.all(chunks.map(async (chunk) => {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ group: chunk, apiKey })
          });
          const data = await res.json();
          
          const translations = new Array(chunk.length).fill("");
          const content = data.choices?.[0]?.message?.content || "";
          content.split('\n').forEach(line => {
            const [id, ...rest] = line.split('#');
            const i = parseInt(id);
            if (!isNaN(i)) translations[i] = rest.join('#').trim();
          });
          return translations;
        }));

        let assEvents = "";
        chunks.forEach((chunk, cIdx) => {
          chunk.forEach((item, iIdx) => {
            const [s, eTime] = item.time.split('-->');
            const zh = allResults[cIdx][iIdx] || "[翻译失败]";
            assEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Secondary,NTP,0000,0000,0000,,${zh}\n`;
            assEvents += `Dialogue: 0,${formatSrtTime(s)},${formatSrtTime(eTime)},Default,NTP,0000,0000,0000,,${item.text}\n`;
          });
        });

        const blob = new Blob([ASS_HEADER + assEvents], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name.replace('.srt', '.ass');
        a.click();
        setStatus('处理成功！');
      } catch (err) {
        setStatus('翻译出错，请检查 API Key 余额或网络');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="container" style={{maxWidth:'600px', margin:'50px auto', padding:'20px', fontFamily:'sans-serif'}}>
      <h1 style={{textAlign:'center'}}>⚡️ 极速翻译 (后端代理版)</h1>
      <input 
        type="password" 
        placeholder="输入 DeepSeek API Key" 
        value={apiKey} 
        onChange={(e) => setApiKey(e.target.value)} 
        style={{width:'100%', padding:'12px', marginBottom:'20px', borderRadius:'8px', border:'1px solid #ddd'}}
      />
      <div style={{border:'2px dashed #ccc', padding:'40px', textAlign:'center', cursor:'pointer', position:'relative', borderRadius:'10px'}}>
        <input type="file" accept=".srt" onChange={processFile} disabled={loading} style={{opacity:0, position:'absolute', inset:0}} />
        {loading ? status : "点击这里上传 SRT 文件"}
      </div>
      {loading && <div style={{marginTop:'20px', height:'4px', background:'#eee'}}><div style={{width:'50%', height:'100%', background:'#0070f3'}}></div></div>}
    </div>
  );
}
