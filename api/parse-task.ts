import OpenAI from 'openai';

// ============================================
// 通义千问 (DashScope) — OpenAI 兼容格式
// ============================================
const dashscopeClient = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// ============================================
// 动态生成 System Prompt（专为“清晨高并发输入”场景调优）
// ============================================
function buildSystemPrompt(): string {
  const now = new Date();

  // 强制获取东八区 (UTC+8) 的当前时间字符串
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'long',
    hour12: false
  });
  const timeStr = formatter.format(now);

  return `你是一个顶级的个人效能助理。用户的初衷是“降低摩擦力”，他们通常会在清晨一口气通过语音输入全天的多个计划（可能包含4-5个完全不同的任务）。
当前用户的本地绝对时间是（东八区 UTC+8）：${timeStr}。

请精准解析这段高密度的语音输入，并返回一个 JSON 数组（Array of Objects），不要有任何 Markdown 标记或多余文字。

【核心解析法则】
1. 多任务精准拆分：仔细甄别语音中的“时间节点转移”（如：上午...下午...然后...）或“场景转移”。必须将全天的不同计划拆分为独立的任务对象。
2. 复合动作防拆死锁：虽然要拆分不同任务，但针对同一场景、同一时间段内的连续复合动作（如：“回家拿快递”、“去财务室贴发票”、“去食堂吃午饭”），必须保持高度内聚，将其作为单个任务的 title，绝对禁止把“回家”和“拿快递”拆成两条！
3. 时间与上下文推导：
   - 必须以提供的当前时间为基准进行推算。
   - 如果用户连续说“上午10点开会，然后写总结”，即使“写总结”没说时间，也要根据上下文推导它发生在10点之后。
   - 所有的 due_date 必须严格返回东八区 ISO 8601 格式：YYYY-MM-DDTHH:mm:ss+08:00。未提及或无法推导时间的设为 null。

每个对象包含以下字段：
- title: 任务名称（精炼，不带时间词）。
- quadrant: 从 'q1', 'q2', 'q3', 'q4' 中单选（q1=紧急重要, q2=重要不紧急, q3=紧急不重要, q4=不紧急不重要）。
- tags: 提取 1-2 个标签，组成数组（如 ["工作", "会议"]）。
- is_important: 提及“必须”、“重点”、“一定要”或核心工作时设为 true。
- due_date: 绝对 ISO 时间字符串带时区 (+08:00) 或 null。

JSON 示例：
[
  {"title": "产品周会", "quadrant": "q1", "tags": ["工作"], "is_important": true, "due_date": "2026-03-13T10:00:00+08:00"},
  {"title": "写竞品分析文档", "quadrant": "q2", "tags": ["规划"], "is_important": false, "due_date": "2026-03-13T14:00:00+08:00"},
  {"title": "回家拿快递", "quadrant": "q4", "tags": ["生活"], "is_important": false, "due_date": "2026-03-13T18:00:00+08:00"}
]`;
}

// ============================================
// 清洗大模型返回内容中的 Markdown 标记（正确版）
// ============================================
function cleanAIResponse(raw: string): any {
  // 1. 基础清理：去除首尾的空白字符
  let text = raw.trim();

  // 2. 核心剥离：使用贪婪正则提取从第一个 { 或 [ 到最后一个 } 或 ] 之间的所有内容
  const jsonMatch = text.match(/[\{\[][\s\S]*[\}\]]/);

  if (!jsonMatch) {
    throw new Error("解析失败：未能从大模型返回结果中找到有效的 JSON 边界（{}或[]）。原始返回：" + raw);
  }

  const jsonString = jsonMatch[0];

  // 3. 安全解析
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON 格式错误，提取到的脏字符串为：", jsonString);
    throw new Error(`JSON 解析异常: ${(error as Error).message}`);
  }
}

// ============================================
// 校验并规范化单个任务对象
// ============================================
const VALID_QUADRANTS = ['q1', 'q2', 'q3', 'q4'];

function sanitizeTask(raw: any, fallbackTitle: string) {
  return {
    title: String(raw.title || fallbackTitle),
    quadrant: VALID_QUADRANTS.includes(raw.quadrant) ? raw.quadrant : 'q1',
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    is_important: Boolean(raw.is_important),
    due_date: typeof raw.due_date === 'string' ? raw.due_date : null,
  };
}

// ============================================
// Vercel Serverless Function Handler
// ============================================
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: '请提供 text 字段' });
    }

    if (!process.env.DASHSCOPE_API_KEY) {
      return res.status(500).json({ error: '服务器未配置 DASHSCOPE_API_KEY' });
    }

    const systemPrompt = buildSystemPrompt();

    // 调用通义千问
    const completion = await dashscopeClient.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'AI 未返回有效内容' });
    }

    // 清洗并解析
    let parsed;
    try {
      parsed = cleanAIResponse(content);
    } catch (e: any) {
      return res.status(500).json({ error: e.message, raw: content });
    }

    const tasksArray = Array.isArray(parsed) ? parsed : [parsed];
    const results = tasksArray.map((item: any) => sanitizeTask(item, text));

    return res.status(200).json(results);
  } catch (error: any) {
    console.error('API Error:', error?.message);
    return res.status(500).json({ error: 'Internal Server Error', detail: error?.message });
  }
}