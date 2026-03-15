import OpenAI from 'openai';

const dashscopeClient = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// 动态构建千面教练的 Prompt
function buildCoachPrompt(title: string, quadrant: string, tags: string[]): string {
  const tagStr = tags.length > 0 ? tags.join('、') : '无';
  
  return `你现在是用户的“个人效能与情绪价值教练”。用户刚刚完成（或正在复盘）一个任务，请你根据任务的属性，生成 2-3 个极简、口语化、直击灵魂的追问，引导用户进行复盘。

【当前任务信息】
- 任务名称：${title}
- 四象限属性：${quadrant} (q1=重要紧急, q2=重要不紧急, q3=不重要紧急, q4=不重要不紧急)
- 标签：${tagStr}

【提问策略】
1. 如果是“工作/学习/硬核技能”（如：学习Langchain、写代码）：化身“费曼教练”。问他最大的Aha Moment是什么？卡壳的地方在哪？下一步怎么破局？
2. 如果是“娱乐/生活/放松”（如：看NBA、剧本杀、散步）：化身“情绪搭子”。问他今天开心吗？有什么小确幸？给自己充好电了吗？
3. 如果是“跑腿/重复性家务”：化身“效率黑客”。问他做这件事烦不烦？下次能不能外包或者用工具自动化搞定？

【输出要求】
- 绝对不要说废话（如“好的，这是为你生成的复盘”），直接输出这 2-3 个问题。
- 每行一个问题，前面加上 Emoji 装饰，排版要精美，适合直接插入到文本框中让用户作答。
- 语气要像一个懂他的老朋友，不要像冷冰冰的机器。`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { title, quadrant, tags } = req.body;

    if (!title) {
      return res.status(400).json({ error: '缺少任务标题' });
    }

    const systemPrompt = buildCoachPrompt(title, quadrant, tags || []);

    const completion = await dashscopeClient.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请为任务“${title}”生成复盘引导问题。` },
      ],
      temperature: 0.6, // 稍微提高一点温度，让提问更有灵性和人情味
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