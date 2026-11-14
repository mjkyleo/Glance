// Glance AI: on-demand word explanations via OpenAI-compatible LLMs, cached locally + exportable.
(function () {
  // Research-backed provider presets (all expose an OpenAI-compatible /chat/completions).
  const PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek', base: 'https://api.deepseek.com', model: 'deepseek-flash', jsonMode: true },
    { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', jsonMode: true },
    { id: 'anthropic', name: 'Anthropic (Claude)', base: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5', jsonMode: false, anthropic: true },
    { id: 'qwen', name: '通义千问 Qwen', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', jsonMode: true },
    { id: 'glm', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6', jsonMode: true },
    { id: 'kimi', name: 'Kimi (Moonshot)', base: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6', jsonMode: true },
    { id: 'ernie', name: '文心一言 (百度)', base: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-turbo-128k', jsonMode: true },
    { id: 'spark', name: '讯飞星火', base: 'https://spark-api-open.xf-yun.com/v1', model: 'generalv3.5', jsonMode: false },
    { id: 'hunyuan', name: '腾讯混元', base: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbos-latest', jsonMode: true },
    { id: 'minimax', name: 'MiniMax', base: 'https://api.minimaxi.com/v1', model: 'MiniMax-M3.1-Flash', jsonMode: true },
    { id: 'stepfun', name: '阶跃星辰 StepFun', base: 'https://api.stepfun.com/v1', model: 'step-3.5-flash', jsonMode: true },
    { id: 'siliconflow', name: 'SiliconFlow', base: 'https://api.siliconflow.cn/v1', model: '', jsonMode: true },
    { id: 'custom', name: '自定义 (OpenAI 兼容)', base: '', model: '', jsonMode: true, custom: true }
  ];
  function getProvider(id) { return PROVIDERS.find(p => p.id === id) || PROVIDERS[0]; }

  // =====================================================================
  // DEV-ONLY 免费开发 API —— 正式发布前必须移除（见 DEVELOPMENT.md「开发期免费 AI API」）
  // 内置一个免费 OpenAI 兼容端点：开发期在「我的 → AI 解释」选「开发免费」服务商、
  // 开启 AI、Key 留空即可试用。三个模型可选，默认 DeepSeek-V4-Flash（支持 JSON 模式）。
  // 移除方法：删除本整块（DEV_FREE_API 常量 + 下方 if 注入）即可彻底移除；
  //           resolveConfig/effectiveKey 与 UI 里的 devKey/models 回退随之自动失效。
  // 安全提示：此 Key 随客户端代码公开分发，仅作开发便利;发布前务必删除并到服务端作废该 Key
  //           （一旦推送到公开仓库即进入 git 历史，删代码并不能抹除历史）。
  const DEV_FREE_API = {
    id: 'devfree', name: '开发免费（发布前移除）', dev: true,
    base: 'https://developer.amd.com.cn/radeon/api/v1',
    model: 'DeepSeek-V4-Flash',
    models: ['DeepSeek-V4-Flash', 'DeepSeek-V4.1-Flash', 'GLM-5.3-Flash'],
    devKey: 'rc-366f5c9de7c186e94c563c982128f9d5a2d9693450d62f7c',
    jsonMode: true
  };
  if (DEV_FREE_API) PROVIDERS.unshift(DEV_FREE_API);
  // =====================================================================

  const SYSTEM_PROMPT = [
    '你是一名专业的英语词汇教师，面向中国大学生（四六级/考研/托福/雅思/GRE）讲解单词。',
    '请只输出一个 JSON 对象，不要任何额外文字、解释或 Markdown 代码块。字段如下：',
    '{',
    '  "word": "单词原形",',
    '  "ipa": "美式音标（不含斜杠）",',
    '  "cefr": "A1/A2/B1/B2/C1/C2 之一",',
    '  "meanings": [{"pos":"词性(如 n./vt./adj.)","zh":"简体中文释义","en":"简短英文释义"}],',
    '  "morphemes": [{"part":"词素片段","type":"prefix/root/suffix","gloss_zh":"中文含义","gloss_en":"英文含义","note":"构词说明"}],',
    '  "memoryTip": "一句巧记/联想记忆法（简体中文）",',
    '  "collocations": ["常见搭配（英文）"],',
    '  "examples": [{"en":"英文例句","zh":"中文翻译"}],',
    '  "synonyms": ["近义词"],',
    '  "antonyms": ["反义词"],',
    '  "etymology": "词源简述（简体中文）",',
    '  "confusion": [{"word":"易混词","distinction_zh":"与目标词的区别（简体中文）"}]',
    '}',
    '规则：',
    '- meanings 给 1-3 个最常用义项；examples 给 2-3 句地道例句。',
    '- morphemes 仅在单词可拆分时给出（前缀/词根/后缀），不可拆分则返回空数组 []。',
    '- confusion 给 0-3 个易混词，优先同词根或形近词。',
    '- 所有中文用简体中文；不要编造不确定的信息，宁缺毋滥。',
    '- 严格输出合法 JSON，键名与上述完全一致。'
  ].join('\n');

  function userPrompt(word, entry) {
    const lines = ['请讲解单词：' + word];
    if (entry && entry.meaning) lines.push('参考释义：' + entry.meaning);
    const root = entry && (entry.root || (entry.rootFamily && entry.rootFamily.root));
    if (root) lines.push('词根：' + root);
    return lines.join('\n');
  }

  // Defensive JSON extraction: strip fences, slice first { … last }, validate.
  function parseJson(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    t = t.slice(a, b + 1);
    let obj;
    try { obj = JSON.parse(t); } catch { return null; }
    if (!obj || typeof obj !== 'object') return null;
    if (!Array.isArray(obj.meanings) || !obj.meanings.length) return null;
    return obj;
  }

  function resolveConfig(cfg) {
    const p = getProvider(cfg.provider);
    const base = p.custom ? (cfg.base || '') : p.base;
    const model = (cfg.model || '').trim() || p.model;
    const key = (cfg.key || '').trim() || p.devKey || '';
    return { base, model, key, jsonMode: p.jsonMode, anthropic: !!p.anthropic, provider: p };
  }
  // Effective key = user-entered key, else a provider's built-in dev key (DEV-ONLY).
  function effectiveKey(cfg) { return resolveConfig(cfg || {}).key; }

  // Generate an explanation. Retries once on parse failure. Returns { ok, data, provider, model } | { ok:false, error }.
  async function explainWord(word, entry, cfg) {
    const rc = resolveConfig(cfg || {});
    if (!rc.key) return { ok: false, error: '请先在设置中填写 API Key' };
    if (!rc.base) return { ok: false, error: '请填写 API 地址（Base URL）' };
    if (!rc.model) return { ok: false, error: '请填写模型名称' };
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(word, entry) }];
    const args = { base: rc.base, key: rc.key, model: rc.model, messages, temperature: 0.3, jsonMode: rc.jsonMode, anthropic: rc.anthropic };
    let res = await Platform.llmChat(args);
    if (!res.ok) return { ok: false, error: res.error };
    let data = parseJson(res.content);
    if (!data) {
      res = await Platform.llmChat(args);
      if (res.ok) data = parseJson(res.content);
    }
    if (!data) return { ok: false, error: 'AI 返回格式无法解析，请重试或更换模型' };
    data.word = data.word || word;
    return { ok: true, data, provider: cfg.provider, model: rc.model };
  }

  // Export all cached explanations as a JSON file.
  async function exportCache() {
    const cache = Store.data.aiCache || {};
    const words = Object.keys(cache);
    if (!words.length) return { ok: false, error: '还没有任何 AI 解释可导出' };
    const payload = { app: 'Glance', kind: 'ai-explanations', exportedAt: new Date().toISOString(), count: words.length, explanations: cache };
    const name = 'glance-ai-explanations-' + Store.today() + '.json';
    const saved = await Platform.saveTextFile(name, JSON.stringify(payload, null, 2));
    return saved ? { ok: true, count: words.length } : { ok: false, error: '已取消导出' };
  }

  window.AI = { PROVIDERS, getProvider, resolveConfig, effectiveKey, explainWord, parseJson, exportCache, SYSTEM_PROMPT };
})();