import { useState } from 'react';
import translate from "translate";

// 配置翻译引擎，默认使用 google (免费版)
translate.engine = "google"; 

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

  // 时间格式转换函数：00:00:04,400 -> 0:00:04.40
  const formatSrtTime = (srtTime) => {
    let [hms, ms] = srtTime.trim().split(',');
    // 确保小时位只有一位（根据你的示例 0:00:00.00）
    const parts = hms.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const s = parts[2];
    // 毫秒转为2位
    const finalMs = ms.substring(0, 2);
    return `${h}:${m}:${s}.${finalMs}`;
  };

  const processFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatus('正在读取文件...');
    const reader = new FileReader();

    reader.onload = async (event) => {
      const content = event.target.result;
      // 按照空行分割 SRT 块
      const blocks = content.trim().split(/\n\s*\n/);
      let assEvents = "";

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].split('\n').map(l => l.trim());
        
        // 寻找包含时间轴的行
        const timeLineIndex = lines.findIndex(l => l.includes('-->'));
        
        if (timeLineIndex !== -1) {
          const timeLine = lines[timeLineIndex];
          const rawText = lines.slice(timeLineIndex + 1).join(' '); // 合并多行文本为一行

          if (rawText) {
            const [startRaw, endRaw] = timeLine.split('-->');
            const start = formatSrtTime(startRaw);
            const end = formatSrtTime(endRaw);

            try {
              // 执行翻译
              const translated = await translate(rawText, { from: "en", to: "zh" });
              
              // 按照你的要求输出：Secondary样式(中文)在前，Default样式(英文)在后
              assEvents += `Dialogue: 0,${start},${end},Secondary,NTP,0000,0000,0000,,${translated}\n`;
              assEvents += `Dialogue: 0,${start},${end},Default,NTP,0000,0000,0000,,${rawText}\n`;
            } catch (error) {
              console.error("翻译出错:", error);
              assEvents += `Dialogue: 0,${start},${end},Default,NTP,0000,0000,0000,,${rawText}\n`;
            }
          }
        }

        // 更新进度
        const currentProgress = Math.round(((i + 1) / blocks.length) * 100);
        setProgress(currentProgress);
        setStatus(`正在翻译: ${currentProgress}%`);
      }

      const finalContent = ASS_HEADER + assEvents;
      downloadResult(finalContent, file.name.replace('.srt', '.ass'));
      setLoading(false);
      setStatus('处理完成！文件已下载');
    };

    reader.readAsText(file);
  };

  const downloadResult = (data, fileName) => {
    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container">
      <h1>🎬 字幕翻译助手</h1>
      <p>上传英文 .srt，生成双语 .ass 特效字幕</p>
      
      <div className="upload-area">
        <input 
          type="file" 
          accept=".srt" 
          onChange={processFile} 
          disabled={loading} 
        />
        {loading ? "正在拼命翻译中..." : "点击或拖拽 SRT 文件开始"}
      </div>

      {(loading || progress > 0) && (
        <div className="progress-container">
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="status-text">{status}</div>
        </div>
      )}

      {!loading && progress === 100 && (
        <button 
          onClick={() => window.location.reload()} 
          style={{marginTop: '20px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer'}}
        >
          转换另一个
        </button>
      )}
    </div>
  );
}
