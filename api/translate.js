export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  const { group, apiKey } = req.body;
  // 关键：明确告诉 AI 必须按行翻译，禁止合并
  const payload = group.map((item, idx) => `ID:${idx} | Text:${item.text}`).join('\n');

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a professional subtitle translator. Translate the text to Chinese. Keep the 'ID:number |' prefix. Translate line by line. DO NOT merge lines. One line of input = One line of output." },
          { role: "user", content: payload }
        ],
        temperature: 0.1
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
