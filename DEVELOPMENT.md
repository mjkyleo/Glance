# Glance 开发清单 / Development Log

> 本文件系统性记录 Glance 的全部开发过程、当前真实状态与待办明细。
> 状态标记：`[x]` 已完成并验证 · `[~]` 进行中/部分完成 · `[ ]` 未开始。
> 逐模块功能全景与后续迭代规划见 [docs/FEATURES.md](docs/FEATURES.md);数据 schema 见 [docs/DATA.md](docs/DATA.md)。
> 最后更新：2026-11-14

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
| `quiz.js` | 测试引擎：候选池、难度评分、加权抽样、干扰项与会话生成（无 UI 随机逻辑） |
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
| P7 | 专项分类 / 查看次数 / 数据迁移 / 外部词典 / 收尾 | #52–#63 | [x] |
| P8–P12 | 学习面板 / 分类设置 / 面板排序 / 8 套主题 / 主题级 UI/UX | #64–#69 | [x] |
| **P13** | **背景壁纸 + 测试引擎与测试页重做** | **#70–#75** | **[x]** |

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

> 更新（2026-11-13）：P7 已交付 `android-11`；P8–P12（学习页、分类设置、面板排序、8 套主题与主题级 UI/UX）已交付 `android-17`；P13（背景壁纸 + 测试引擎重做）已交付 `android-18`；Releases 排序修复后新 Logo 交付 `android-21`；安装包版本号/签名修复后为 `android-23`；详细讲解页重构（自动查词 / 图标操作 / 紧凑卡片）交付 `android-24`（versionCode 24 / versionName `1.0.6+24`）；设置并入「我的」后交付 `android-25`（versionCode 25 / versionName `1.0.6+25`）；测试流程重做（单一开始入口 + 设置面板 + 答错解析）交付 `android-26`（versionCode 26 / versionName `1.0.6+26`）。「我的」头像与昵称编辑交付 `android-27`（versionCode 27 / versionName `1.0.6+27`）。

- 最新提交：`a12ba4e`（`main`），QNAI 免费 AI 服务商预设（DEV-ONLY，双模型下拉）（§8.31）。
- 最新交付：`android-42` APK → `https://github.com/mjkyleo/Glance/releases/download/android-42/Glance-android.apk`（13,236,662 字节，versionCode 42 / versionName `1.0.6+42`）。**仍含 DEV-ONLY devfree + qnafree 预设（§8.25），非正式发布包**;FSRS 对照旁路（`app/dev` + `app/js/vendor`）已从 APK 剥离。
- 工作区：干净（`.scratch/` 为本地调试产物，已忽略；`assets/` 下两张用户提供的 Logo 参考图未提交）。
- 任务清单：P7–P13 功能全部完成，回归与专项验证见 §8.5–§8.31；**不能按编号折算完成度**，以本文实际勾选为准。

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
- [x] 重跑 `android-build.yml` 构建 APK → 发布 Release → 通知用户下载链接（P7：run `43358799647` → `android-8`；有道词典版：run `43366725898` → `android-10`，target `9948be9`）。
- [x] 推送用专用 SSH 密钥 `id_ed25519_glance`；提交用 noreply 邮箱 `125885091+mjkyleo@users.noreply.github.com`。

### 8.5 学习页信息密度 + 学习面板设置 ✅

**反馈**：词典卡考试标签与词卡顶部重复；服务商名带「(有道 · 免费)」；学习页只有单词/音标/释义，内容太空；顶部数字进度「1 / 90」不够柔和。

- [x] **标签去重**：本地词条已有 `e.tags` 时，词典卡不再渲染考试标签行；仅词库外的词用词典标签兜底。
- [x] **服务商命名**：`PROVIDERS[0].name` 改为「中英词典」，设置页/词典卡/回退提示统一使用。
- [x] **学习面板**：`store.js` 新增 `studyPanel`（默认全开），`normalize` 合并缺省；`exportData` / `importData` 随设置迁移。
  - 设置页新增「学习面板」组：音标与发音、释义、构词解析、助记、英文释义、例句、词根家族、近义词、派生词、词形变化、词源共 11 项开关，改动即时保存并重绘学习页。
  - 学习卡片下方新增 `.study-info`：英文释义（最多 4 条）、词根家族（词根按钮 + 最多 8 个同根词，可点开词卡）、近义词/派生词/词形变化 chips、词源、例句；无内容自动隐藏。
  - 开关关闭时同步隐藏对应 DOM（`phonetic`/`speak-button`/`word-meaning`/`morphemes`/`word-mnemonic`），不占位。
- [x] **柔和进度条**：移除 `session-pill` 数字，改为 6px 圆角轨道 + 渐变填充，`aria-valuenow` 同步；宽度按已完成/总数平滑过渡。

**验证（CDP 实操）**：`verify-panel.js` 6/6 通过——设置组 11 项默认全开、进度条无文字且评分后由 0% → 7%、`abandon` 学习页出现 6 个信息行、关闭释义/词根家族/音标后对应元素隐藏且恢复、词典名「中英词典」且本地词词典标签 0 条（顶部 8 条）、导出/导入携带 `studyPanel`。词根按钮与家族 chip 可分别打开家族/词卡；360×800 移动视口与深色模式布局正常。全量回归 15/15、有道归一化 24/24，`EXCEPTIONS: []`、`CONSOLE_ERRORS: []`。截图更新 `docs/screenshots/{study,dictionary}.png`。

**交付**：run `43370077807` → Release `android-11`（target `0931d08`，APK 13,095,753 字节）。

### 8.6 配色主题 + 分类设置 + 我的 + 动态 Release 标题（P9）✅

**反馈**：页面需要浅绿/黄/蓝/灰/黑等基础配色；设置项不能全堆在一起；统计入口改为「我的」，统计与设置收入其中；Release 标题不能总是 `Glance Android (build N)`。

- [x] **五套基础配色**：`html[data-theme]` 覆盖 `--bg/--card/--accent/--root-*`，提供天蓝（默认）、浅绿、暖黄、雾灰、墨黑；每套均补充深色模式变量，系统深浅色切换时保持同一色调。
- [x] **主题持久化**：`store.js` 新增 `theme` 默认值与白名单校验，`exportData` / `importData` 随设置迁移；启动 `applyTheme` 恢复，并同步浅色/深色两条 `theme-color` meta。
- [x] **设置按功能分类**：设置面板改为分类入口（学习 / 外观 / 发音 / 词书 / 词典 / AI 解释 / 数据），点击进入独立 pane，顶部返回键回到分类页；原有 11 项学习面板开关、AI/词典配置、数据导入导出等 ID 与绑定全部保留。外观页提供 5 个配色圆点 + 卡片顺序重置；词书直接跳到词书页。
- [x] **底部「我的」**：原「统计」tab 替换为「我的」；页面含连续打卡、当前词书、今日新学/复习、已掌握、累计接触四格指标，以及学习统计、词书与计划、AI 解释库、数据备份、设置五个入口。
- [x] **子页返回**：统计/词书/AI 子页新增统一返回逻辑，返回来源页（我的或学习），tab 高亮同步跟随来源。
- [x] **动态 Release 标题**：工作流 `fetch-depth: 0`；标题取本次构建中最近一次产品代码提交（`app/`、`main.js`、`package.json`、`android/`、`capacitor.config.json`），正文列出上一个 `android-*` 标签以来的产品变更 + 构建号/短 SHA；历史 `Glance Android (build N)` 标题自动改为对应提交标题。

**验证（CDP 实操）**：`verify-p9.js` 18/18 通过——五套配色切换与持久化（含深色）、分类设置 7 入口/6 pane、返回导航、11 项面板开关、词书路由、我的页面 4 指标 + 5 入口、统计/词书/AI 往返；`EXCEPTIONS: []`、`CONSOLE_ERRORS: []`。截图：`docs/screenshots/{me,settings,stats,study}.png` 更新，另存 `p9-theme-*`、`p9-dark-*` 对照图。

**交付**：run `43372482022` → Release `android-13`（target `036b51b`，APK 13,100,488 字节），标题取自本次改动提交。历史上 `Glance Android (build N)` 的 Release 已按标签对应提交标题回填（`android-2`–`android-8`、`android-10`、`android-11`；`android-9` 为 ImgBot 图片优化）。回填依赖 `gh release list --json name`（`title` 字段不存在）与 pipeline-only 构建的标题兜底，修复提交 `036b51b`。

### 8.7 学习面板排序（P10）✅

**反馈**：设置里的「每日计划与学习面板」需要能调整学习页内容的先后顺序。

- [x] **顺序持久化**：`store.js` 新增 `studyPanelOrder`（11 项），归一化时按保存顺序去重、过滤非法项并补齐缺失项，不再被默认数组覆盖；随导出/导入迁移（`settings.studyPanelOrder`）。
- [x] **分类排序 UI**：学习面板按页面位置分为「卡片顶部」（音标、构词解析、助记、释义）与「详细内容」（英文释义、词根家族、近义词、派生词、词形变化、词源、例句）两组；每行支持拖动（⠿ 手柄）与 ↑/↓ 按钮，附「恢复默认顺序」。
- [x] **学习页同步**：`panelOrder()` 决定渲染顺序；卡片顶部四项按顺序插入词条卡片，详细内容按顺序重建 `#study-info` 行；设置面板打开时改动即时反映到学习页。
- [x] **移动端适配**：24px 箭头按钮 + 可拖拽行；360px 视口下标签、箭头、开关不溢出。

**验证（CDP 实操）**：新增 `verify-order.js` 7/7 通过——默认分组与顺序、卡片顶部箭头排序（`释义` 置顶后 `#word-meaning` 排到最前）、详细内容排序（`词源` 置顶后学习页首行为「词源」）、组内拖动、重置、刷新后保留并过滤非法项、导出携带顺序；`EXCEPTIONS: []`、`CONSOLE_ERRORS: []`。回归：`verify-panel` 6/6、`verify-all` 15/15、`verify-p9` 18/18。截图 `docs/screenshots/{panel-order,study-order}.png`。

**交付**：run `43374060828` → Release `android-14`（target `eb42460`，APK 13,102,468 字节），标题为「Add reorderable study panel with drag and arrow controls」。

### 8.8 主题体系重做（P11）✅

**反馈**：主题部分需要根据项目挑几套合适的风格并优化（参考 `ui-style-selector`）。

- [x] **选型**：按 ui-style-selector 的色板与设计 token，选择适合长时阅读与背词的 8 种风格——Apple（天蓝）、Japanese Fresh（抹茶）、Warm Dashboard（暖陶）、Scandinavian（雾灰）、Monochrome（墨黑）、Notion（纸白）、Korean Minimal（樱粉）、Soft UI（暮紫）。
- [x] **默认主题**：`--bg #f5f7fa`、`--text #1d1d1f`、`--accent #0071e3`，重校文字三级层级、hairline 与 root/prefix/suffix 语义色；8 套主题各自覆写背景、卡片、文字与语义色。
- [x] **次强调色**：新增 `--accent-2`（蓝→靛、抹茶→浅鼠尾草、暖陶→浅陶、…），词书横幅与学习进度条改为 `accent → accent-2` 渐变，不再固定蓝紫。
- [x] **深色模式**：逐主题定义深色背景/卡片/文字/accent/accent-2；默认深色对齐 Apple（`#131418` / `#0a84ff`）。
- [x] **外观页**：8 个色卡（天蓝/抹茶/暖陶/雾灰/墨黑/纸白/樱粉/暮紫）4 列两行，`THEME_META`、store 归一化与导入白名单、theme-color meta 同步扩容。
- [x] **文档**：全部截图按新配色重拍，新增 `theme-paper/sakura/violet`，移除旧 `theme-green`；README 功能与使用说明更新为 8 套配色。

**验证（CDP 实操）**：`verify-p9.js` 21/21——8 套主题切换、持久化、active 状态、浅/深 theme-color、accent 与 accent-2；回归 `verify-all` 15/15、`verify-panel` 6/6、`verify-order` 7/7；360px 色卡网格 4 列无溢出；桌面/移动/深色截图逐张检查。

**交付**：run `43377421625` → Release `android-15`（target `5714557`，APK 13,103,880 字节），标题为「Redesign the theme system with eight ui-style-selector palettes」。

### 8.9 主题级 UI/UX 差异（P12）✅

**反馈**：不要只是换颜色，要按项目/风格库真正优化 UI/UX，但整体信息架构不能变。

- [x] **设计 token 层**：在 `:root` 建立全套可覆写变量——字体族/字重/字距/行高/标签大小写、圆角梯度、卡片内边距/区块间距/控件高度、描边与阴影、按压/悬停位移、过渡时长与曲线、底栏底色/描边/圆角/阴影、页面底纹、词书横幅配色。
- [x] **逐主题重设**（仅覆写 token，不改 DOM/导航/视图/设置分栏）：
  - 天蓝 Apple：系统无衬线、700 标题、紧凑圆角、极轻阴影、`.96` 按压缩放。
  - 抹茶 Japanese Fresh：日文字体栈、300/400 字重、1.8 行距、宽字距、1px 细描边替代阴影、10px 标签圆角、400ms 缓动、无按压缩放。
  - 暖陶 Warm Dashboard：700 标题、24px 大圆角、暖色弥散阴影、悬浮圆角底栏、悬停上浮 2px、弹性曲线。
  - 雾灰 Scandinavian：Avenir 系、300/400 字重、小圆角（8–12px）、1px 细线分层、无阴影、慢速低对比过渡、按压仅降透明度。
  - 墨黑 Monochrome：Helvetica 系、粗标题配细正文、0.14em 大写标签、4–6px 直角、无阴影、实色进度条、纯色词书横幅、按压缩放取消。
  - 纸白 Notion：衬线标题、600 字重、纸张颗粒底纹、文档式左对齐词卡、6–12px 小圆角、仅颜色过渡、无位移。
  - 樱粉 Korean Minimal：韩文字体栈、轻字重、柔粉径向光晕、大圆角（24px+）、带粉调的柔和投影、悬浮底栏。
  - 暮紫 Soft UI：无硬边框、靛紫分层柔影、大圆角、悬浮底栏、悬停上浮 2px。
- [x] **深色适配**：新增深色共享描边，逐主题覆写背景光晕/阴影/底栏/输入框/词书横幅；墨黑深色改为深色底 + 深色字横幅，避免白底突兀。
- [x] **组件接线**：学习词卡、词素、卡片、评分按钮、进度条、学习详情、页签底栏、搜索框、列表行、主题卡、统计卡、词书横幅、表单、测试选项、弹层、设置导航、「我的」页、AI/词典模块全部改用 token，保证一套架构、八种质感。
- [x] **文档**：README 新增「主题设计」对照表并说明切换主题会改变排版/形状/层次/密度/动效；外观页提示文案同步更新；全部文档截图重拍。

**验证（CDP 实操）**：`verify-uiux.js` 16/16——架构未变（5 tab/8 view/7 nav/6 pane）、8 套主题的圆角/字重/描边/底栏/对齐/输入框/底纹/动效逐项断言、8 套签名互不重复、Notion 衬线左对齐与纸纹、Monochrome 直角/大写/纯色横幅、Soft UI 悬浮底栏与柔影、360px 无横向溢出、深色描边与横幅反转、零异常零控制台错误；回归 `verify-all` 15/15、`verify-p9` 21/21、`verify-panel` 6/6、`verify-order` 7/7；逐张检查浅色/深色/移动端截图。

**交付**：run `43381786105` → Release `android-17`（target `a87d3e9`，APK 13,108,639 字节），标题为「Differentiate themes by typography, shape, density and motion」。

### 8.10 背景壁纸 + 测试引擎重做（P13）✅

**反馈**：1）支持上传图片作为 App 底色背景，类似微信聊天背景 / 手机壁纸；2）重做「设置 → 学习 → 测试」，让范围、题量、题型、难度、约束与选题策略都可控。

**背景壁纸**

- [x] **数据**：`settings.background = { image, veil, blur }`；`veil` 归一到 0–80、`blur` 0–16，`image` 只接受 data URL。随导出携带 `veil/blur`，**图片本身不导出**；仅覆盖导入应用这两项。
- [x] **渲染**：全局固定 `.app-bg` 图层（`cover/center`）+ `filter: blur(var(--bg-blur))` + `scale(1.04)` 防边缘露白；`::after` 蒙层以 `--bg-veil` 控制对比度；`body.has-bg` 切换，所有视图与弹层共用同一背景。
- [x] **压缩**：`input[type=file]` → canvas 最长边 1440px，按 JPEG 质量 0.85→0.42 与 0.5 缩放逐级降级，目标 ≤48 万字符，避免撑爆 localStorage。
- [x] **外观页**：预览缩略图、选择/移除、蒙层与模糊滑杆；移除只清图片，保留滑杆值。

**测试引擎 `quiz.js`**

- [x] **独立模块**：IIFE 暴露 `window.QuizEngine`（`TYPES/SCOPES/buildConfig/estimate/buildSession` 等）；UI 只调用估计与会话生成，**随机与评分逻辑全在引擎内**。
- [x] **开始页配置**：范围 6 种（当前词书 / 当前专项 / 生词本 / 错题本 / 到期复习 / 全部混合，专项给出 29 个主题下拉）；题量默认 10（5/10/20）；题型三项多选默认全选；难度自动/简单/普通/困难；联网例句默认开启。
- [x] **基础权重**：到期 > 错题 > 收藏/低掌握 > 当前词书或专项新词 > 已掌握（少量保留）；近期高频接触强降权。
- [x] **评分**：`baseWeight · difficultyFit · rootCoverageBonus · noveltyBonus − recentExposurePenalty − sameWordPenalty − sameRootStreakPenalty`，按分加权随机。
- [x] **难度**：词面（考试标签/词频/长度/词根复杂度）+ 学习状态（正确率/错题/FSRS 状态/reps/lapses）+ 干扰项相似度上限。自动难度按历史能力定位 70–85% 正确率（`target = 0.25 + ability·0.62`），命中度用 σ=0.18 指数核。
- [x] **抽样流程**：过滤无效释义/词性/干扰项不足 → 打分 → 题型可用性（填空需例句）→ 加权随机 → 更新已用词/词根/题型；题量不足先放宽已掌握与近期限制，仍不足再降干扰项质量并提示。
- [x] **会话约束**：同词不重复；同词根连续 ≤2；连续同题型 ≤2（不会出现 3 连）。
- [x] **英选中**：题干为单词 + 可选音标；正确项取首要中文释义并截断；干扰项优先同词性，其次同词根/主题/考试标签/相近难度；排除近义、包含关系、反义与「以上都不是」；选项洗牌。
- [x] **中选英**：同词性硬过滤；相似度 = 同词根×3 + 同词性×2 + 同主题×1.5 + 同标签×1 + 编辑距离×1.5 + 长度差×0.5 + 难度差×1 − 语义相近×5；取前 8–12 加权抽 3；同词性不足则换题。
- [x] **例句填空**：优先本地例句，联网时经词典通道取例句并按词缓存 `quizExamples`；解析双语例句、挖去目标词或其屈折形式、保证上下文长度与唯一性；干扰项同词性/同形态/长度与难度相近；无例句回退其他题型，**绝不伪造例句**。
- [x] **只读保证**：拉取与使用例句不写查看次数、查词历史与 FSRS。
- [x] **入口**：`设置 → 学习 → 测试` 直接进入测试开始页；若上一轮已结束，会重置会话。
- [x] **界面**：开始页（范围/题量/题型/难度/联网/预计可用量/不足提示 + 吸附底部开始按钮）、作答页（进度、题型与难度徽标、反馈、下一题）、结果页（正确率环、错题清单、再来一轮/调整设置），支持键盘 1–4、Enter 与 S。

**验证（CDP 实操）**：

- 背景：真实上传壁纸 → 压缩为 46,363 字符 JPEG，图层与蒙层生效；`veil 34 / blur 6` 持久化，重启 Electron 后恢复（`veil 62 / blur 9`）；移除后清除图层并隐藏移除按钮；导出不含图片。
- 引擎：多轮实抽无重复词、同词根连续未超过 2、同题型连续未超过 2、四个选项互异；填空题正确项位置分布 10/14/17/19（60 题；修复 `shuffle(options)` 返回值被丢弃导致正确项恒为 A 的 bug）；离线时填空自动回退并提示。
- 修复填空题作答后只出现音标与朗读按钮、却不显示目标词的问题：现在作答后揭示单词、音标与朗读入口，示例截图即该状态。
- 页面：范围估计（混合 4334 / 词书 4327 / 专项 339 / 生词本 19 / 错题本 18 / 到期 4 并提示）、专项 29 个、键盘作答、退出确认、结果页、设置入口；深色与 390×844 视口无溢出，开始按钮吸附可见。
- 回归：词根 200 行、词缀 200、专项 29 卡、查词、我的、学习页正常；201 个 DOM id 无重复/缺失。
- 文档截图：`docs/screenshots/{quiz-start,quiz-session,background}.png`。

**交付**：run `43389370961` → Release `android-18`（target `85a3149`，APK 13,126,989 字节），标题为「Add wallpaper background and an adaptive quiz engine」。

### 8.11 Releases 排序修复 ✅

**问题**：Releases 页面与 API 的顺序为 `android-9, 8, 7, 19, 18, …, 10, 6, …, 2`——三个旧版本被 GitHub 服务端排到最新版之上（`created_at`、id、tag 提交时间均正常，`/releases/latest` 也正确指向 19），属于 GitHub 对非 SemVer 标签的排序异常，网页没有「拖动排序」入口。

**处理**：

- 用户确认后删除 `android-7` / `android-8` / `android-9` 三个 release（仅删 release 与 APK 资产，**git tag 保留**），由 `.github/workflows/release-order.yml` 一次性执行（清单写死、可重复运行）。
- 移除 `android-build.yml` 中「Fix generic titles on older releases」步骤：它每次构建都会 PATCH 历史 release，是造成列表反复变动的来源；现有标题已全部具体化。
- `android-build.yml` 增加 `paths-ignore`（`**/*.md`、`docs/**`、`release-order.yml`），文档提交不再触发 APK 构建。
- README 下载入口与徽标链接改为 `/releases/latest`，避免用户落在列表顶部。

**验证**：清理后 API 顺序为 `20, 19, 18, …, 10, 6, …, 2`，严格从新到旧；`android-9` 的 git tag 仍存在。

**交付**：run `43393338252` → Release `android-20`（target `550d5d6`，APK 13,126,987 字节）。

### 8.12 新 Logo：G 形词根标记全平台替换 ✅

**需求**：用用户提供的「G 形词根」标记（线性 G 圆环 + 水平短横 + 主干 + 双侧分叉与节点）替换旧的蓝眼睛图标，覆盖 Windows、macOS、Android 传统/自适应图标与启动页。

**实现**：

- 几何只维护一份：`scripts/gen-icons.js` 定义路径与节点，派生 `assets/logo/glance-logo.svg`、`glance-logo-light.svg`、`glance-icon.svg`（1024 圆角底板）与全部位图。
- Electron / Windows：`app-icon.png`（1024）、`app-icon.ico`（9 档 16–256）、`app-icon.icns`、`app.iconset/`。
- Android：传统 `ic_launcher{,_round}.png`（48–192）；自适应前景 PNG（108–432，缩放 0.9 落在 66dp 安全圆）；`drawable*/ic_launcher_foreground.xml` 矢量前景；背景改 `#0F171D`；`<monochrome>` 支持系统主题图标。
- 启动图：11 张 `splash.png` 全部重绘（深色底 + 浅色标记，标记高 22%，居中）。
- `docs/LOGO-SPEC.md` 同步最终坐标（环心 `(512,413)`、`R=200`、开口 `-50°→+45°`、节点 `(512,680)/(404,798)/(620,798)`）与重新生成命令。

**验证**：

- 逐张核对 1024 / 192 / 48 / 32 / 16 图标与竖版启动图渲染；ICO 含 9 档尺寸、ICNS magic 正常。
- 6 个改动 XML 通过解析；CI run `43394939363` 构建成功（AAPT 接受矢量前景与 monochrome）。
- 24px/16px 下线稿偏细（线性标识的固有取舍），Windows 主要显示尺寸 32px 以上清晰。

**交付**：`android-21`（target `c50253f`，APK 13,161,809 字节，标题「Replace the app icon with the G-root mark」）。

### 8.13 Android 覆盖安装修复：版本号递增 + 固定调试签名 ✅

**问题**：手机上「应用信息」仍是旧蓝眼睛图标、版本仍是 `1.0`。排查后确认不是图标资源没打进去，而是新包根本没装上：

- `android/app/build.gradle` 里 `versionCode 1` / `versionName "1.0"` 写死，每个 APK 对外都是同一版本，系统不认为需要更新。
- 工作流用 `./gradlew assembleDebug`，GitHub Actions 每次都是全新机器，debug 签名由机器本地生成，**每个 APK 签名都不同**，覆盖安装直接被系统拒绝（通常提示「应用未安装」，且不覆盖旧版）。

**修复**：

- 新增 `android/keystore/glance-debug.keystore`（alias `androiddebugkey`，口令 `android`，仅用于 debug 包），`build.gradle` 显式指定 `signingConfigs.debug` 指向该文件，所有 CI 构建签名一致，后续版本可原地覆盖升级。
- `versionCode` 改为 `-PglanceVersionCode=${{ github.run_number }}` 注入（本地默认 1），`versionName` 从 `package.json` 读取（当前 `1.0.5`），每次构建单调递增。
- 因签名从「每次随机」变为固定密钥，**从旧版本升级到最后一次旧签名安装包需要卸载一次**；此后的所有构建都可直接覆盖安装。卸载会清空本地学习数据，升级前先在「设置 → 数据」导出一份。

**验证**：run `43399149905` 构建成功；Release `android-22` 资产 `Glance-android.apk`（13,161,866 字节）。

**追加（安装时版本号看不出变化）**：

- `versionName` 改为 `package.json` 版本 + 构建号（`1.0.6+23`），`package.json` 升到 `1.0.6`；每次构建在「应用信息」里都能直接看出是否是新包。
- `android-build.yml` 新增 `Verify APK build metadata`：用 `aapt2 dump badging` 断言 `versionCode == github.run_number`、`versionName == <pkg.version>+<run_number>`，并用 `apksigner verify --print-certs` 断言签名者是 `CN=Glance Debug`；任一不符即构建失败。
- 用 Range 请求从 Release 资产中取出 `AndroidManifest.xml` 与 `META-INF/CERT.RSA` 复核：`android-22` 为 `versionCode 22 / versionName 1.0.5`，`android-23` 为 `23 / 1.0.6+23`；两者证书 SHA-256 均为 `82:F7:…:C9:AF`，与仓库内 `glance-debug.keystore` 完全一致，证明后续版本可覆盖安装。

**交付**：`android-22`（target `8d89844`，标题「Fix Android updates: per-build versionCode and a stable debug signing key」）；`android-23`（target `209d866`，versionName `1.0.6+23`，APK 13,161,873 字节）。

### 8.14 详细讲解页重构：自动查词 + 图标操作 + 紧凑整合 ✅

**交互**：

- 「详细讲解」文字按钮换成圆形书本图标（42px，`--fill` 底 + `--accent` 描边图标），点击直接打开详情；**无缓存时自动发起词典查询**，有缓存直接离线渲染，不再需要手动点「查询词典」。
- 词典标题栏右侧新增两个图标按钮（`.icon-action`）：圆圈箭头 = 强制刷新（绕过缓存重查，查询期间图标旋转、按钮禁用），红色垃圾桶 = 删除该词缓存（删除后图标自动隐藏，正文提示「暂无本地缓存，点击右上角刷新图标查询词典。」）。
- 「查询词典 / 重新查询 / 删除缓存」三个文字按钮全部移除；仅查询失败时保留「重试」。
- AI 详解仍可手动触发，并在「设置 → AI 解释」新增「打开详解时自动生成」开关（`Store.data.ai.autoExplain`，默认关闭）。开启且已启用、已填 Key 时，打开详情自动开始生成；未配置时仍提示去配置。

**内容**：

- 删除与词典重复的「释义」卡。
- 「词根家族」与「词源」合并为一张「词根与词源」卡：上方为中文词根释义（可点进词根页），下方接词源段落；没有词根时退化为单独的「词源」卡。
- 「英文释义」移到卡片序列末尾；「构词解析」「词形变化」保留。
- 旧默认卡片顺序在 `Store.normalize` 中自动迁移到新顺序，自定义顺序保持不动；「恢复默认顺序」改用 `Store.defaultCardOrder()`。

**样式**：详情页卡片改为无底色、无圆角、无阴影，卡与卡之间用 1px 细分隔线连接；缩小卡片内边距、行距与标题间距，整体更紧凑；390px 窄屏实测无横向溢出。

**验证**：Electron + CDP 实测自动查词、删除缓存、刷新重查、AI 自动/手动两种模式与设置开关回显；`node --check` 通过；CI run `43408612398` 成功；Range 复核 `android-24`：`com.glance.app` / `versionCode 24` / `versionName 1.0.6+24`，签名证书 SHA-256 `82:F7:…:C9:AF`（与仓库 keystore 一致）。

**交付**：`android-24`（target `26b3070`，APK 13,163,587 字节）。

### 8.15 设置并入「我的」：去掉齿轮入口 + 紧凑列表 ✅

**导航**：

- 删除顶栏右上角齿轮按钮（`#settings-button`）与学习工具栏重复设置入口（`#study-settings`），不再有独立的「设置」总入口。
- 「我的」页直接平铺全部设置分组，六行一一对应原设置分区：学习与测试、外观与主题、发音、词典、AI 解释、数据备份；每行带图标、标题与一行副标题，点击直接打开对应分区。
- 设置面板去掉左侧分区列表（`#settings-nav`）与返回按钮（`#settings-back`），打开即是目标分区，标题/副标题随分区切换；AI 配置提示中的「前往设置」改为直接跳 AI 分区（文案「我的 → AI 解释」）。
- 面板内重复的四级标题删除（AI 分区只剩「模型与 Key」、数据分区只剩「备份与重置」），避免与分区标题重复。

**样式**：`.me-row` 收紧为 9px/12px 内边距、图标 30px（SVG 16px）、标题 14.5px、副标题 11.5px，行间距 6px，左右缩进 8px；390px 宽下菜单实测 335.2px，比原卡片更窄更紧凑。

**验证**：Electron + CDP 实测顶栏/工具栏无齿轮节点；「我的」共 9 行（3 个统计行 + 6 个设置行）；六个设置行分别打开 `learn/appearance/audio/dict/ai/data` 分区且无残留导航与返回按钮；AI 未配置提示点「前往设置」会关闭词详情并落到 AI 分区；各视图无 JS 报错；390px 视口无横向溢出（菜单宽 335.2px）。

**交付**：`android-25`（target `a65dd82`，CI run 43410386807 成功，Range 复核 `com.glance.app` / `versionCode 25` / `versionName 1.0.6+25`，证书 SHA-256 `82:F7:…:C9:AF`，APK 13,162,420 字节）。

### 8.16 测试流程重做：单一开始入口 + 设置面板 + 答错解析 ✅

**入口与设置**

- 测试入口页只保留标题、配置摘要、可用题量卡片与「开始」按钮；右上角新增 38px 圆形齿轮（`#quiz-settings-btn`），打开 `#quiz-settings-sheet`。
- 范围、专项主题、题量、题型、难度、联网补充例句与题量估算全部迁入面板；任意修改即时写回 Store，并同步刷新入口页摘要（`quizConfigSummary()`）与预计题量。
- 「我的 → 学习与测试 → 打开测试设置」直接打开同一面板；入口页摘要改为单行配置描述，可用题量显示「可用 N 题 · 覆盖 M 个词」。
- 测试模式且尚未开局时隐藏学习进度条，顶栏右对齐；开局后进度条恢复显示答题进度。

**作答与反馈**

- 答对：显示「回答正确」提示，1.1 秒后自动进入下一题（`scheduleQuizAutoNext`），不再提供上一题/下一题来回切换。
- 答错：不再显示单独的「正确答案」横幅，改为在底部展开可点击的解析卡：单词、音标、非重复词根、全部义项（词性徽标 + 领域标注 + 释义），点击进入学习卡。
- 中选英答错时四个选项都显示简短释义，单词选项带 `›` 提示并可直接点击打开学习卡；其他题型下非单词选项禁用点击。
- 会话左上角显示「上一题 + 单词 + 简短释义」，点击打开该词学习卡；进入下一题自动回到顶部。
- 底部操作栏改为 `position: sticky`，始终停在会话底部；解析卡展开后若被遮挡会自动滚动到可见位置。

**样式**：新增 `.quiz-gear`、`.quiz-start-panel`、`.quiz-last`、`.quiz-reveal*`、`.quiz-sense*`、`.quiz-opt-hint` 等；题干字号改为 `clamp(24px, 7.6vw, var(--word-size))` 并禁止词内断行，长单词不再折行。

**验证**：Electron + CDP（390×844 @2x，blue 主题，无壁纸）实测：

- 入口摘要与可用题量随设置实时更新；齿轮与「我的」两个入口均正常；360px 宽度下无横向溢出，长单词单行显示。
- 英选中答错：全部义项展示、词根与单词重复时不显示、上一题可点开学习卡、继续后回到顶部；中选英答错：四个选项均带释义且可点开学习卡（`rage` 卡片标题正确）。
- 答对 1.1 秒自动跳题；`node --check app/js/app.js app/js/quiz.js` 通过；控制台无报错。
- 文档截图更新为 `quiz-start.png` / `quiz-settings.png` / `quiz-session.png`。

**交付**：`android-26`（target `72ab21a`，CI run 43413846494 成功，Range 复核 `com.glance.app` / `versionCode 26` / `versionName 1.0.6+26`，证书 SHA-256 `82:F7:…:C9:AF`，APK 13,165,506 字节）。

### 8.17 「我的」头像与昵称 ✅

**数据与存储**

- `DEFAULTS.profile = { nickname: '', avatar: '' }`；`normalize()` 只接受 `data:image/...;base64,` 头像，昵称 trim 后最多 16 个字符。
- 新增 `Store.setProfile(patch)` 统一写入；`exportData().data.settings.profile` 携带昵称与头像（压缩后约 10KB），覆盖导入时恢复，合并导入保留本机资料。

**界面**

- 「我的」顶部头像改为按钮（无头像时显示眼睛占位与相机角标），昵称旁新增铅笔按钮，二者都打开 `#profile-sheet`。
- 资料面板包含 84px 圆形预览、点击选图、移除头像、昵称输入与实时预览、保存按钮；支持 `Esc`、点击遮罩或关闭按钮退出。
- 头像处理：FileReader → Image → canvas 居中裁成 256×256 方形 → 优先 WebP（不支持时回退 JPEG）→ 逐级降低质量直到少于 9 万字符；只保存 data URL，不上传服务器。

**验证**：Electron + CDP（390×844 @2x，blue 主题）实测：昵称保存后即时更新且刷新后保留；模拟上传 600×400 PNG 自动裁成方形 WebP（约 4.6KB），顶部头像与面板预览同步，刷新后保留；移除头像恢复占位；`exportData` 含 profile，覆盖导入可恢复；360px 宽度无横向溢出，资料面板无需滚动即可完整显示；`node --check app/js/app.js app/js/store.js` 通过。文档截图更新为 `me.png` / `profile.png`。

**交付**：`android-27`（target `55356ef`，CI run 43416989592 成功，Range 复核 `com.glance.app` / `versionCode 27` / `versionName 1.0.6+27`，证书 SHA-256 `82:F7:…:C9:AF`，APK 13,168,277 字节）。

### 8.18 自定义词书导入修复与格式增强 ✅

**问题**：没有自定义词书时整个面板被隐藏，「自定义词书」区域没有任何可点入口；Android WebView 使用未挂载到 DOM 的 `<input type=file>`，点击可能无响应；解析仅支持 TSV。

**实现**

- `#custom-books-panel` 常驻：标题右侧显示支持格式，空状态提示「还没有自定义词书，可从下方导入。」，底部新增导入卡片（虚线框 + ＋ 图标 +「单词 + 释义，可选例句」）；移除词书列表右上角的「导入自定义」。
- `Platform.pickLibrary()`：文件输入挂载到 `document.body`（屏幕外 1px），接受 `.json/.tsv/.csv/.txt` 与对应 MIME；`change` 读取文件，窗口重新获得焦点后 800ms 仍无文件视为取消，180s 兜底超时；结束时移除输入并清理监听。
- `Library.parse/fromDelimited`：剥离 BOM；含制表符按 TSV，否则按 CSV；CSV 支持引号包裹、`""` 转义与引号内逗号；首行表头（word/term/单词 + meaning/释义/中文）自动跳过；按小写单词去重。
- `importBook()`：文件名去路径与扩展名并截断 24 字；重名自动追加「（2）」；空词库与解析失败提示支持的格式。

**验证**：Electron 390×844 @2x 与 360×800 @2x 实测空状态、底部入口可见、长词书名省略号且无横向溢出；本地 HTTP + 浏览器实测真实 Web 分支：输入挂载 → 带 BOM、CSV 表头与重复单词的文件导入为「我的词书」（2 词，第三列例句保留），自动切换到该词书并清理输入；同名再次导入为「我的词书（2）」；`focus` 取消返回 null 并清理输入；TSV / CSV / 中文表头 / 引号逗号解析通过；`node --check app/js/app.js app/js/platform.js app/js/library.js` 通过。文档截图新增 `custom-books.png`。

**词书重叠（后续）**：按当前质量过滤统计，四级 2694 词中 2504 词出现在六级（92.9%）；六级去掉中考/高考/四级重复后仅剩 1655 词（-62%），考研 87.7%、雅思 68.9%、专四 60.8% 也包含在六级中。直接默认剔除会显著缩小高阶词书，暂不启用；后续可在词书页提供可选的「跳过低阶重复词 / 跳过已掌握」开关，并优先扩充与重整词库。

**交付**：`android-28`（target `7df96ee`，CI run 43419414001 成功，Range 复核 `com.glance.app` / `versionCode 28` / `versionName 1.0.6+28`，证书 SHA-256 `82:F7:…:C9:AF`，APK 13,169,840 字节）。

### 8.19 词典服务商选择器与测试结束按钮重做 ✅

**问题**：`我的 → 词典 → 服务商` 仍使用浏览器原生 `<select>` 下拉，样式与整体 UI 脱节；测试进行中「结束测试」与主按钮挤在卡面底部的 sticky 操作条里，视觉突兀。

**实现**

- 服务商选择改为二级底部弹层：`#settings-sheet` 内改为可点行（服务商名 + 推荐/Key 状态 + 「切换 ›」胶囊），点击打开 `#dict-provider-sheet`（`.sheet-nested`，`z-index 62` / 遮罩 60），设置面板保持在下层；`openNestedSheet` / `closeNestedSheet` 与主弹层互斥，遮罩、X、Esc 只关上层，关闭动画带 280ms 定时器并在重开时清理。
- 服务商卡片展示字形标记（中 / EN / MW / {}）、名称、`推荐 / 免 Key / 需 Key / 自定义` 徽章、能力说明与右侧选中圆点；选中即写入 `Store.setDictConfig({ provider })`，同步触发 `syncDictProviderUi()`，按需显示 API Key / 自定义地址并更新底部说明。
- 测试页把「结束测试」移出卡面操作条，收进顶部 `.quiz-head` 右侧的「✕ 结束」小胶囊；`.quiz-actions` 默认隐藏，仅在答错需要「继续 / 查看结果」时显示整行主按钮，答对自动跳题时保持无操作条。

**验证（CDP 实操，390×844 @2x 与 360×800 @2x）**：服务商弹层正确叠在设置面板之上，四张卡片信息完整、无横向溢出；切换 MW 后显示 Key 输入并隐藏地址，切换自定义显示地址，切回中英词典恢复推荐态且写入持久化；遮罩 / X / Esc 均只关闭上层并保留设置面板；两次快速开合不出现被旧定时器隐藏的问题。测试页顶部「✕ 结束」全程可见，未作答与答对时操作条为 `display:none`，答错显示整行「继续」；答对自动进入下一题，结束确认取消后停留原题、确认后进入结果页；`node --check app/js/app.js` 通过，无控制台错误。截图更新 `quiz-session.png`，新增 `dict-provider.png`。

**交付**：`android-29`（target `b8efb4c`，CI run 43433260787 成功）。

### 8.20 移除各页顶部品牌栏 ✅

**问题**：词根、专项、查词、我的四个页面顶部共用一条品牌栏（眼睛图标 + Glance + 当前词库），首屏被重复信息占用；学习页本身已有紧凑顶栏，不需要品牌栏。

**实现**

- 删除 `index.html` 的 `.app-header` 品牌块；清理 `.brand / .brand-mark / .brand-text / .brand-name / .lib-name` 样式、`switchView` 里不再被消费的 `data-current`，以及两处 `#lib-name` 文案同步。
- 各页首个内容直接贴顶：词根页从「词根 / 词缀」切换与搜索框开始，专项页从说明文字开始，查词页从搜索框开始，我的页从资料卡开始；学习页保持原样。

**验证**：390×844 @2x 逐页实测，四个页面顶部均无品牌栏、无遮挡与横向溢出；词根列表、专项卡片、查词详情、我的资料 / 统计 / 词书、设置弹层与词典服务商切换回归正常；`node --check app/js/app.js` 通过，无控制台错误。截图更新 `me.png / profile.png / stats.png / books.png / themes.png / dictionary.png`。

**交付**：`android-30`（target `60b9e52`，APK 13,171,325 字节）。

### 8.21 听音选词 + 日历日期 + 词根进度 + 头像去角标 ✅

**需求**：测试新增「用英文发音选对应单词」，干扰项必须音近 / 近拼写，不能差别过大或一听即知；打卡日历显示月份并给每格标上日期数字；词根与词缀按已学比例显示绿色进度条、接近学完时整行变绿，并提供设置开关；头像去掉摄像头角标，仍可点击更换。

**实现**

- 听音选词：`quiz.js` 新增 `audio2word` 题型及 `canonIpa / phoneticKey / phoneticSim / buildAudioDistractors`。先规范化 IPA（去重音与长短符号、统一 `ә/ɡ/ɹ`、折叠元音为拉丁近音），音近度 = 编辑距离 0.72 + 首音 0.16 + 尾音 0.12；候选排除同音词、包含/被包含词、长共同前缀派生词与语义近邻后，按 `音近度 + 拼写相似度×0.34 + 同词性 0.08` 排序，仅保留音近度 ≥0.46（不足 4 个时降至 0.36）的前 10 个，用立方权重抽 3 个作干扰项；不足 3 个时跳过该题并回退其他题型。进入题目自动朗读且隐藏拼写，提供「播放发音」重播；作答后恢复单词、音标与发音。
- 默认题型扩为四种；`store.js` 对保留旧默认三题型的用户做一次性迁移，自定义子集保持不变，预计题量同步统计四类。
- 打卡日历：改为周一至周日对齐的周网格，跨月插入「2026年10月」式月份分隔，每格显示日期数字；保留 l1–l4 热度与今日/未来状态，深色格数字自动反白。
- 词根 / 词缀进度：`renderRoots` 用 `Library.getFamily` 统计家族词，`renderAffixes` 从当前词书词条的 `morphemes` 反推关联词；以 SRS 非 new 状态计为已学，行内渲染 4px 绿色进度条，徽标换成「已学/总数」，比例 ≥85% 时整行淡绿（`row-learned`）。设置新增「词根与词缀 → 学习进度条」开关（默认开），关闭后不渲染进度条并恢复原始词数徽标。
- 头像：移除「我的」资料卡与个人资料弹层头像上的摄像头角标（HTML + CSS），头像仍可点击上传 / 更换并完整显示。

**验证（Electron + CDP，390×844 @1.25 与 360×800）**：听音题作答前不显示单词 / 音标，自动朗读每次进入题目触发一次，重播可重复播放，答后显示单词、音标与发音；干扰项抽样 `object → reject / project / inject`、`mesh → marsh / measure / mess`、`flank → flask / tank / flannel`，无包含词或直接派生词。日历显示「2026年10月」「2026年11月」月份标签、周一至周日表头与 42 个日期数字，热度与今日状态正常。词根 `tone 36/48`、`canny 17/48`、`liqu / theme 44/48`（整行变绿）；词缀 `-ion 7/76`、`-er 2/30`；开关关闭后进度条数量为 0、徽标恢复「48 词」，重开立即恢复。资料卡与弹层头像均无摄像头角标且仍可点击。`node --check` 三个脚本通过，无控制台错误。截图新增 `roots.png / affixes.png / quiz-audio.png / settings-progress.png`，更新 `stats.png / profile.png`。

**交付**：`android-31`（target `c65087d`，CI run 43436045398 成功，Range 复核 `com.glance.app` / `versionCode 31` / `versionName 1.0.6+31`，证书 SHA-256 `82:F7:…:C9:AF`，APK 13,174,684 字节）。

### 8.22 词书去重开关（跳过低阶重复 / 跳过已掌握） ✅

**需求**：「词书与计划」新增两个可选开关：「跳过低阶重复词」去掉已出现在更低阶考试词书中的单词，「跳过已掌握」让已掌握词不再进入每日学习队列；默认均关闭，不裁剪词书本身（延续高阶词书默认不裁剪的策略），也不影响测试范围。

**实现**

- `store.js`：DEFAULTS 新增 `bookFilter: { skipLower: false, skipKnown: false }`；normalize 做对象类型纠正与布尔归一；不进 export/import（与 progressBars 同例，属本机偏好）。
- `library.js`：考试阶梯 `BOOK_RANK`（中考 0 → GRE 9），`lowerTags(tag)` 取严格低于当前考试的全部词书（六级 → 中考/高考/四级）；`lowerWordSet(tag)` 汇总低阶词书词条为 Set 并缓存于 `lowerCache`，`init` 时随词书缓存一起清空。
- `app.js`：新增 `studyEntries(b)`，仅对每日队列输入依次应用两个过滤（自定义词书无低阶集合，skipLower 为 no-op）；`buildSession` 改用它；`renderBooks` 同步开关状态并实时计算提示——全关时「默认不裁剪词书；开关只影响每日学习队列，测试范围不受影响。」，开启时「过滤后剩 N 词（低阶重复 X · 已掌握 Y）。」。开关 change → 保存 + 重建会话 + 刷新词书页/计划条，学习模式下立即重渲染学习页。
- 测试引擎不受影响：'book' / 'mixed' 范围仍用词书全量 entries。

**验证（Electron + CDP，390×844 @1.25 与 360×800）**：六级当前书开「跳过低阶重复词」提示「过滤后剩 1655 词（低阶重复 2672）。」（4327−2672，与实测重叠一致），再开「跳过已掌握」为「过滤后剩 1637 词（低阶重复 2672 · 已掌握 18）。」。队首对照：关开关时已掌握词 `producer` 与低阶词 `conduct`（due=1）依次入队，开对应开关立即跳过，测后恢复 due；双开时测试 'book' 范围候选池仍 4327。自定义词书 skipLower 为 no-op（提示仅已掌握子句）；自定义书全词已掌握 + skipKnown 时学习页正确显示空状态；删除自定义书回退六级。开关状态、提示与队列 reload 后保持；五 tab 巡览无控制台错误；360px 无溢出。截图新增 `book-filter.png`。

**交付**：`android-32`（target `6391fc0`，CI run 43539898766 成功，Range 复核 `com.glance.app` / `versionCode 32` / `versionName 1.0.6+32`，证书 SHA-256 `82:F7:…:C9:AF`，APK 13,175,977 字节）。

### 8.23 存储位置可配置 + 卸载不丢数据 + API Key 静态加密 ✅

**需求**：无论安装到哪个平台、安装/存储位置在哪，都能在应用内设置存储位置；默认路径固定不变、系统可找到存储文件（有路径展示）;即便删除 app，下次安装仍能看到之前的数据（除非人工删除）;敏感数据（API Key）确保安全。

**实现**

- **Electron 可配置数据目录**（`main.js`）：默认 `userData` 不变;指针文件 `userData/data-dir.json` 记录自定义目录，`currentDataDir()` 校验存在性、失效回退默认。`storage-set-dir` 弹框选目录→校验可写→目标已有 settings.json 则直接采纳（重装找回）否则迁移（read+write+rename 规避 Windows `CopyFileW` EPERM）→写指针;`storage-reset-dir` temp-first 拷回默认（旧默认留 `.prev-<ts>`）→删指针;`storage-open-dir` 资源管理器打开。
- **API Key 静态加密**（`main.js`）：原 `safeStorage`（Chromium OSCrypt）在本机 Windows 上**跨重启密钥不持久**（dev 与打包均复现：无 `Local State` os_crypt 密钥落盘），改用自管 **AES-256-GCM**：随机 32 字节密钥存默认私有目录 `glance-secret.key`（base64/0600，**永不进自定义/同步目录**）;`ai.key`/`dict.key` 密封为 `keyEnc`（前缀 `g1:` = iv12‖tag16‖密文 base64）;解密失败保留 `keyEnc` 不销毁（防空 key 落盘永久抹掉）;兼容旧 safeStorage blob best-effort。
- **Android 共享存储镜像**（新增 `GlanceStorage.java`，`MainActivity` 注册）：主存储仍私有 localStorage;镜像写共享目录 `Documents/Glance/Glance-learning-data.json`，API≥29 走 MediaStore 免权限、≤28 走 File + `WRITE/READ_EXTERNAL_STORAGE`（manifest `maxSdkVersion="28"`）;可选 SAF 自定义树（`pickFolder`/`clearFolder`）;`info/writeMirror/readMirror` 供 Web 调用;`build.gradle` 加 `androidx.documentfile`。镜像内容 = `Store.exportData()`，不含 Key/壁纸。
- **Web 核心**（`store.js`/`platform.js`/`app.js`）：`store.js` 加 flush hook（`setFlushHook`），`exportData` 剔除 `key`/`keyEnc`;`platform.js` 七个 storage 适配按平台分发;`app.js` `renderStorageUi` 三平台路径/说明/安全文案，`mirrorNow`/`scheduleMirror`（60s 节流）/`restoreFromMirror`，flush hook→镜像、`visibilitychange` 隐藏立即镜像、首启空数据→读镜像→确认→`importData(replace)`。设置→数据→「存储位置」面板。
- **文档**：`docs/DATA.md` 新增 §5.4 存储位置与持久化、§5.5 敏感数据安全，刷新 §1/§5/§6 行号引用与 §8 维护约定;README 加存储位置特性条目与「存储位置与安全」小节。

**验证（Electron + CDP）**：设测试 key→落盘 `ai.keyEnc` 以 `g1:` 开头、无明文 key、`glance-secret.key`（44B base64=32B）生成;**干净退出重启后 `Platform.getSettings()` 仍返回原 key**（safeStorage 失败的关键跨重启测试通过）;自定义目录 set/reset 后 key 仍可解密、密钥文件**不随迁移**（自定义目录无 key 文件，拷走数据无法读 Key）;存储面板正确显示默认路径与 AES-256 安全文案;测试 key 与 `.prev`/测试目录已清理。Android 原生无本地 SDK，仅 CI 编译验证（运行时未本地实测）。

**交付**：`android-34`（target `cda5116`，CI run 43548985332 成功，Range 复核 `com.glance.app` / `versionCode 34` / `versionName 1.0.6+34`，证书 SHA-256 `82:F7:…:C9:AF`，APK 13,188,375 字节）。

### 8.24 官方考纲词库为根 + 自定义词书考纲对比 ✅

**需求**：以《全国大学英语四、六级考试大纲（2016 年修订版）》PDF「词表」为官方根词库——逐行提取每个词条、保持原始顺序，按行首 ★ 分 A 组（无★，四级 / 一般要求）与 B 组（带★，六级 / 较高要求），输出两份纯文本列表;把官方词库放进词库作为根，用户导入自己的词书后可与官方考纲对比。

**提取（PDF → 两份 txt + official.json）**

- 源：`assets/words/《全国大学英语四、六级考试大纲（2016年修订版）》.pdf`，词表在第 21–149 页。PyMuPDF（`import pymupdf`）取文本层逐行提取，按行首 ★ 分组，得 **7,896 条**（A 6,632 / B 1,264），保持 PDF 原始顺序。
- PDF 文本层缺陷与校正：全角 `Ｇ`（U+FF27）在变体对里作省略号、在复合词里作连字符；`U+1001B3` 是丢失的 apostrophe（`o'clock`/`coup(d'état)`）；短语空格丢失；同形异义上标 `¹²³` 独行;可选字母括号跨行（`mo(u)ld`、`fulfil(l)`、`ag(e)ing`、`marvel(l)ous`）。**关键教训**：字符几何间距判空格不可靠（宽字母 m/w 的间距偏差 ≈3.3 与真实空格 ≈3.4 几乎相同，会把 accommodate 误拆成 accom modate）;改用同考纲家族分组参考 txt 作词典做**字典分词**校正，并还原变体对（`advisor/Ger → advisor/adviser`）与复合词连字符（`airGconditioning → air-conditioning`）。
- 产物：`assets/words/考纲词表-A组-四级(无星).txt`（6,632 行）、`考纲词表-B组-六级(带星).txt`（1,264 行）两份纯文本;`app/data/official.json`（`{source,note,cet4[],cet6[]}`，原始词条文本数组，保留变体 / 上标 / 可选字母 / 短语印刷形态，★ 已按组剥离）。155 个同形异义词、81 对英式变体均忠实保留;81 个参考 txt 未收的英式拼写（adviser/analyse/centre/connexion/theatre）经核对为正确异体。

**集成（官方书为根 + 对比）**

- `library.js`：新增官方区（[library.js:245-334](app/js/library.js#L219-L312)）——`officialForms` 归一化（去上标 → 按 `/` 拆变体 → 小写 → 展开可选字母括号）、`officialWordSet/officialCount/officialBook`（缓存）、`compareToOfficial(entries,level)` 返回 covered/beyond/missing + 双向覆盖率 + 三份词表。`listBooks` 把「考纲四级（官方）/ 考纲六级（官方）」**置顶**（[library.js:186-196](app/js/library.js#L186-L197)）;`getBook` 加官方分支（[library.js:163-164](app/js/library.js#L163-L164)），官方书经 `enrich` 可正常学习、标 `official:true`，**绕过** CEFR 质量过滤与 skipLower（官方 tag 不在 BOOK_RANK）。`init` 清官方缓存。
- 数据通道：`platform.js loadDataset` 与 `main.js get-dataset` 均加 `official`（[platform.js:123](app/js/platform.js#L123)）。
- `app.js`：`resolveBook(tag)` 统一解析自定义 / 官方 / 考试书（[app.js:275-278](app/js/app.js#L256-L260)）;`cmpSourceOptions/cmpSection/renderCompare`（[app.js:2071-2130](app/js/app.js#L2008-L2068)）渲染对比面板，`renderBooks` 末尾调用 `renderCompare`，官方书行标注「官方考纲」。
- `index.html`：词书与计划页加「考纲对比」面板（源书选择 `cmp-source` + 级别选择 `cmp-level` 四级/六级 + 结果区 `cmp-result`）;`app.css` 加摘要 / 覆盖率条 / 三个可折叠词表（考纲内绿 / 超纲琥珀 / 考纲缺失灰，每段限 300 词可展开全部）样式。

**验证（浏览器 + browser-use，127.0.0.1:8123）**：官方书置顶且可学习（abandon → 释义「vt. 放弃, 抛弃…」CEFR B1、词素 1）;考纲四级自比 100%;自定义导入 6 词 TSV（abandon/apple/mould/according to/adviser/zzzcustom）→ 对比四级 covered 5 / beyond 1（zzzcustom）/ coverageBook 83%，归一化正确命中 `mould↔mo(u)ld`、`adviser↔advisor/adviser`、短语 `according to`;三个折叠段展开 / 收起、展开全部词、级别切换均正常;五 tab 巡览无控制台错误。`officialCount` cet4=6,552（6,632 原始去重约 80 同形异义）、cet6=1,264;`officialWordSet` cet4=6,735 形、cet6=1,284 形。

**交付**：`android-35`（target `8f735f5`，CI run 43551989662 成功;CI apksigner 断言 `com.glance.app` / `versionCode 35` / `versionName 1.0.6+35` / 证书 `CN=Glance Debug`，固定签名 SHA-256 `82:F7:…:C9:AF`，APK 13,223,689 字节）。

### 8.25 开发期免费 AI API（DEV-ONLY，正式发布前必须移除）🚧

**需求**：在开发节点内置一个免费 OpenAI 兼容 API，开发期免填 Key 即可试用 AI 详解;**正式发布前去掉**，并在文件记录。

**端点 / 模型 / Key**

- Base URL：`https://developer.amd.com.cn/radeon/api/v1`（OpenAI 兼容 `/chat/completions`，Bearer 鉴权）。
- 模型（三选一，默认 `DeepSeek-V4-Flash`）：`DeepSeek-V4-Flash`、`DeepSeek-V4.1-Flash`、`GLM-5.3-Flash`。前两者支持 `response_format:{type:'json_object'}`;`GLM-5.3-Flash` 为推理模型（含 `reasoning` 字段，需更大 token 预算，应用未设 `max_tokens` 故可用）。
- Key：内置开发密钥见 [ai.js `DEV_FREE_API.devKey`](app/js/ai.js)（前缀 `rc-366f…f7c`，完整值仅存于该处，本文不重复明文）。**该 Key 随客户端代码公开分发，属公开开发密钥。**
- QNAI 免费端点（2026-11-14 增补，同为 DEV-ONLY）：Base URL `https://api.qnaigc.com/v1`（OpenAI 兼容 `/chat/completions`，Bearer 鉴权）。模型（二选一，默认 `qiniu/conatus-free`）：`qiniu/conatus-free`、`nvidia/nemotron-3-ultra-550b-a55b0-free`;Key 内置开发密钥见 [ai.js `QNAI_FREE_API.devKey`](app/js/ai.js)（前缀 `sk-9177…5691`，完整值仅存于该处，本文不重复明文）。**该 Key 同样随客户端代码公开分发。** `conatus-free` 实测可用且支持 `response_format:{type:'json_object'}`（推理模型，带 `reasoning_content`）;免费模型有**全局限流**（`429 free_campaign_global_limit`，命中后约数十秒可恢复）。`nemotron-3-ultra-550b-a55b0-free` 接入时上游持续返回 `upstream_error「service temporarily unavailable」`，含 25s/20s 退避的三次重试均未恢复——保留在清单中，上游恢复后可从下拉直接切换。

**实现（DEV-ONLY 区块集中于 ai.js，删块即移除）**

- [ai.js](app/js/ai.js)：新增 `DEV-ONLY` 标记块——`DEV_FREE_API` 常量（[ai.js:29-37](app/js/ai.js#L29-L37)，`id:'devfree'`、`dev:true`、`base/model/models/devKey/jsonMode`）+ `if (DEV_FREE_API) PROVIDERS.unshift(DEV_FREE_API)`，把「开发免费（发布前移除）」置顶。同区域内再注入 `QNAI_FREE_API`（[ai.js:42-50](app/js/ai.js#L42-L50)，`id:'qnafree'`、双模型 `models` 清单），现列服务商首位。`resolveConfig` 增加 `key = cfg.key || p.devKey`（用户 Key 优先，留空回退内置开发 Key）;新增 `effectiveKey(cfg)` 助手并导出;`explainWord` 改用解析后的 `rc.key`。**两个 DEV-ONLY 块共用同一套 `dev/devKey/models` 机制，新增免费预设只需再 `unshift` 一个常量。**
- [app.js](app/js/app.js)：两处生成守卫（`aiSection` 自动生成 / 手动生成）由 `cfg.key` 改为 `AI.effectiveKey(cfg)`，使内置 Key 也能触发生成;`syncAiProviderUi`（[app.js:2358](app/js/app.js#L2358)）对带 `models` 清单的服务商渲染**模型下拉选择器**（`#set-ai-model-select`，同时隐藏自由文本框），其余服务商保留文本输入，切换服务商自动切换形态并持久化所选模型;dev 服务商另显示 Key 占位符「内置开发密钥，留空即可」与开发提示条。
- [index.html](app/index.html)：AI 设置面板加 `#set-ai-dev-note` 提示条（默认隐藏，选任一 `dev:true` 服务商时显示，即 devfree 与 qnafree）与模型下拉 `#set-ai-model-select`（[index.html:746](app/index.html#L746)，默认隐藏）;[app.css](app/css/app.css) 加 `.dev-note` 琥珀色柔和样式与 `.field span small` 次级提示间距。
- [store.js](app/js/store.js)：开发期默认 `ai.provider` 由 `deepseek` 改为 `devfree`（[store.js:32](app/js/store.js#L32) 及 migrate 默认、app.js 回退），使免费模型开箱可见（devfree 三模型;QNAI Free 另二模型，需手动切换）;**发布移除时须改回 `deepseek`**（见移除清单）。
- **移除方法**：删除 ai.js 的 `DEV_FREE_API` 与 `QNAI_FREE_API` 两个整块（常量 + `if` 注入）即彻底移除;`resolveConfig/effectiveKey` 与 UI 的 `devKey/models` 回退随之自动失效（商用服务商都不带 `devKey`/`models`，模型栏自动回到文本输入）。**另须把 store.js / app.js 的默认 `ai.provider` 改回 `deepseek`**（见移除清单第 1 步）。

**用法**：我的 → AI 解释（开发期默认已选「开发免费（发布前移除）」）→ 开启「启用 AI 详解」→ Key 留空 → 在「模型」下拉三选一（默认 DeepSeek-V4-Flash）→ 单词详情点「生成 AI 解释」。可选「QNAI Free（发布前移除）」，下拉二选一（默认 `qiniu/conatus-free`），同样 Key 留空即用。

**验证**

- 连通性：`curl` 三模型均 HTTP 200;`DeepSeek-V4-Flash` 带 `response_format:json_object` 返回合法 JSON。
- 端到端（Node 实跑，镜像 Electron/Android 无 CORS 路径）：`AI.explainWord('conduct',…)` 经 `explainWord→llmChat→parseJson` 返回完整讲解（meanings/morphemes/memoryTip/examples/synonyms 齐全），`parseJson` 校验通过。
- 单元逻辑：devfree 置顶、留空回退 `rc-` Key、用户 Key 覆盖、模型覆盖、普通服务商（deepseek）不受影响（空 Key 仍为空）。
- 浏览器 UI（browser-use，no-cache 服务 127.0.0.1:8123）：选 devfree → 提示条显示、Key 占位符与模型清单正确、`effectiveKey` 解析为 `rc-`;mock 网络层后点真实「生成 AI 解释」按钮 → AI 详解区渲染释义/构词/巧记/例句/搭配/近义/词源，meta 显示「开发免费（发布前移除） · DeepSeek-V4-Flash」，缓存 provider=devfree。
- 模型选择器（browser-use，ignoreCache 重载）：devfree 默认选中、`#set-ai-model-select` 显示三模型且自由文本框隐藏;选 `GLM-5.3-Flash` 持久化到 `settings.ai.model`;切到 deepseek 自动隐藏下拉、恢复文本框与「留空使用默认」提示、隐藏开发提示条;切回 devfree 恢复下拉并保留所选模型;`resolveConfig` 对三模型均解析出正确 base/model/内置 Key。
- **QNAI 预设（2026-11-14）**：连通性 `curl` 实测 `qiniu/conatus-free` HTTP 200，带 `response_format:json_object` 返回合法 JSON;`nemotron-…-free` 三次重试均 `upstream_error`（见上）。端到端实跑（Node 无 CORS 路径）`AI.explainWord('conduct',…,{provider:'qnafree'})` 16.7s 返回完整讲解（meanings 3 / morphemes 2 / examples 3 / synonyms 6，ipa `ˈkɑːndʌkt`、cefr B2），首次尝试命中 `429` 全局限流、退避 40s 后成功。单元：`resolveConfig({provider:'qnafree'})` 解析出正确 base/model/内置 `sk-` Key 且 `jsonMode:true`、用户 Key 可覆盖、`explainWord` 回包 `provider='qnafree'`。浏览器 UI（ignoreCache 重载）：服务商下拉首位「QNAI Free（发布前移除）」、选中海绵提示「2 个模型可选，默认 qiniu/conatus-free」、下拉两模型且文本框隐藏、Key 占位符「内置开发密钥，留空即可」、开发提示条显示、`settings.ai.provider` 持久化;切 devfree 自动换回其三模型清单，切回 qnafree 回到其默认模型。控制台无报错。
- **平台限制**：该端点**不返回 CORS 头**且 OPTIONS 预检 405，故**浏览器直连 fetch 被 CORS 拦截**（对所有服务商一致，非本预设特有）;**Electron 走 IPC `llm-chat`、Android 走 CapacitorHttp，均无 CORS，可正常调用**（已由 Node 实跑证实）。

**发布前移除清单（务必执行）**

1. 删除 [ai.js](app/js/ai.js) 的 `DEV_FREE_API` 与 `QNAI_FREE_API` 两个整块（含各自 `if` 注入）;把 [store.js](app/js/store.js) 三处与 [app.js](app/js/app.js) 回退的默认 `ai.provider` 由 `devfree` 改回 `deepseek`;可选清理 `resolveConfig/effectiveKey` 的 `p.devKey` 回退与 UI 的 `p.dev/p.models` 分支（不清理亦无害，模型栏会自动回到文本输入）。
2. **到服务端作废 / 轮换这两个 Key**（devfree `rc-366f…`、QNAI `sk-9177…`）：Key 一旦推送到公开仓库即进入 git 历史，**删代码并不能抹除历史**，仅删代码不足以保密。
3. 重跑 CI 构建确认 APK 不含开发预设与内置 Key（可 `grep -rE "DEV_FREE_API|QNAI_FREE_API|rc-366f|sk-91774e" app/` 应为空）。
4. 注意：开发期若以 devfree / qnafree 导出过学习数据，备份 `settings.ai.provider`;移除后导入会回退到首个服务商（deepseek），属预期降级。

**交付**：`android-36`（target `ac3fc5b`，CI run 43554509635 成功;CI apksigner 断言 `com.glance.app` / `versionCode 36` / `versionName 1.0.6+36` / 证书 `CN=Glance Debug`，APK 13,224,727 字节）— `https://github.com/mjkyleo/Glance/releases/download/android-36/Glance-android.apk`。**此包内含 devfree 开发预设，仅供开发试用，非正式发布包。**

### 8.26 FSRS-6 对照验证旁路 + migrate 保真修复 + 组卷主题/词性交错 ✅

**需求与范围**：开发 [docs/FEATURES.md](docs/FEATURES.md) §13.1（FSRS 调度升级：引入/对照 ts-fsrs）与 §13.2（组卷 interleaving）。经确认本期只做**对照验证旁路**——引入 ts-fsrs 作参考、逐方法校验自研 FSRS-6 公式、发现偏差即修，**不替换在用调度器、零用户数据风险**;§13.2 落地主题/词性交错。迁移 ts-fsrs / 四档评分 / binding 优化器 / 复习推迟仍为 🔭 后续独立迭代。

**对照旁路（dev-only，不入正式包）**

- **vendor**：[scripts/vendor-ts-fsrs.mjs](scripts/vendor-ts-fsrs.mjs) 用 esbuild 把 **ts-fsrs 6.0.0 的 FSRS-6 模型**（`ts-fsrs/models/fsrs-6` + `@open-spaced-repetition/srs-kit` 的 Rating）打包为浏览器全局 [app/js/vendor/ts-fsrs.js](app/js/vendor/ts-fsrs.js)（IIFE，`window.TSFSRS`，19,407 字节，`npm run vendor:fsrs` 再生）。**预构建产物入库**，CI 无需 esbuild;不引入在用调度器。
- **对照引擎**：[app/dev/srs-contrast.js](app/dev/srs-contrast.js)（UMD，导出 `runContrast/mulberry32`）在相同 `{S,D,elapsed,grade}`、相同 21 权重、`Math.random()=0.5` 关闭 fuzz 下逐方法比对：retrievability / initDS(S,D) / nextD / nextS(recall·forget·short-term) / interval，外加 migrate 保真探针、整段随机复习序列、短期触发阈值探针。
- **双通道运行**：Node 运行器 [scripts/fsrs-contrast.mjs](scripts/fsrs-contrast.mjs)（`npm run contrast:fsrs`，`global.window=global` + `vm.runInThisContext` 加载 srs.js 与 vendor）与浏览器页 [app/dev/fsrs-contrast.html](app/dev/fsrs-contrast.html)（苹果风 harness，可改 seed/段数）。报告生成物 [docs/FSRS-CONTRAST.md](docs/FSRS-CONTRAST.md)。
- **纯内部函数导出**：[srs.js:195-196](app/js/srs.js#L195-L196) 增 `factor/initDS/nextD/nextS/boxFromS` 供旁路调用，**无行为改动**。

**核心 bug 修复：migrate() 保真守卫**

- **问题**：`migrate()` 原先每次非首复习都无条件以粗粒度 Leitner `INTERVALS[box]` 重置 `S/D`（经 [srs.js:90](app/js/srs.js#L90) 调用），使连续 FSRS 稳定度退化为近似 Leitner——对照整段序列 4200 步中 3893 步偏离、max|ΔS|≈145.77。
- **修复**：[srs.js:76-83](app/js/srs.js#L76-L83) 加保真守卫——含有效 `S>0 && D>0` 的状态**原样返回**，仅 legacy（无 S/D）状态按 box 升级。修复后 4200 步 **S/D 零偏离**，稳定度恢复连续增长（6 次「认识」、每次间隔 1 天探针 S：2.31→7.32→11.99→16.41→20.65→24.76，单调增长而非塌缩回 Leitner）。legacy 迁移仍正确（box:3→S=4,D=4.6），状态形状不变 → `Store.recordGrade` 集成安全、向后兼容、**无需数据迁移**。
- **稳定度边界对齐**：[srs.js:11](app/js/srs.js#L11) 新增 `S_MIN=0.001 / S_MAX=36500`（对齐 ts-fsrs `FSRS6_MODEL_BOUNDS`），[nextS srs.js:37-52](app/js/srs.js#L37-L52) 三个分支返回均 clamp;forget 分支先 clamp 再取 `min(forget, S/exp(w17·w18))`。
- **保留为设计取舍（非 bug）**：短期稳定度触发 `sameDay = elapsed<1`（Glance 以毫秒分数计 elapsed，24h 滚动窗近似同日）vs 参考 `t===0`;`0<elapsed<1` 时分支不同，已注明不改。

**§13.2 组卷主题/词性交错**

- 在 [quiz.js sample](app/js/quiz.js#L634) 既有「同根不连续 / 题型不连出三题 / 近期降权」上新增两条交错轴：
  - **主题**：[themeOf quiz.js:82](app/js/quiz.js#L82) 取首要主题（`Themes.themesOf(word)[0]`）;硬约束 [themeAllowed quiz.js:602](app/js/quiz.js#L602)「不连出三题同主题」+ 新主题加分 ×1.08 + 近期主题降权。
  - **词性**：[posGroup quiz.js:69](app/js/quiz.js#L69) 取词性组;硬约束 [posAllowed quiz.js:607](app/js/quiz.js#L607)「不连出三题同词性」+ 近期词性降权。
  - [candidateScore quiz.js:616](app/js/quiz.js#L616) 计入 `themeBonus/themePenalty/posPenalty`，惩罚随既有三段放宽（phase 0 严格 → phase 1 减半 → phase 2 忽略）逐级松弛，**保题量优先**;[buildScored quiz.js:691](app/js/quiz.js#L691) 候选附 `theme/pos`。

**生产隔离（旁路不进正式包）**

- Electron：[package.json](package.json) `build.files` 增 `!app/dev/**/*` 与 `!app/js/vendor/**/*`。
- Android：`cap sync` 会把整个 `app/` webDir 拷进 APK，故 [android-build.yml](.github/workflows/android-build.yml) 在 sync 后新增 `Strip dev-only FSRS contrast side-path` 步骤 `rm -rf android/app/src/main/assets/public/dev android/app/src/main/assets/public/js/vendor`。
- `index.html` 不引用 dev/vendor，正式应用不加载旁路。

**验证**

- **FSRS 对照（Node 实跑 `npm run contrast:fsrs`，seed 20261114 / 300 段 × 14 步）**：权重一致 true、decay 0.1542;方法级网格 retrievability/initDS/nextD/nextS(recall·forget·short-term)/interval **全部 0 deviation**（仅 nextS recall 127 样本为 precision 级，maxAbs 3.21e-5，源于参考逐步 roundTo 8 位）;migrate 探针 `S=24.4728247,D=4.99022837,box=4` → 原样保留（preserved=true）;整段 **4200 步 devS=0 / devD=0**;短期触发探针差异仅 `0<elapsed<1`（设计取舍）。
- **组卷交错（浏览器实测，当前词书 12 轮 × 20 题，online:false）**：词性最长连续段 **avg 2.0 / max 2**（随机基线 avg 3.75），主题最长连续段 **1.0**，题量填充率 **100%**、**零放宽**;`node --check` srs.js/quiz.js/旁路/vendor 全通过;控制台仅有道词典浏览器直连 CORS 报错（既有限制，Electron/Android 走 IPC/CapacitorHttp 正常），与本次改动无关。

**交付**：`android-37`（target `4c38e14`，CI run 43558201944 成功;12 步全绿，含新增第 8 步 `Strip dev-only FSRS contrast side-path` 与第 10 步 `Verify APK build metadata` 断言 `com.glance.app` / `versionCode 37` / `versionName 1.0.6+37` / 证书 `CN=Glance Debug`，APK 13,225,651 字节，较 android-36 仅 +924 字节，远小于旁路 ~37KB，佐证已剥离）— `https://github.com/mjkyleo/Glance/releases/download/android-37/Glance-android.apk`。**仍含 DEV-ONLY devfree 预设（§8.25），非正式发布包。** Release 资产 CDN 限速/超时，APK 核验依 CI 断言（见 §9）。

### 8.27 AI 模型选择器 + devfree 开发期默认 ✅

**需求**：用户反馈「配置好的三个免费 API 怎么没有」——免费预设的三个模型此前仅以一行提示文字呈现，且默认服务商为商用 DeepSeek，开箱看不到;要求把模型做成可见、可选的选择器。

**实现**

- [index.html:746](app/index.html#L746)：「模型」栏新增下拉 `#set-ai-model-select`（默认隐藏），与自由文本框 `#set-ai-model` 并存。
- [app.js:2454 syncAiProviderUi](app/js/app.js#L2454)：服务商带固定 `models` 清单时渲染下拉（列出全部模型、回填已选或默认值）并隐藏文本框;否则隐藏下拉、恢复文本框与「留空使用默认」提示。切换服务商自动切换形态。
- [app.js:2723-2730](app/js/app.js#L2612-L2618)：服务商 change 时若为固定清单则持久化所选模型;新增 `#set-ai-model-select` change 持久化所选模型。
- [store.js:32](app/js/store.js#L32)（含 migrate 默认）与 [app.js:2437](app/js/app.js#L2437) 回退：开发期默认 `ai.provider` 由 `deepseek` 改为 `devfree`，三个免费模型开箱可见。**发布移除时改回 `deepseek`**（§8.25 清单第 1 步）。
- [app.css:855](app/css/app.css#L855)：`.field span small` 次级提示加 6px 间距 + 12px 浅色，标签与提示不再粘连。

**验证**（browser-use，ignoreCache 重载 127.0.0.1:8123）：devfree 默认选中、下拉显示 `DeepSeek-V4-Flash / DeepSeek-V4.1-Flash / GLM-5.3-Flash` 且文本框隐藏;选 `GLM-5.3-Flash` 持久化到 `settings.ai.model`;切 deepseek 隐藏下拉、恢复文本框与「留空使用默认」提示、隐藏开发提示条;切回 devfree 恢复下拉并保留所选模型;`resolveConfig` 对三模型均解析出正确 base/model/内置 Key。控制台仅既有 devfree 端点浏览器直连 CORS 报错（§8.25 平台限制，Electron/Android 正常），与本次改动无关。

**交付**：`android-38`（target `5a6e183`，CI run 43560074848 成功;12 步全绿，第 8 步 `Strip dev-only FSRS contrast side-path` + 第 10 步 `Verify APK build metadata` 断言 `com.glance.app` / `versionCode 38` / `versionName 1.0.6+38` / 证书 `CN=Glance Debug`，APK 13,225,912 字节，较 android-37 +261 字节）— `https://github.com/mjkyleo/Glance/releases/download/android-38/Glance-android.apk`。**仍含 DEV-ONLY devfree 预设（§8.25），非正式发布包。** Release 资产 CDN 限速/超时，APK 核验依 CI 断言（见 §9）。

### 8.28 AI 连通性测试 + 可操作的网络错误提示 ✅

**需求**：用户反馈学习页 AI 详解报「生成失败：Failed to fetch」，且要求在「模型」一侧加一个连通性测试，便于在不生成整段讲解的情况下快速验证端点可达性。

**根因**：`Failed to fetch` 是浏览器 fetch 的笼统网络错误。devfree 端点**不返回 CORS 头**（§8.25 平台限制），纯浏览器预览直连必被拦截;Electron（IPC `llm-chat` → `net.fetch`）与 Android（CapacitorHttp）走原生通道不受 CORS 限制。另该端点响应慢（curl 实测 ~27s），原 60s/无超时设置易误报。

**实现**

- [index.html:747-750](app/index.html#L747-L750)：「模型」栏下方新增测试行 `#set-ai-test`（测试连通性按钮）+ `#set-ai-test-result`（结果文本）。
- [app.css:1123-1126](app/css/app.css#L1123-L1126)：`.ai-test-row` 横向 flex 换行;`.ai-test-result` 12px 浅色，`.ok` 绿 / `.bad` 红。
- [app.js:2733-2746](app/js/app.js#L2624-L2637)：测试监听器——`AI.resolveConfig` 取当前服务商/模型/Key，缺 base/model 或 key 时给出填写提示;否则发一条 `ping` 最小请求（`temperature:0`、不开 jsonMode），计时并显示 `✓ 连通正常 · 模型 · 耗时s` 或 `✗ 错误`;测试期间禁用按钮防重复点击。
- [app.js:2477-2478](app/js/app.js#L2381-L2382)：`syncAiProviderUi` 切换服务商时清空测试结果与配色，避免残留上一服务商的结论。
- [platform.js:210](app/js/platform.js#L210)、[platform.js:220](app/js/platform.js#L220)、[platform.js:224](app/js/platform.js#L224)、[platform.js:227-233](app/js/platform.js#L227-L233)：`llmChat` 统一 `timeout=120000`;CapacitorHttp `connectTimeout/readTimeout` 由 60s 提至 120s;浏览器 fetch 包 `AbortController` 120s 超时。
- [platform.js:226-233](app/js/platform.js#L226-L233)：错误分类——`abort/timeout` → 「请求超时（120 秒无响应）…」;纯浏览器且 `Failed to fetch/NetworkError/…` → 「浏览器直连失败（CORS 拦截或网络不可达）…请改用 Windows（Electron）或 Android 端…」;其余原样返回。学习页生成失败因此自动显示可操作提示而非裸 `Failed to fetch`。
- [main.js:337-340](main.js#L337-L340)、[main.js:348-352](main.js#L348-L352)：Electron `llm-chat` 同样加 `AbortController` 120s + `finally clearTimeout`，catch 增加超时分类，与 web 端口径一致。

**验证**（browser-use，ignoreCache 重载 127.0.0.1:8123）：点「测试连通性」返回 `✗ 浏览器直连失败（CORS 拦截或网络不可达）…`（`.ai-test-result.bad`），按钮恢复可用;`AI.explainWord` 生成失败显示同一可操作提示（取代 `Failed to fetch`）;切换服务商结果清空;`node --check` app.js/platform.js/main.js 全通过;截图确认测试行布局（按钮左、结果右、自动换行）符合简洁风格。浏览器无法直连无 CORS 端点属平台限制（§8.25），Electron/Android 正常。

**交付**：`android-39`（target `b63a4ff`，CI run 43561380238 成功;12 步全绿，第 8 步 `Strip dev-only FSRS contrast side-path` + 第 10 步 `Verify APK build metadata` 断言 `com.glance.app` / `versionCode 39` / `versionName 1.0.6+39` / 证书 `CN=Glance Debug`，APK 13,226,822 字节，较 android-38 +910 字节）— `https://github.com/mjkyleo/Glance/releases/download/android-39/Glance-android.apk`。**仍含 DEV-ONLY devfree 预设（§8.25），非正式发布包。** Release 资产 CDN 限速/超时，APK 核验依 CI 断言（见 §9）。

### 8.29 导航/返回栈 + 原生震动 + 词书选择与过滤增强 ✅

**需求**（用户五条）：① 词书与计划里选书后不要直接跳去学习页;② App 端一些 UI 缺震动反馈;③ App 端按返回键直接退出而非回上一页，需整理各页面切换逻辑;④ 选中词书后其下可多选其它词书做过滤;⑤ 词书过滤新增「过滤基础词」（a/the/that 等小学/初中极基础词，默认开启、可关）。

**实现**

- **选书不跳转**：[app.js:2246 switchBook](app/js/app.js#L2246) 移除 `setMode('study')/switchView('study')/renderStudy()`，仅更新 activeBook + 重建会话 + 重渲染词书页 + 刷新计划条，停留在「词书与计划」。
- **返回栈（Android）**：新增依赖 `@capacitor/app`。[app.js:34-36](app/js/app.js#L34-L36) 定义 `TOP_VIEWS/SUB_VIEWS/navStack`;[app.js:37 switchView](app/js/app.js#L37) 仅在「顶层 tab → 顶层 tab」时压栈（`fromBack` 不压）;[app.js:68 handleBack](app/js/app.js#L68) 统一返回优先级：嵌套弹层 → 弹层 → 子页（books/stats/ai 回 subReturn）→ 测试态回学习态 → 弹 tab 历史 → 根节点才退出;[app.js:2546-2548](app/js/app.js#L2546-2548) 原生注册 `App.backButton`，`handleBack()` 返回 false 时 `App.exitApp()`。浏览器/Electron 不注册，无副作用。
- **原生震动**：新增依赖 `@capacitor/haptics`（插件 manifest自带 `VIBRATE` 权限）。[platform.js:92 haptic](app/js/platform.js#L92) 仅原生生效（impact/notification），Electron/浏览器 no-op。触点：评分 [app.js:541](app/js/app.js#L541)（认识=success/模糊=warn/忘记=error）、答题 [app.js:1000](app/js/app.js#L1000)（对=success/错=error）、tab/模式切换/选书/过滤开关/排除词书 chip 均为 light tap。
- **过滤基础词（默认开）**：[library.js:221 BASIC_WORDS](app/js/library.js#L221)（326 个小学/初中极基础词）+ [library.js:223 basicWordSet](app/js/library.js#L223);[store.js:26](app/js/store.js#L26)、[store.js:80-84](app/js/store.js#L80-L84) `bookFilter.skipBasic` 默认 true（旧数据缺省视为开）;[app.js:282 studyEntries](app/js/app.js#L282) 裁剪每日队列;[index.html:349](app/index.html#L349) 开关 + [app.js:2120](app/js/app.js#L2120) 回填。
- **多书排除过滤**：[library.js:229 excludeWordSet](app/js/library.js#L229)（多选词书词集并集，带缓存）;`bookFilter.excludeBooks[]` 持久化;[app.js:2221 renderExcludeChips](app/js/app.js#L2221) 在过滤面板渲染除当前书外的全部词书 chip（可多选、选中高亮）;[index.html:351-353](app/index.html#L351-L353) 容器 + [app.css:1035-1039](app/css/app.css#L1035-L1039) chip 样式（随主题圆角/配色）;[app.js:282](app/js/app.js#L282) 队列裁剪;过滤 hint 汇总「基础词/低阶重复/词书重复/已掌握」四类裁剪数与剩余词数。
- 过滤仍**只裁剪每日学习队列**，词书本身与测试范围不变（沿用 §1.5 约定）。

**验证**（browser-use，ignoreCache 重载 127.0.0.1:8123）：选「考纲四级（官方）」后仍停留词书页（`view-books` 可见、`view-study` 隐藏）;`skipBasic` 默认勾选、基础词集 326;排除 chip 14 个，选「四级词库」后 `excludeBooks=['四级']`、hint「词书重复 2300」；基础词开=312/关=0 且剩余词数相应变化;`books-back` 回「我的」、tab 切换正常;控制台无报错;`node --check` 全通过;`npx cap sync android` 识别 3 插件（text-to-speech/app/haptics）。震动与硬件返回为原生能力，浏览器仅验证 no-op 与逻辑不回归，实机效果随 APK 交付。

**交付**：`android-40`（target `4b1dde0`，CI run 43563901478 成功;12 步全绿，第 8 步 `Strip dev-only FSRS contrast side-path` + 第 10 步 `Verify APK build metadata` 断言 `com.glance.app` / `versionCode 40` / `versionName 1.0.6+40` / 证书 `CN=Glance Debug`，APK 13,234,588 字节，较 android-39 +7,766 字节）— `https://github.com/mjkyleo/Glance/releases/download/android-40/Glance-android.apk`。**仍含 DEV-ONLY devfree 预设（§8.25），非正式发布包。** Release 资产 CDN 限速/超时，APK 核验依 CI 断言（见 §9）。

### 8.30 查词在线化 + UAPI 中英词典集成 + 多源回退 ✅

**需求**（用户）：查词页只查本地词库，本地没有就「没有匹配结果」;要求改用词典联网查、查到后缓存到本机;分析并集成 dictionaryapi.dev 与 uapis.cn 两个免费词典 API。默认服务商经确认保持有道（无积分限制），UAPI 作回退增强。

**勘察结论**

- 查词 tab `runSearch()` 仅调 `Library.search()`（本地索引），无在线入口（[app.js:1707](app/js/app.js#L1707) / [library.js:358](app/js/library.js#L358)）;「联网 + 按词缓存」机制其实已存在（dictionary.js `lookup` → [store.js:316-318](app/js/store.js#L316-L318) `saveDictEntry`），只在打开单词卡的词典分区触发（[app.js:1592](app/js/app.js#L1592)），非本地词开卡会自动查并缓存（[app.js:1413](app/js/app.js#L1413)）。缺口是搜索页不给打开非本地词的入口。
- dictionaryapi.dev 已集成为 `free` 服务商;实测 CORS `*`，纯浏览器可用，仅英英释义。
- uapis.cn `/api/v1/dictionary/lookup?word=`：实测免 Key（访客积分，2 积分/次，4 QPS），200 返回中英双释义 + 英美音标音频 + 考试标签 + 词形变化 + 词组 + 近义 + 双语例句;**无 CORS 头**，仅原生通道可用;真实 `definitions[].meaning` 内嵌词性（"adj. …"），`audio` 为相对路径。

**实现**

- **UAPI 服务商**：[dictionary.js:9](app/js/dictionary.js#L9) PROVIDERS 新增 `uapis`;[dictionary.js:209 normalizeUapis](app/js/dictionary.js#L209) 解析内嵌词性、按词性归并中英义项、补全 `https://uapis.cn` 音频主机、映射考试标签、折叠双语例句与近义、保留词形变化/词组;[dictionary.js:369 buildUrl](app/js/dictionary.js#L369)、[:404 attempt 路由](app/js/dictionary.js#L416)、[:464 导出](app/js/dictionary.js#L464)。
- **多源回退**：[dictionary.js:451 FALLBACK](app/js/dictionary.js#L451) 有道→UAPI→dictionaryapi.dev（UAPI→有道→free，free→UAPI→有道）;命中「未找到该词」即停，省 UAPI 积分;回退来源记于 `record.fallbackFrom`，[app.js:1531](app/js/app.js#L1531) 显示「已从〈源〉回退」。
- **查词在线入口**：[app.js:1716](app/js/app.js#L1716) 无本地精确匹配时置顶「在线查词：〈query〉」行（[app.js:1720](app/js/app.js#L1720)），点击 `openWordSheet(query,true)` 复用既有联网 + 缓存;[app.css:1040](app/css/app.css#L1040) 标题用主题强调色。
- **词典渲染增强**：[app.js:1563](app/js/app.js#L1563) 词形变化、[:1571](app/js/app.js#L1571) 常见词组（复用既有 dict-* 样式，无新增 CSS）;服务商选择器 [app.js:2482 简介](app/js/app.js#L2482)、[:2499 标记 U](app/js/app.js#L2499)。
- 缓存沿用 `store.dictCache`，导出/导入已覆盖，**无 schema 改动**;默认服务商仍 `freezh`。

**验证**

- Node 单测 `normalizeUapis` 对 uapis.cn 实时返回（present）：词性 adj./n./v. 归并、中英义项、音频补主机、考试标签映射（中考/高考/四级/六级/考研/雅思）、词形/词组齐全。
- browser-use（ignoreCache 重载 127.0.0.1:8123）：查「defenestration」（本地未收录）出现在线查词行→点击开卡→自动联网;浏览器下有道/UAPI 均被 CORS 拦截→回退 dictionaryapi.dev 成功并**缓存到本机**（`Store.dictEntry` 命中，meta「免费词典 (dictionaryapi.dev) · 已从中英词典回退」）;服务商选择器渲染 5 行含 UAPI（标记 U/免 Key）;注入 UAPI 缓存记录开卡渲染「词形变化/常见词组」正确;控制台仅有预期的有道/UAPI CORS 报错（已被回退处理），无其它 JS 错误;`node --check` app.js/dictionary.js 通过。UAPI 直连为原生能力，实机随 APK 交付。

**交付**：`android-41`（target `91f5ef3`，CI run 43567367381 成功;12 步全绿，第 8 步 `Strip dev-only FSRS contrast side-path` + 第 10 步 `Verify APK build metadata` 断言 `com.glance.app` / `versionCode 41` / `versionName 1.0.6+41` / 证书 `CN=Glance Debug`，APK 13,236,335 字节，较 android-40 +1,747 字节）— `https://github.com/mjkyleo/Glance/releases/download/android-41/Glance-android.apk`。**仍含 DEV-ONLY devfree 预设（§8.25），非正式发布包。** Release 资产 CDN 限速/超时，APK 核验依 CI 断言（见 §9）。

### 8.31 QNAI 免费 AI 服务商（DEV-ONLY 第二预设 + 双模型下拉）✅

**需求**：把 QNAI（`api.qnaigc.com`）配置成一个服务商，模型栏可选其两个免费模型（用户提供 curl 示例与 Key）。

**实现**：`ai.js` 在同一 DEV-ONLY 区域内追加 `QNAI_FREE_API` 常量并 `unshift`（[ai.js:42-50](app/js/ai.js#L42-L50)）——`id:'qnafree'`、`name:'QNAI Free（发布前移除）'`、`dev:true`、`base:'https://api.qnaigc.com/v1'`、`model:'qiniu/conatus-free'`、`models:['qiniu/conatus-free','nvidia/nemotron-3-ultra-550b-a55b0-free']`、`devKey`（前缀 `sk-9177…5691`）、`jsonMode:true`。**零 UI/schema 改动**：模型下拉、Key 占位符、开发提示条全部沿用 §8.27 的 `models`/`dev` 数据驱动机制，服务商清单由 14 → 15 项（qnafree 现列首位）。开发期默认仍为 devfree，未改。

**实测**（详见 §8.25「QNAI 预设」验证条）：`qiniu/conatus-free` 可用且支持 JSON 模式（端到端 16.7s 返回完整讲解），免费档有全局限流 `429 free_campaign_global_limit`;`nvidia/nemotron-3-ultra-550b-a55b0-free` 接入时上游持续 `upstream_error`，已保留在清单中待其恢复。

**交付**：`android-42`（target `a12ba4e`，CI run 43571028601 成功;12 步全绿，第 8 步 `Strip dev-only FSRS contrast side-path` + 第 10 步 `Verify APK build metadata` 断言 `com.glance.app` / `versionCode 42` / `versionName 1.0.6+42` / 证书 `CN=Glance Debug`，APK 13,236,662 字节，较 android-41 +327 字节）— `https://github.com/mjkyleo/Glance/releases/download/android-42/Glance-android.apk`。**仍含 DEV-ONLY devfree + qnafree 预设（§8.25），非正式发布包。** Release 资产 CDN 限速/超时，APK 核验依 CI 断言（见 §9）。

---

## 9. 关键约束与注意事项

- **URL 完整性**：工具 URL 必须匹配当前任务目标，严禁替换为 routify 等临时代理；历史调用不代表正确，每次重新核对来源。
- **推送安全**：仅 SSH（HTTPS 被墙）+ 专用密钥 `id_ed25519_glance`（comment `mjkyleo-glance`），`GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519_glance -o IdentitiesOnly=yes"`。**不得触碰/使用** `sczhang0504` 的默认密钥 `~/.ssh/id_ed25519`。
- **提交隐私**：用 noreply 邮箱，勿暴露私有 `437257976@qq.com`。
- **开发期免费 AI（发布前移除）**：`ai.js` 内置两个 DEV-ONLY 预设 `DEV_FREE_API`（devfree）与 `QNAI_FREE_API`（qnafree，QNAI 双模型），各带公开开发 Key（见 §8.25）。**正式发布前必须删除这两整块并到服务端作废 Key**（Key 已进公开 git 历史，删代码不抹历史）；发布构建前 `grep -rE "DEV_FREE_API|QNAI_FREE_API|rc-366f|sk-91774e" app/` 须为空。
- **FSRS 对照旁路（dev-only）**：`app/dev/` 与 `app/js/vendor/ts-fsrs.js` 仅供对照验证（§8.26），**不得进入正式包**——Electron 由 `build.files` 排除、Android 由 CI `Strip dev-only FSRS contrast side-path` 步骤删除;**不得据旁路直接替换在用调度器**（迁移需另行评估用户数据兼容性）。改 `srs.js` 公式或 ts-fsrs 版本后须重跑 `npm run contrast:fsrs` 刷新报告。
- **本地工具链**：无 Android SDK（靠 CI）；WMI 启动 Electron；CDP（端口 9222）截图/smoke；npmmirror；本机无 `gh`，repo 公开（api.github.com 可达）。
- **渲染层改动**：renderer-only 改动 `Page.reload` 即可；`main.js` 改动需重启 Electron。
- **Node harness**：需 `global.window=global`；Git Bash 用 `taskkill //F //PID`。
- **记忆**：仅在用户明确要求时修改持久记忆。

---

## 10. 变更日志（Git）

| 提交 | 内容 |
|---|---|
| `a12ba4e` | QNAI 免费 AI 服务商预设（DEV-ONLY，§8.31）：`ai.js` 同区追加 `QNAI_FREE_API`（`api.qnaigc.com/v1`，`id:'qnafree'`，双模型下拉 `qiniu/conatus-free`（默认，实测可用 + JSON 模式;免费档全局限流 429）/ `nvidia/nemotron-3-ultra-550b-a55b0-free`（上游暂不可用，待恢复）+ 内置开发 Key），复用 §8.27 的 `dev/devKey/models` 数据驱动机制，零 UI/schema 改动，服务商 14→15 项;开发期默认仍 devfree;DEVELOPMENT §8.25/§8.31/§9 + FEATURES §6.1/矩阵同步（并修正 FEATURES 中 app.js/platform.js 的过期行号引用） |
| `91f5ef3` | 查词在线化 + UAPI 中英词典 + 多源回退（§8.30）：查词页对本地未收录词置顶「在线查词」入口，点击即联网查询并按词缓存（复用 `Dictionary.lookup → saveDictEntry`）;新增 UAPI 服务商（免 Key，中英双释义/英美音标音频/考试标签/词形/词组/近义/双语例句），`normalizeUapis` 解析内嵌词性、补全音频主机、映射考试标签;多源回退 有道→UAPI→dictionaryapi.dev，命中「未找到该词」即停省积分，词卡显示「已从〈源〉回退」;词卡新增词形变化/常见词组渲染;默认仍 freezh，无 schema 改动;DEVELOPMENT §8.30 + FEATURES §5/矩阵 + README 同步 |
| `4b1dde0` | 导航/返回栈 + 原生震动 + 词书选择与过滤增强（§8.29）：选书停留「词书与计划」不再跳学习页;新增 `@capacitor/app` 统一硬件返回优先级（嵌套弹层→弹层→子页→测试态→tab 历史→根节点退出）;新增 `@capacitor/haptics`，评分/答题 success/warn/error、tab/模式/选书/过滤 light tap（仅原生）;词书过滤新增「过滤基础词」（326 个小学/初中极基础词，默认开、可关）+ 多选其它词书排除 chip，仅裁剪每日队列;DEVELOPMENT §8.29 + FEATURES §1.5/§2.6/§12.3/矩阵 + README 同步 |
| `b63a4ff` | AI 连通性测试 + 可操作网络错误（§8.28）：模型栏新增「测试连通性」按钮（最小 ping 请求 + 耗时/错误显示，切换服务商清空）;`llmChat`/`llm-chat` 错误分类为超时（120s）与浏览器 CORS 可操作提示，取代裸 `Failed to fetch`;三端 LLM 超时统一 120s（CapacitorHttp connect/read、浏览器 AbortController、Electron net.fetch）适配慢端点;DEVELOPMENT §8.28 + FEATURES §6.1/矩阵 + README 同步 |
| `5a6e183` | AI 模型选择器 + devfree 开发期默认（§8.27）：带固定模型清单的服务商（devfree）在「模型」栏渲染下拉，三模型 DeepSeek-V4-Flash / DeepSeek-V4.1-Flash / GLM-5.3-Flash 直接可选，其余服务商保留文本输入;切换服务商自动切换形态并持久化所选;默认 ai.provider 改 devfree 使免费模型开箱可见（发布改回 deepseek）;次级提示间距/浅色样式;DEVELOPMENT §8.25/§8.27 + FEATURES §6.1 + README 同步 |
| `4c38e14` | FSRS-6 对照验证旁路（FEATURES §13.1/§13.2，仅对照不迁移）：vendor ts-fsrs 6 FSRS-6 模型为浏览器全局 + dev 对照 harness（Node `contrast:fsrs` / 浏览器页）+ 报告 FSRS-CONTRAST.md;修复 migrate() 每次复习以 Leitner box 重置 S/D 的核心 bug（保真守卫，4200 步零偏离）+ 稳定度边界对齐 sMin/sMax;组卷主题/词性交错（不连出三题同主题/词性，词性最长连续段 2 vs 随机 3.75、填充 100%、零放宽）;旁路经 build.files + CI strip 步骤排除出正式包 |
| `ac3fc5b` | 开发期免费 AI 预设（DEV-ONLY，发布前移除）：ai.js 内置 devfree 免费 OpenAI 兼容服务商（默认 DeepSeek-V4-Flash，另 DeepSeek-V4.1-Flash / GLM-5.3-Flash），Key 留空回退内置开发 Key;单一移除点 DEV_FREE_API 块;DEVELOPMENT §8.25/§9 + FEATURES §6.1 + DATA §5.5 记录移除清单与公开 Key/git 历史警示 |
| `8f735f5` | 官方考纲词库为根：2016 修订版四六级大纲词表逐行提取（A 无★ 6,632 / B 带★ 1,264）→ official.json + 两份纯文本;考纲四级/六级官方书置顶可学习;词书「考纲对比」面板（考纲内/超纲/缺失 + 双向覆盖率）;功能全景文档 FEATURES.md |
| `cda5116` | 修复 GlanceStorage 文件夹选择器适配 Capacitor 6 activity-result API（存储功能交付 android-34） |
| `92b8b93` | 存储位置可配置（Windows 自定义目录 / Android 共享目录镜像卸载不丢）+ API Key AES-256-GCM 静态加密（密钥只留本机私有目录，备份/镜像不含 Key）+ 数据规范文档 DATA.md |
| `6391fc0` | 词书过滤可选开关：跳过低阶重复词（考试阶梯）+ 跳过已掌握，仅影响每日学习队列，词书与测试范围不裁剪 |
| `c65087d` | 听音选词（音标音近干扰项）+ 打卡日历月份/日期 + 词根词缀学习进度条与开关 + 头像去掉摄像头角标 |
| `f3fde1d` | 移除词根/专项/查词/我的顶部品牌栏（眼睛图标 + Glance + 词库），首屏直接进入内容 |
| `a99523d` | 词典服务商改成二级底部弹层卡片选择（推荐/Key 徽章 + 能力说明）；测试「结束」收进顶部胶囊，操作条仅答错时显示 |
| `7df96ee` | 自定义词书导入修复：底部常驻入口 + 空状态、Android 文件输入挂载 DOM、CSV/BOM/表头/去重与重名处理 |
| `55356ef` | 「我的」头像与昵称：256px 方形裁剪 + WebP 压缩、仅存本机，随备份导出/覆盖导入恢复 |
| `72ab21a` | 测试流程重做：设置收进齿轮面板、入口只留开始；答对自动跳题、答错展示全部义项与可点开的选项单词、上一题回顾 |
| `a65dd82` | 设置并入「我的」：去掉顶栏/工具栏齿轮，六项设置平铺为紧凑列表，面板直开对应分区 |
| `26b3070` | 详细讲解页重构：自动查词、刷新/删除图标、AI 自动生成开关、词根+词源合并、卡片紧凑化 |
| `209d866` | Android 版本名带构建号（`1.0.6+23`）+ CI 断言 APK 版本与签名证书 |
| `8d89844` | Android 构建注入递增 versionCode + 仓库内固定调试签名，修复新包无法覆盖安装 |
| `c50253f` | G 形词根标记替换全平台图标（ico/icns/Android 传统+自适应+monochrome/启动图）+ `gen-icons.js` 单一矢量源 |
| `e668593` | 记录 Releases 排序修复与 `android-20` 交付 |
| `550d5d6` | 删除卡在列表顶部的 `android-7/8/9` release（保留 tag），Releases 恢复从新到旧 |
| `291c19d` | 移除每轮构建的旧 Release 标题回填 + 文档提交不触发 APK 构建 + README 下载指向 `/releases/latest` |
| `85a3149` | 背景壁纸（压缩存储/蒙版/模糊）+ 测试引擎与测试页重做（6 范围/3 题型/自动难度/约束/干扰项）+ 文档截图（P13） |
| `9c5294d` | 主题级 UI/UX：逐主题字体/圆角/阴影/密度/动效/底栏/底纹 token + 深色适配 + 文档与截图（P12） |
| `5714557` | 8 套 ui-style-selector 主题 + 次强调色渐变 + 深浅色重校 + 文档截图重拍（P11） |
| `eb42460` | 学习面板拖动/箭头排序 + 顺序持久化与导出导入（P10） |
| `036b51b` | 修复历史 Release 标题回填（`--json name`）+ pipeline-only 构建标题兜底 |
| `2e60e7b` | 五套配色主题 + 设置分类 + 我的（统计/设置入口）+ 动态 Release 标题（P9） |
| `d508f33` | 学习面板 11 项内容开关 + 学习页信息增强 + 柔和进度条 + 词典标签去重 |
| `365e71e` | 记录有道词典版 APK 交付（`android-10`） |
| `9948be9` | 合并 ImgBot 图片优化（Android 启动图/图标压缩） |
| `f0e353d` | 接入有道中英词典（中文释义/双音标/双语例句/考试标签/助记/中译英 + 免费源自动回退） |
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

**交付物**：`android-41` APK（**开发包**：含 DEV-ONLY 免费 AI 预设 devfree，发布前须移除;新增查词在线入口（本地未收录词联网查询并缓存）+ UAPI 中英词典（免 Key，中英双释义/英美音标音频/词形/词组/近义/双语例句）+ 多源回退（有道→UAPI→dictionaryapi.dev）;含导航/返回栈（硬件返回逐级回退而非退出）+ 原生震动反馈 + 词书选择停留原页 + 多书排除过滤 + 基础词过滤（默认开）;含 AI 连通性测试 + 可操作网络错误提示 + 三端 LLM 超时 120s + AI 模型选择器（三免费模型下拉）+ devfree 开发期默认;含 FSRS-6 对照验证旁路 + migrate 保真修复 + 组卷主题/词性交错，对照旁路已剥离出包;并含官方考纲词库为根 + 词书考纲对比 + 存储位置可配置 / 卸载不丢镜像 / API Key 加密，versionCode 41 / versionName `1.0.6+41`）— `https://github.com/mjkyleo/Glance/releases/download/android-41/Glance-android.apk`（13,236,335 字节）；历史版本 `android-2`–`android-6`、`android-10`–`android-40` 保留在 Releases，`android-7/8/9` 的 release 已按用户要求删除（git tag 保留）。