import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });

const app = express();
app.use(express.json());

// ============================================
// 通义千问 (DashScope) — OpenAI 兼容格式
// ============================================
const dashscopeClient = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// ============================================
// 动态生成 System Prompt（注入当前时间）
// ============================================
function buildSystemPrompt(): string {
  const now = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const timeStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]} ${now.toTimeString().slice(0, 8)}`;

  return `你是一个精准的时间管理大师。当前时间是：${timeStr}。
请将用户的语音输入拆解为所有独立的任务。你必须且只能返回一个 JSON 数组（Array of Objects），不要有任何 Markdown 标记或多余文字。
每个对象包含以下字段：
- title: 任务名称。
- quadrant: 根据艾森豪威尔矩阵判断，严格从 'q1'(重要紧急), 'q2'(重要不紧急), 'q3'(不重要紧急), 'q4'(不重要不紧急) 中单选。注意必须是小写。
- tags: 根据语境提取 1-2 个极简的词语作为标签（放入数组，如 ["工作", "会议"]），如果没有则为空数组。
- is_important: 如果语气极其强调、紧迫或提及核心关键指标，设为 true，否则为 false。
- due_date: 绝对 ISO 时间字符串（YYYY-MM-DDTHH:mm:ss.sssZ）。如果用户提到时间（如"明天下午"、"后天上午十点"），请结合当前时间计算出准确的绝对时间；如果未提及，则设为 null。

JSON 示例：
[{"title": "产品会议", "quadrant": "q1", "tags": ["工作", "会议"], "is_important": true, "due_date": "${now.toISOString()}"},
 {"title": "阅读技术文档", "quadrant": "q2", "tags": ["学习"], "is_important": false, "due_date": null}]`;
}

// ============================================
// 清洗大模型返回内容中的 Markdown 标记
// ============================================
function cleanAIResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')   // 开头的 ```json
    .replace(/```\s*$/g, '')            // 结尾的 ```
    .replace(/^```(?:json)?\s*/gim, '') // 内嵌的 ```json
    .replace(/```\s*/g, '')             // 内嵌的 ```
    .trim();
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
// POST /api/parse-task
// 纯 AI 解析 → 返回任务数组，不做数据库写入
// ============================================
app.post('/api/parse-task', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: '请提供 text 字段（语音转文本内容）' });
    }

    if (!process.env.DASHSCOPE_API_KEY) {
      return res.status(500).json({ error: '服务器未配置 DASHSCOPE_API_KEY' });
    }

    // 动态构建带时间上下文的 System Prompt
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

    // 清洗 Markdown 标记 → 解析 JSON
    let parsed;
    try {
      const cleaned = cleanAIResponse(content);
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('AI 返回内容无法解析为 JSON:', content);
      return res.status(500).json({
        error: 'AI 返回内容无法解析为 JSON',
        raw: content,
      });
    }

    // 统一处理为数组（兼容单对象返回）
    const tasksArray = Array.isArray(parsed) ? parsed : [parsed];

    // 校验每个任务
    const results = tasksArray.map((item: any) => sanitizeTask(item, text));

    return res.json(results);
  } catch (error: any) {
    console.error('parse-task error:', error?.message || error);
    return res.status(500).json({ error: '服务器内部错误', detail: error?.message });
  }
});

// ============================================
// 启动服务
// ============================================
const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API server running at http://localhost:${PORT}`);
});
