export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { group, apiKey } = req.body;
  const payload = group.map((item, idx) => `[${idx}]${item.text}`).join('\n');
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "system", content: "Translator. [ID]Translation. No chat." }, { role: "user", content: payload }],
        temperature: 0.1
      })
    });
    const data = await response.json();
    res.status(200).json(data);
  } catch (error) { res.status(500).json({ error: "DeepSeek Error" }); }
}
