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

- 最新提交：`55356ef`（`main`），「我的」支持头像与昵称：图片自动裁剪压缩后仅存本机，昵称最多 16 字符，随备份导出/覆盖导入恢复。
- 最新交付：`android-27` APK → `https://github.com/mjkyleo/Glance/releases/download/android-27/Glance-android.apk`（13,168,277 字节）。
- 工作区：干净（`.scratch/` 为本地调试产物，已忽略；`assets/` 下两张用户提供的 Logo 参考图未提交）。
- 任务清单：P7–P13 功能全部完成，回归与专项验证见 §8.5–§8.13；**不能按编号折算完成度**，以本文实际勾选为准。

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

**交付物**：`android-27` APK（头像与昵称编辑，versionCode 27 / versionName `1.0.6+27`）— `https://github.com/mjkyleo/Glance/releases/download/android-27/Glance-android.apk`（13,168,277 字节）；历史版本 `android-2`–`android-6`、`android-10`–`android-26` 保留在 Releases，`android-7/8/9` 的 release 已按用户要求删除（git tag 保留）。