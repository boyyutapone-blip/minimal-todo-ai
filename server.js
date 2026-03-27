import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// 1. 初始化环境变量
dotenv.config();

// 2. 初始化 Express 应用
const app = express();
const PORT = 3001;

// 3. 全局中间件
app.use(cors()); // 允许跨域
app.use(express.json()); // 解析 JSON 请求体

// 4. 初始化通义千问大模型客户端
const dashscopeClient = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

// ============================================
// 工具函数 (从原文件移植)
// ============================================

// 生成反思提问 Prompt (来自 generate-reflection.ts)
function buildCoachPrompt(title, quadrant, tags) {
  const tagStr = tags && tags.length > 0 ? tags.join('、') : '无';
  
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

// 生成语音解析 Prompt (来自 parse-task.ts)
function buildSystemPrompt() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'long',
    hour12: false
  });
  const timeStr = formatter.format(now);

  return `你是一个顶级的个人效能助理。用户的初衷是"降低摩擦力"，他们通常会在清晨一口气通过语音输入全天的多个计划（可能包含4-5个完全不同的任务）。
当前用户的本地绝对时间是（东八区 UTC+8）：${timeStr}。

请精准解析这段高密度的语音输入，并返回一个 JSON 数组（Array of Objects），不要有任何 Markdown 标记或多余文字。

【核心解析法则】
1. 多任务精准拆分：仔细甄别语音中的"时间节点转移"（如：上午...下午...然后...）或"场景转移"。必须将全天的不同计划拆分为独立的任务对象。
2. 复合动作防拆死锁：虽然要拆分不同任务，但针对同一场景、同一时间段内的连续复合动作（如："回家拿快递"、"去财务室贴发票"、"去食堂吃午饭"），必须保持高度内聚，将其作为单个任务的 title，绝对禁止把"回家"和"拿快递"拆成两条！
3. 时间与上下文推导（⚠️ 最关键规则）：
   - 必须以提供的当前时间为基准进行推算。
   - ⚠️ due_date 代表"任务开始时间"，而非截止时间！例如用户说"早上10点到12点修改简历"，due_date 应该是 10:00（开始时间），而不是 12:00（结束时间）。
   - ⚠️ 当用户提到时间范围（如"10点到12点"、"下午2点到4点"），始终取时间范围的起始时间作为 due_date。
   - 如果用户连续说"上午10点开会，然后写总结"，即使"写总结"没说时间，也要根据上下文推导它发生在10点之后。
   - 所有的 due_date 必须严格返回东八区 ISO 8601 格式：YYYY-MM-DDTHH:mm:ss+08:00。未提及或无法推导时间的设为 null。

每个对象包含以下字段：
- title: 任务名称（精炼，不带时间词）。
- quadrant: 从 'q1', 'q2', 'q3', 'q4' 中单选（q1=紧急重要, q2=重要不紧急, q3=紧急不重要, q4=不紧急不重要）。
- tags: 提取 1-2 个标签，组成数组（如 ["工作", "会议"]）。
- is_important: 提及"必须"、"重点"、"一定要"或核心工作时设为 true。
- due_date: 任务开始时间，绝对 ISO 时间字符串带时区 (+08:00) 或 null。

JSON 示例：
[
  {"title": "产品周会", "quadrant": "q1", "tags": ["工作"], "is_important": true, "due_date": "2026-03-13T10:00:00+08:00"},
  {"title": "写竞品分析文档", "quadrant": "q2", "tags": ["规划"], "is_important": false, "due_date": "2026-03-13T14:00:00+08:00"},
  {"title": "回家拿快递", "quadrant": "q4", "tags": ["生活"], "is_important": false, "due_date": "2026-03-13T18:00:00+08:00"}
]`;
}

// 解析 AI 放回的带 Markdown 符号的 JSON
function cleanAIResponse(raw) {
  let text = raw.trim();
  const jsonMatch = text.match(/[\{\[][\s\S]*[\}\]]/);
  if (!jsonMatch) {
    throw new Error("解析失败：未能从大模型返回结果中找到有效的 JSON 边界（{}或[]）。原始返回：" + raw);
  }
  const jsonString = jsonMatch[0];
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON 格式错误，脏字符串：", jsonString);
    throw new Error(`JSON 解析异常: ${error.message}`);
  }
}

// 规范化任务属性
const VALID_QUADRANTS = ['q1', 'q2', 'q3', 'q4'];
function sanitizeTask(raw, fallbackTitle) {
  return {
    title: String(raw.title || fallbackTitle),
    quadrant: VALID_QUADRANTS.includes(raw.quadrant) ? raw.quadrant : 'q1',
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    is_important: Boolean(raw.is_important),
    due_date: typeof raw.due_date === 'string' ? raw.due_date : null,
  };
}

// ============================================
// 核心 API 路由
// ============================================

// 1. AI 辅助复盘接口
app.post('/api/generate-reflection', async (req, res) => {
  try {
    const { title, quadrant, tags } = req.body;

    if (!title) {
      return res.status(400).json({ error: '缺少任务标题' });
    }
    
    if (!process.env.DASHSCOPE_API_KEY) {
      return res.status(500).json({ error: '服务器未配置 DASHSCOPE_API_KEY' });
    }

    const systemPrompt = buildCoachPrompt(title, quadrant, tags || []);

    const completion = await dashscopeClient.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请为任务“${title}”生成复盘引导问题。` },
      ],
      temperature: 0.6,
    });

    const questions = completion.choices[0]?.message?.content?.trim();

    if (!questions) {
      return res.status(500).json({ error: 'AI 未返回有效问题' });
    }

    return res.status(200).json({ questions });
  } catch (error) {
    console.error('API Error (/generate-reflection):', error?.message);
    return res.status(500).json({ error: 'Internal Server Error', detail: error?.message });
  }
});

// 2. 语音/文本高密度任务解析接口
app.post('/api/parse-task', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: '请提供 text 字段' });
    }

    if (!process.env.DASHSCOPE_API_KEY) {
      return res.status(500).json({ error: '服务器未配置 DASHSCOPE_API_KEY' });
    }

    const systemPrompt = buildSystemPrompt();

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
    } catch (e) {
      return res.status(500).json({ error: e.message, raw: content });
    }

    const tasksArray = Array.isArray(parsed) ? parsed : [parsed];
    const results = tasksArray.map((item) => sanitizeTask(item, text));

    return res.status(200).json(results);
  } catch (error) {
    console.error('API Error (/parse-task):', error?.message);
    return res.status(500).json({ error: 'Internal Server Error', detail: error?.message });
  }
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Minimal Todo AI Backend is running!' });
});

// 5. 启动服务器
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Minimal Todo Backend is running!`);
  console.log(`📡 Local Access: http://localhost:${PORT}`);
  console.log(`=========================================`);
});
