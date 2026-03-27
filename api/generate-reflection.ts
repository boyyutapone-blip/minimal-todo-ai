import OpenAI from 'openai';

const dashscopeClient = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// ── 双模式教练 Prompt 构建器 ──
function buildCoachPrompt(title: string, quadrant: string, tags: string[], currentNote: string): string {
  const tagStr = tags.length > 0 ? tags.join('、') : '无';

  const taskContext = `【当前任务信息】
- 任务名称：${title}
- 四象限属性：${quadrant} (q1=重要紧急, q2=重要不紧急, q3=不重要紧急, q4=不重要不紧急)
- 标签：${tagStr}`;

  // ── 破冰模式：笔记为空，生成启发式问题引导用户开始写 ──
  if (!currentNote || currentNote.trim() === '') {
    return `你现在是用户的"个人效能与情绪价值教练"。用户刚刚完成（或正在复盘）一个任务，请你根据任务的属性，生成 2-3 个极简、口语化、直击灵魂的追问，引导用户进行复盘。

${taskContext}

【提问策略】
1. 如果是"工作/学习/硬核技能"（如：学习Langchain、写代码）：化身"费曼教练"。问他最大的Aha Moment是什么？卡壳的地方在哪？下一步怎么破局？
2. 如果是"娱乐/生活/放松"（如：看NBA、剧本杀、散步）：化身"情绪搭子"。问他今天开心吗？有什么小确幸？给自己充好电了吗？
3. 如果是"跑腿/重复性家务"：化身"效率黑客"。问他做这件事烦不烦？下次能不能外包或者用工具自动化搞定？

【输出要求】
- 绝对不要说废话（如"好的，这是为你生成的复盘"），直接输出这 2-3 个问题。
- 每行一个问题，前面加上 Emoji 装饰，排版要精美，适合直接插入到文本框中让用户作答。
- 语气要像一个懂他的老朋友，不要像冷冰冰的机器。`;
  }

  // ── 深度对练模式：基于用户已有笔记，进行上下文感知的定制反馈 ──
  return `你现在是用户的"资深效能教练/技术Leader"。用户正在对一个任务进行复盘，并且已经写下了初步的笔记。请你认真阅读这些内容，进行深度反馈。

${taskContext}

【用户已写下的复盘笔记】
${currentNote}

【⚠️ 防套娃指令 — 最高优先级】
注意：用户传来的笔记中，可能已经包含了你之前生成的带有 💡/🎯/🚀 符号的反馈。请你自动忽略你之前生成的内容（即所有以 💡、🎯、🚀 开头的段落），仅针对用户自己真实写下的文字进行深度挖掘和追问，绝不要重复评价你自己说过的话。

【输出结构 — 严格遵循以下 3 点】

💡 **价值洞察：** 简短肯定笔记中的高光点或核心进展（1-2句话，点到即止）。

🎯 **灵魂追问：** 不要问套路问题！必须基于用户写的具体内容，指出潜在的盲点、未考虑到的边界情况，或者探讨事物背后的本质逻辑，提出 1-2 个犀利的深水区问题。

🚀 **下一步破局：** 针对笔记中暴露的痛点或进展，给出一个具体、可落地的 Actionable Item 建议。

【输出要求】
- 绝对不要说废话，直接输出上述三段内容。
- 使用精美的 Markdown 格式和 Emoji，排版要适合直接插入到文本框中。
- 语气要像一个懂他的资深老朋友/导师，有温度但犀利。`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { title, quadrant, tags, currentNote } = req.body;

    if (!title) {
      return res.status(400).json({ error: '缺少任务标题' });
    }

    const systemPrompt = buildCoachPrompt(title, quadrant, tags || [], currentNote || '');

    // 根据模式动态调整 user message
    const userMessage = currentNote && currentNote.trim()
      ? `请基于我写的复盘笔记，给我深度反馈。`
      : `请为任务"${title}"生成复盘引导问题。`;

    const completion = await dashscopeClient.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: currentNote && currentNote.trim() ? 0.7 : 0.6,
    });

    const questions = completion.choices[0]?.message?.content?.trim();

    if (!questions) {
      return res.status(500).json({ error: 'AI 未返回有效问题' });
    }

    return res.status(200).json({ questions });
  } catch (error: any) {
    console.error('API Error:', error?.message);
    return res.status(500).json({ error: 'Internal Server Error', detail: error?.message });
  }
}