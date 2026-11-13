# Glance 开发清单 / Development Log

> 本文件系统性记录 Glance 的全部开发过程、当前真实状态与待办明细。
> 状态标记：`[x]` 已完成并验证 · `[~]` 进行中/部分完成 · `[ ]` 未开始。
> 最后更新：2026-11-13

---

## 0. 项目概览

- **名称**：Glance（词根背单词）。由他人项目 `Whiw/my_vocabulary` 去品牌化 fork 而来，已删除原作者署名与打赏入口，不上架微软商店。
- **定位**：以「助记」为核心——词根分解 + 词性详解 + 专项分类，帮助用户真正记住单词。
- **架构**：共享 Web 核心 `app/`，通过 `window.Platform` 适配层同时运行于：
  - **Windows**：Electron（`main.js` + IPC）。
  - **Android**：Capacitor（`android/`，原生 TTS / Filesystem / Share / Http）。
  - **浏览器**：纯 Web（fetch + localStorage），用于开发与 CDP 验证。
- **仓库**：`github.com/mjkyleo/Glance`（公开）。推送仅走 SSH + 专用密钥 `id_ed25519_glance`。
- **交付**：GitHub Actions 构建 Android APK → Releases（`android-<run_number>`）。

### 模块结构（`app/js/`）

| 文件 | 职责 |
|---|---|
| `platform.js` | 平台适配：TTS、真人音频、设置存取、词库加载、文件保存/打开、LLM 网络通道 |
| `srs.js` | FSRS-6 记忆调度内核（评分、到期队列、个性化权重优化） |
| `store.js` | 持久化 + 学习域逻辑（SRS 状态、每日日志、收藏、历史、错题、AI 缓存） |
| `library.js` | 词库索引、词根家族、词缀、查词、词性解析、助记钩子、详解卡片构建 |
| `ai.js` | 按需 LLM 单词讲解（多服务商预设、JSON 解析、本地缓存、导出） |
| `dictionary.js` | 外部词典（有道 / 免费 / Merriam-Webster / 自定义端点）：归一化、按词缓存、查询与回退 |
| `app.js` | 应用控制器：视图路由、学习/测试、词卡、词根/词缀、查词、统计、设置、事件 |
| `themes.js` | 专项分类器（29 个主题，精度优先规则，详见 §4） |

### 数据（`app/data/`，索引化 JSON）

| 文件 | 内容 |
|---|---|
| `words.json` | 15,645 词条（约 9.1MB），每词含 `zh/ipa/cf/fr/def/der/inf/au/ety/tag/root` |
| `exams.json` | 考试词书分组（高考/四级/六级/考研/托福/GRE/专四/专八） |
| `roots.json` / `roottrees.json` | 词根释义与词根树 |
| `affixes.json` | 前缀/后缀释义与例词 |
| `cet6.json` | 旧版六级词书（兼容保留） |
| `meta.json` | 元信息 |

**单词字段约定**（`words.json` 每词）：
- `zh`：词性前缀释义串，如 `"n. 行为 / vt. 指挥 / vi. 领导"`。
- `def`：`[[pos, enGloss, [synonyms]], …]`（WordNet 风格英文释义）。
- `tag`：考试标签数组，如 `["四级","六级"]`。
- `fr`：词频排名（越小越常用）；`cf`：CEFR 等级；`root`：词根。

---

## 1. 开发阶段总览

| 阶段 | 主题 | 任务 | 状态 |
|---|---|---|---|
| P0 | 去品牌化与基础重建 | #1–#6 | [x] |
| P1 | 代码质量 / UI / 学习 / 词汇增强 | #7–#13 | [x] |
| P2 | 词库爬取 + 共享学习应用 + 双端 + CI | #14–#22 | [x] |
| P3 | 竞品调研与需求优先级 | #23–#25 | [x] |
| P4 | 索引化词库 + P0/P1 学习功能 | #26–#35 | [x] |
| P5 | 体验精修（词缀/配色/分解/学习页/发音/卡片/质量/测试/FSRS/AI） | #36–#46 | [x] |
| P6 | 词性详解 / 助记钩子 / 柔和配色 / 考试标签 | #47–#51 | [x] |
| **P7** | **专项分类 / 查看次数 / 数据迁移 / 外部词典 / 收尾** | **#52–#63** | **[x] 功能完成，交付进行中** |

---

## 2. 已完成开发明细（P0–P6）

### P0 去品牌化与基础（#1–#6）
- [x] `package.json` 更名为 Glance。
- [x] 窗口标题（`index.html` / `main.js`）去品牌。
- [x] About 页移除署名与打赏。
- [x] README 重写（P7 收尾已按当前功能全面更新，见 #62）。
- [x] 全局清理旧名称引用 + JS 健全性检查。
- [x] 全新单次提交并推送至 `mjkyleo/Glance`。

### P1 质量 / UI / 学习 / 词汇（#7–#13）
- [x] 代码质量清理与 Bug 修复。
- [x] UI 视觉刷新（苹果式简洁、圆角柔和）。
- [x] 学习功能增强。
- [x] 词汇与 TTS 增强。
- [x] 提交推送。
- [x] 透明度设置 + 纯文本隐藏模式。
- [x] 设计 Glance 应用图标。

### P2 词库 + 共享应用 + 双端 + CI（#14–#22）
- [x] 分析 morphemelexicon.com 六级数据结构。
- [x] 本地爬取六级词汇 + 词素数据。
- [x] 共享 Web 学习应用（记忆模式）。
- [x] Electron Windows 接入学习应用。
- [x] Capacitor Android 脚手架。
- [x] 学习 UI 重设计（苹果风）。
- [x] 测试模式 UI 预览。
- [x] GitHub Actions Android APK 构建工作流。
- [x] APK 发布到 GitHub Releases。

### P3 竞品调研（#23–#25）
- [x] 调研约 10 个主流背单词 App/网页。
- [x] 提炼纯背单词功能矩阵与界面分布。
- [x] 汇总 Glance 需求清单并排优先级。

### P4 索引化词库 + P0/P1 功能（#26–#35）
- [x] 爬取 morphemelexicon 并构建索引化词库。
- [x] SRS 调度内核（B1/B2/B3）。
- [x] 每日计划 + 学习记录（F1/E1）。
- [x] 词根家族导航（C1/C2/A1）。
- [x] 查找/查词历史 + 生词本（D1/D2/D3）。
- [x] 单词书管理 + 词条富字段（A2/A3）。
- [x] 测试判分 + 错题本（G1/G2）。
- [x] 安卓原生 TTS（H1）。
- [x] 统计图表 + 智能筛词 + 词缀浏览（E/B/C）。
- [x] CI 构建 APK + Release + 通知。

### P5 体验精修（#36–#46）
- [x] 修复词缀面板溢出/滚动 Bug。
- [x] 柔化评分按钮图标 + 整体柔和配色。
- [x] 词根分解单行自适应 + 分段详解。
- [x] 干净学习页 + 低频功能移入设置。
- [x] 发音优化：真人音频优先 + 自动朗读默认关。
- [x] 每词独立详解卡片。
- [x] 词库质量过滤（去简单词）。
- [x] 词根导向测试策略（同根易混干扰）。
- [x] 学习曲线算法升级（FSRS/自适应）。
- [x] 大模型接入 + AI 单词解释缓存/导出。
- [x] 浏览器验证全部新功能 + 提交推送触发 CI。

### P6 词性 / 助记 / 配色 / 考试标签（#47–#51，提交 `1ed87f8`）
- [x] **词性结构化详解**：`library.js` 新增 `POS_LABEL`/`posInfo`/`parseSenses`，及物/不及物动词等全称 + 按词性分组义项；`app.js` `cardBody` 增 `senses` 分支。
- [x] **离线词根助记钩子**：`buildMnemonic` 链接 ≥2 个词素释义 + 「→」+ 核心义；保守策略（无单根兜底，宁缺毋滥）；AI `memoryTip` 优先；助记卡 + 学习页前置 pill。
- [x] **更亮更柔和配色**：亮色 `--accent #6f9be6` 等，暗色同步；评分按钮柔和 tint。
- [x] **考试标签徽标**：词卡头部 `.exam-tags` 展示 `tag`。
- [x] 浏览器验证（CDP 截图 + 34 步 smoke，0 运行时错误）+ 提交推送，CI run#6 成功，交付 `android-6` APK。

**已验证的关键正确性**：
- 词性解析：`conduct` → 名词/及物动词/不及物动词；`reduce` → vt/vi/[计]。
- 助记覆盖率：六级 4327 词中约 40.6% 有干净钩子（如 `reduce` → 「再（re）+ 引导（duct）→ 减少、分解」）。
- 修复过的助记误导：`induce`/`productive` 单根兜底已移除；嵌套括号已清理；`con-/com-/col-/cor-/co-` 释义统一为「共同、一起」。

---

## 3. 当前真实状态（诚实说明）

> 更新（2026-11-13）：P7 全部功能（#52–#62）已完成代码、CDP 实测与文档收尾；#63 仅剩推送触发 CI 与交付 APK。

- 最新提交：`dev/p7` 分支，分类器 `01b7a03`、专项 UI `3f2abb9`、查看次数 `890522c`、导出导入 `5f092ab`、外部词典 `449df3b`、清理 + README + 文档收尾 `6d7bb79`、有道中英词典（本次）。
- 最新交付：`android-8` APK（P7 完整版）；有道词典版本将由本次推送触发的新 CI 产出。
- 工作区：干净（`.scratch/` 为本地调试产物，已忽略）。
- 任务清单：P7 需求 #52–#62 全部完成（回归 15/15），#63 推送与发布进行中；**不能按编号折算完成度**，以本文 §4–§8 的实际勾选为准。

---

## 4. 专项分类 + 领域专项学习（#52–#55）

**需求**：全方位单词分类（动物/家居/动作/经济/科技/政策/自然/植物/节日/星期/月份/颜色等），
并针对四六级翻译/作文常考话题（中国传统文化等）做专项汇总，可在某领域集中学习。

### 4.1 分类器 `themes.js`（#52）✅
- [x] IIFE 骨架与 API：`init/list/groups/get/wordsOf/themesOf/isReady/GROUPS`。
- [x] 分组 `GROUPS`：考试专项 / 自然与生命 / 生活与社会 / 经济与科技 / 语言与基础。
- [x] 29 个主题（含 `cet_trans` / `cet_write` 两个复合考试主题）。
- [x] **重写退化关键词表**：全部改为人工精选闭集 + 领域关键词，单表 ~15–150 条。
- [x] 精度规则（实现于 `init` / `zhHit` / `enHits`）：
  - 中文只取**首要义项单元**（`zh.split('/')[0]`，再按顿号/逗号切分），避免 `wine` 的第三义「暗红色」把词拖进颜色主题；
  - 单元**整段或词尾**匹配，避免 `橄榄球` 命中 `橄榄`；
  - 英文释义仅在**同一首要释义中命中 ≥2 个**长领域词（≥6 字母）时计分；
  - `EN_STOP` 过滤 light/dark/state/law 等跨领域泛词。
- [x] 复合考试主题：`cet_trans`/`cet_write` = 基础主题并集 ∩ 四六级标签，按 `fr` 升序。

### 4.2 分类质量验证（#53）✅
- [x] Node harness（`global.window=global` + `words.json` + `Themes.init`）逐主题统计。
- [x] 抽样审计 animal / color / festival / time / policy / politics / economy / tech 等；修复 `he→动物`、
      `football→颜色`、`wine→颜色`、`campaign→体育`、`history→时间` 等误分。
- [x] 结果：单主题 34–339 词（`culture` 90、`animal` 124、`cet_trans` 242、`cet_write` 339），无膨胀主题。

### 4.3 专项学习 UI（#54）✅
- [x] `index.html`：底部新增「专项」tab（学习/词根/专项/查词/统计）+ `view-themes` + `theme-sheet` + `themes.js` script。
- [x] `app.js`：`switchView('themes')`；`renderThemes()` 分组主题卡（名称/描述/词数）；`openThemeSheet(id)` 词行 +
      `stateDot` + 掌握状态徽标 + 已掌握计数；「专项学习」→ `studyWords(entries)`。
- [x] bootstrap 调 `Themes.init(ds.words)`。
- [x] `app.css`：主题卡网格（双列、窄屏单列）、卡片 hover/active 反馈。

### 4.4 验证 + 交付（#55）✅
- [x] CDP 实测专项浏览/详情/专项学习；回归既有功能（并入 §8.1 全量回归 15/15）。
- [x] 提交推送触发 CI（与 #63 合并交付）。

---

## 5. 单词查看次数 / 接触记录（#56–#57）

**需求**：每次点开单词都计一次学习接触（查词检索点开、学习页渲染该词、词卡/家族/专项详情点开），
后台可看每个词看了多少次、有没有记住。

### 5.1 计数持久化（#56）✅
- [x] `store.js`：`DEFAULTS.views={}`；`normalize` 兜底；新增
  - `recordView(word)` → `views[word]={n,first,last}`；
  - `viewCount(word)` / `viewInfo(word)` / `topViews(limit)` / `totalViews()` / `viewedWordCount()`。
- [x] `app.js` 触发点：
  - `openWordSheet(word)` 开头 `Store.recordView(word)`——覆盖查词/历史/收藏/家族/专项/学习详情按钮等所有「打开词卡」路径。
  - 学习页呈现：`renderStudy` 用呈现令牌 `word|sessionIdx|会话首词` 去抖，同一词同次呈现只计一次，翻卡/换会话才再计。

### 5.2 可视化（#57）✅
- [x] 统计页新增「高频接触词」榜单：排名 + 单词 + 掌握状态 + 最近查看日期 + 查看次数（Top 12，可点开词卡）。
- [x] 统计页顶部新增「累计接触」「接触词数」卡片；面板标题显示累计次数。
- [x] `word-sheet` 头部显示「已看 N 次」徽标（与考试标签同排）。
- [ ] （可选）生词本/查词历史行显示次数徽标（暂不做，避免列表过密）。

---

## 6. 通用格式学习数据导出 / 导入（#58）✅

**需求**：安装以来全部学习数据可导出保存、可导入恢复；格式通用、结构清晰、稍作转换即可他用。

- [x] `store.js`：`exportData()` 生成可移植 payload；`importData(payload, mode)` 合并/覆盖恢复。
- [x] **通用格式设计**（双层）：
  ```jsonc
  {
    "app": "Glance", "kind": "learning-data", "schema": 1,
    "exportedAt": "ISO-8601",
    "summary": { "totalWords": 0, "known": 0, "learning": 0, "relearn": 0, "fresh": 0, "totalViews": 0, "daysActive": 0 },
    // 通用表：外部稍作转换即可用（类 CSV 行）
    "words": [ { "word":"", "state":"", "box":0, "due":"ISO", "reps":0, "views":0, "firstSeen":"ISO", "lastSeen":"ISO", "favorite":false, "errors":0 } ],
    // 无损还原块：导入时优先用此块完整恢复
    "data": { "srs":{}, "logs":{}, "views":{}, "favorites":{}, "favGroups":[], "history":[], "errors":{}, "fsrs":{}, "aiCache":{}, "dictCache":{}, "customBooks":{}, "settings":{} }
  }
  ```
- [x] 导入：优先 `data` 块无损恢复；缺失时由 `words` 表尽力重建 srs/views/favorites。模式 merge（默认，保留现有+叠加）/ replace。
- [x] **安全**：导出默认剔除密钥（`ai.key`、`dict.key`），保留 provider/model/base；UI 提示。
- [x] 复用 `Platform.saveTextFile`（导出）与 `Platform.pickLibrary`（导入，accept `.json`）。
- [x] 设置页「数据」组新增「导出全部数据 / 导入数据」入口 + 事件。

**验证（CDP 实操）**：
- 导出 payload：`app/kind/schema/exportedAt/summary/words[]/data` 结构正确；`settings.ai.key`、`settings.dict.key` 已剔除。
- 合并导入：views 累加（`n` 求和、`first` 取早、`last` 取晚）；收藏/错题/AI 缓存/词典缓存/customBooks 合并；历史按 word 去重且最新在前，上限 100。
- 覆盖导入：重置 srs/logs/views/favorites/errors/history/favGroups/aiCache/dictCache 后恢复，**本地 API Key 保留**，导入的 plan（33/50）生效。
- 通用表回退：去掉 `data` 块后由 `words[]` 重建 srs/views/favorites 成功。
- 异常文件：`kind` 不符 → 抛「不是 Glance 学习数据文件」，不污染现有数据。

---

## 7. 外部词典检索 + 缓存 + 设置配置（#59）✅

**需求**：内置免费权威词典，点一下按词检索、结果以卡片弹出（多义项）；本地不够完善时补充；
可在设置配置其他厂商 API；检索结果按词缓存，避免重复联网。

> URL 约束：只用**真实官方端点**，严禁替换为 routify 等临时代理；每次调用重新核对来源。

- [x] **网络通道**：`platform.js` 新增 `fetchJson(url,{headers})`，路由 Electron IPC `http-get` / CapacitorHttp GET / 浏览器 fetch；`main.js` 新增 `http-get` handler（`net.fetch` 绕过 CORS，镜像 `llm-chat`，仅允许 http/https，超时 15s）。
- [x] **新模块 `dictionary.js`**：providers + 归一化 + lookup + 缓存 + 导出。
  - `freezh`（**默认**，免 Key）：`https://dict.youdao.com/jsonapi?q={word}`（有道在线词典私有 JSON 接口），中文释义、美/英双音标、双语例句、考试标签、词根助记、同义词；支持短语与中译英（`meta.guessLanguage==='zh'` 走 `ce` 段）。
  - `free`（备用，免 Key）：`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`（Wiktionary 源，含音标/词性/多义项/例句/同义词/真人发音）。
  - `mw`（Merriam-Webster Collegiate，权威，需免费 Key）：`https://dictionaryapi.com/api/v3/references/collegiate/json/{word}?key={key}`。
  - `custom`（自定义端点）：URL 模板 `{word}` + 可选 Key（Bearer 或 `?key=`），通用 JSON 渲染。
  - 说明：Bing/有道智云无免费公开正式 API，有道网页接口作为首选增强源；不臆造接口。
- [x] **归一化记录**：`{word, ipa, ipaUk, audio:[urls], meanings:[{pos, defs:[{zh, en, example, synonyms, antonyms}]}], lang, exam, mnemonic, provider, sourceUrl, ts}`。
  - 有道取值兼容 `string` / `{"#text": ...}` / 数组；`ec.trs[].tr[].l.i` 按中文分号拆义项；`ee` 合并英文释义；`blng_sents_part` 双语例句；`syno` 近义；`exam_type` 映射为应用内中文标签。
  - 命中判定：存在 `ec` / `ee` / `ce` 才算收录；假词仅返回 `input/meta/le/lang`，直接判未找到。
  - 有道失败或未收录时自动回退 `free`，记录标记 `fallbackFrom`，UI 显示「有道不可用已回退」。
- [x] **缓存**：`store.js` `DEFAULTS.dictCache={}` + `dict={provider:'freezh',key:'',base:''}`；`setDictConfig/dictEntry/saveDictEntry/deleteDictEntry/dictWords`。命中缓存优先，离线可看。
- [x] **UI**：`word-sheet` 增「词典」卡片（美/英双音标、中文释义优先 + 英文释义副行、按词性分组义项、例句/近义词、考试标签、助记；重新查询/删除缓存）→ 检索结果直接展示；设置页「外部词典」组（服务商/Key/地址，按服务商动态显隐）。
- [x] `index.html` 增 `dictionary.js` script 标签。

**验证（CDP 实操）**：
- 有道真实查询 `abandon`（Electron IPC）：中文释义「抛弃，遗弃」+ 英文释义 + 2 个词性 11 条义项、美/英音标、2 条真人发音、9 个考试标签（映射为高考/四级/六级等）、词根助记、双语例句。
- `schedule` 双音标：美 `ˈskedʒuːl` / 英 `ˈʃedjuːl`；`take off` 短语：`ˈteɪk ɔːf`、CET4/CET6、中文义项与 `take+off` 发音；`苹果` 中译英：`lang:zh`、`apple — 苹果；苹果树；苹果公司`、双语例句。
- 假词 `zzzqqqxx`：有道仅返回 `input/meta/le/lang` → 判未收录并回退免费词典 → 「词典中未找到该词」。
- 缓存：二次查询 `cached:true`，词卡显示「中英词典 (有道 · 免费) · 本地缓存」；删除缓存生效。
- 免费源 `abandon`：HTTP 200，音标 `əˈbæn.dən`、2 个词性、9 条释义、真人音频 1 条、来源 Wiktionary。
- MW：无 Key 时提示填写 Key；合成返回正确解析音标/音频 URL/近反义词。
- 自定义：嵌套 `entries/definitions` 与字符串 `defs` 均能归一化；`{word}`/`{key}` 占位与 Bearer 头正确；无地址时提示配置。
- 设置页：四项服务商切换、Key/地址显隐、配置持久化正常。
- 导出包含 `dictCache` 且 `dict.key` 被剔除。无控制台报错。
- 归一化单测（真实响应样本）24/24 通过；全量回归 15/15 通过。

---

## 8. 收尾：实测 / 清理 / 文档 / 重跑 CI（#60–#63）

### 8.1 全功能实测 + 回归（#60）✅
- [x] 浏览器/CDP 逐项实操：专项浏览+详情+专项学习；查看次数（查词/学习/词卡触发+榜单+徽标）；数据导出（生成通用 JSON）+导入恢复；词典检索（免费默认+缓存命中+卡片+设置）。
- [x] 回归：学习/评分/词根/词缀/查词/统计/AI/测试 无报错。
- [x] 截图存证（`.scratch/`，不入库）。

**实测结果**（`.scratch/verify-all.js` 真机 CDP 驱动真实 UI）：

| # | 项目 | 结果 |
|---|---|---|
| 1 | 学习页渲染 + 「认识/模糊/忘了」评分推进 | ✅ |
| 2 | 测试（词根导向干扰）判分 + 下一题 | ✅ |
| 3 | 词根家族导航 | ✅ |
| 4 | 词缀浏览 + 过滤 | ✅ |
| 5 | 主题（专项）5 组 29 主题 + 专项学习会话 | ✅ |
| 6 | 查词检索 + 词卡打开 | ✅ |
| 7 | 词卡 8 张子卡（含词典卡）+ 考试标签 + 已看次数徽标 + 收藏 | ✅ |
| 8 | 统计页 6 张指标卡 + 高频接触词榜单 + 日历热图 | ✅ |
| 9 | 单词书 10 本渲染 | ✅ |
| 10 | AI 词库页 | ✅ |
| 11 | 设置页全部分组（含外部词典） | ✅ |
| 12 | 导出 payload 结构 + 密钥剔除 | ✅ |
| 13 | 查看次数：打开词卡后计数 +1 | ✅ |
| 14 | TTS 朗读调用 | ✅ |
| 15 | 会话/事件无未捕获异常 | ✅ |

`SUMMARY: 15 / 15 passed`，`EXCEPTIONS: []`，`CONSOLE_ERRORS: []`。首轮 9 项失败均为**验证脚本自身写错**（旧选择器 `#progress-text`、在 `nextQuiz` 重置后读取 `fb.hidden`、收藏处于已开态、书本/AI 不在底部 tab），修正脚本后全绿，非产品缺陷。

### 8.2 目录清理（#61）✅
- [x] 清理 `.scratch/` 临时截图/脚本（保留必要验证工具或归整）；核查 `.gitignore`（已含 `.scratch/`、`package-lock.json`、`debug.log`）。
- [x] 移除冗余/死文件；确认 `app/` 与构建产物结构清晰。
- [x] 不删用户在建工作；可疑文件先确认；`git status` 核查无意外入库。

**清理明细**：
- 删除遗留 overlay 体系：根目录 `index.html`/`renderer.js`/`style.css`、`settings.*`、`about.*`（共用 `app/` 新界面替代）。
- `main.js` 移除死 IPC/窗口/种子逻辑（`open-overlay-window`、`open-settings-window`、`open-about-window`、`edit-file`、`dialog:openFile` 等 15 项）与 `spawn`/`shell` 导入。
- 删除根目录重复数据/物料：`data/cet6.json`、`assets/words.tsv`、`sample_en_zh.tsv`、`*_test.tsv`、`build/appx/*`、旧商店图标、`demo.gif`。
- `package.json` 去掉已不存在的 `extraResources`（words.tsv/sample_en_zh.tsv）；`.gitignore` 增补 `/build`、`/android/app/build`、`/android/.gradle`、`.DS_Store`、`Thumbs.db`。
- `.scratch/` 仅保留 `verify-*.js` 验证脚本与 p7 截图存证；缓存/探针/一次性脚本已清。
- 清理后重启 Electron 重跑回归仍 15/15，无功能回退。

### 8.3 README 美化 + 文档收尾（#62）✅
- [x] **重写 README**（当前仍是旧 overlay flashcard 描述，与现状不符）：Glance 简介与特色（词根助记/词性详解/专项分类/查看次数/通用导出导入/外部词典）、截图、Windows+Android 安装、构建方式、目录结构、数据格式说明。
- [x] 系统性收尾：功能清单与状态、导出格式 schema 说明、词典 provider 配置说明、变更记录。
- [x] 保持去品牌化（无原作者署名/打赏）。

**产出**：`README.md` 全中文重写（简介/特色分组/真实徽章/截图表格/安装/使用/导出 JSON 示例/词典 provider 表/构建/目录/许可）；新增 `docs/screenshots/{study,dictionary,themes,stats,books}.png` 入库（源图来自 P7 实测）。

### 8.4 修复 + 重跑 Action 交付（#63）✅
- [x] 针对实测发现的问题逐项优化修复（词典音标双斜杠 → `cleanIpa`；遗留死代码/文件清理；验证脚本修正）。
- [x] 重跑 `android-build.yml` 构建 APK → 发布 Release → 通知用户下载链接（run `43358799647` 成功，`android-8`，target `6d7bb79`，APK 13,149,216 字节）。
- [x] 推送用专用 SSH 密钥 `id_ed25519_glance`；提交用 noreply 邮箱 `125885091+mjkyleo@users.noreply.github.com`。

---

## 9. 关键约束与注意事项

- **URL 完整性**：工具 URL 必须匹配当前任务目标，严禁替换为 routify 等临时代理；历史调用不代表正确，每次重新核对来源。
- **推送安全**：仅 SSH（HTTPS 被墙）+ 专用密钥 `id_ed25519_glance`（comment `mjkyleo-glance`），`GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_glance -o IdentitiesOnly=yes"`。**不得触碰/使用** `sczhang0504` 的默认密钥 `~/.ssh/id_ed25519`。
- **提交隐私**：用 noreply 邮箱，勿暴露私有 `437257976@qq.com`。
- **本地工具链**：无 Android SDK（靠 CI）；WMI 启动 Electron；CDP（端口 9222）截图/smoke；npmmirror；本机无 `gh`，repo 公开（api.github.com 可达）。
- **渲染层改动**：renderer-only 改动 `Page.reload` 即可；`main.js` 改动需重启 Electron。
- **Node harness**：需 `global.window=global`；Git Bash 用 `taskkill //F //PID`。
- **记忆**：仅在用户明确要求时修改持久记忆。

---

## 10. 变更日志（Git）

| 提交 | 内容 |
|---|---|
| _本次提交_ | 接入有道中英词典（中文释义/双音标/双语例句/考试标签/助记/中译英 + 免费源自动回退） |
| `3c6ae43` | 记录 P7 APK 交付（`android-8`） |
| `449df3b` | 外部词典检索（免费/MW/自定义）+ 本地缓存 + 设置配置（P7-E） |
| `5f092ab` | 通用格式学习数据导出 / 导入恢复（P7-D） |
| `890522c` | 单词接触次数记录 + 统计榜单/徽标（P7-C） |
| `3f2abb9` | 专项分类底部 tab + 主题卡 + 专项学习会话（P7-B） |
| `01b7a03` | 高精度主题分类器 `themes.js`（P7-A） |
| `1ed87f8` | 词性结构化义项 + 离线词根助记 + 考试标签 + 更亮柔和配色（P6） |
| `8b5ba95` | FSRS-6 自适应 SRS + 词根导向测试 + 词库质量过滤 + LLM 单词解释（P5） |
| `386aad2` | 干净学习页 + 柔和配色/图标 + 单行词素 + 真人音频 TTS（P5） |
| `a21ee5e` | Capacitor gradle 注册 Android TTS 插件 |
| `8ebdb66` | 索引化词素数据集 + SRS 学习系统（P0/P1） |

**交付物**：`android-8` APK（P7 完整版）— `https://github.com/mjkyleo/Glance/releases/download/android-8/Glance-android.apk`（13,149,216 字节）；旧版 `android-6/7` 保留在 Releases。