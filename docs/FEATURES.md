# Glance 功能全景与迭代规划

> 本文逐模块说明 Glance 的**全部功能**、**已实现状态**与**后续可迭代优化方向**，作为产品与开发的单一参照。
> 实现细节与逐项验证记录见 [DEVELOPMENT.md](../DEVELOPMENT.md);数据 schema 见 [DATA.md](DATA.md)。
> 文中 `文件:行号` 为编写时（2026-11-14，`android-42`）核实的代码位置，重构后需同步更新。

**状态标记**

- ✅ 已实现并实测（浏览器 / Electron / CI 构建验证）
- 🚧 已实现但有已知局限（见各节「局限」）
- 🔭 规划中 / 可迭代优化（**尚未实现**，见 §13）

**架构一句话**：一套共享 Web 核心 `app/` 同时跑在 Electron（Windows）、Capacitor（Android）与浏览器;`platform.js` 按平台分发存储 / 网络 / 发音 / 文件能力，业务逻辑全部平台无关。

| 模块文件 | 行数 | 职责 |
|---|---|---|
| [app.js](../app/js/app.js) | 3088 | UI 渲染、交互、会话编排、设置、导航返回栈 |
| [quiz.js](../app/js/quiz.js) | 797 | 测试引擎：组卷、难度、干扰项、约束 |
| [store.js](../app/js/store.js) | 694 | 持久化 + 学习域逻辑（SRS 状态、计划、日志、收藏） |
| [library.js](../app/js/library.js) | 492 | 词书组织、词条富化、官方考纲、对比、过滤词集 |
| [dictionary.js](../app/js/dictionary.js) | 632 | 外部词典：4 内置源 + 自定义端点、逐源开关、并行合并去重、按词缓存与全网失败兜底 |
| [platform.js](../app/js/platform.js) | 308 | 平台适配（存储/网络/发音/文件/镜像/震动） |
| [themes.js](../app/js/themes.js) | 244 | 专项主题分类器（29 主题） |
| [srs.js](../app/js/srs.js) | 197 | FSRS-6 调度内核 + 个性化优化 |
| [ai.js](../app/js/ai.js) | 142 | 大模型按词讲解（13 商用服务商 + 2 个 DEV-ONLY 免费预设） |

---

## 1. 记忆调度与学习

### 1.1 FSRS-6 调度内核 ✅（自研）

**当前为自研实现，非第三方库**——[srs.js](../app/js/srs.js) 用约 190 行纯 JS 直接实现 FSRS-6 公式：

- **默认权重** `w0..w20`（[srs.js:18](../app/js/srs.js#L18)），`w20` 为遗忘曲线衰减;目标保持率 `RETENTION = 0.9`（[srs.js:15](../app/js/srs.js#L15)）。
- **遗忘曲线**（幂函数）`retrievability(t,S,w)`（[srs.js:23](../app/js/srs.js#L23)）。
- **初始难度/稳定性** `initDS`（[srs.js:27-29](../app/js/srs.js#L27-L29)）;**难度均值回归** `nextD`（[srs.js:31-35](../app/js/srs.js#L31-L35)）;**稳定性更新** `nextS` 含同日短期、忘记、困难/容易分支（[srs.js:37-52](../app/js/srs.js#L37-L52)）。
- **间隔计算** `interval` 按目标保持率反推 + ±5% 模糊（[srs.js:54-58](../app/js/srs.js#L54-L58)）。
- **三档反馈**：认识 / 模糊 / 忘记 → FSRS grade `3/2/1`（[srs.js:13-14](../app/js/srs.js#L13-L14)，无「容易」档）。
- **legacy 兼容**：由稳定性派生 Leitner `box/state`，旧数据 `migrate` 升级（[srs.js:60-83](../app/js/srs.js#L60-L83)），统计与「已掌握」判定（稳定性 ≥15 天）沿用旧阈值。

**局限**：权重硬编码为 FSRS-6 默认值;短期记忆用简化的同日分支而非 FSRS-7 的独立短期稳定性;无 Leech（高频错词挂起）、学习步骤（learning steps）等策略。升级路径见 §13.1。

### 1.2 个性化权重优化 ✅（自研，轻量）

- 每词维护复习序列 `fsrs.seqs[word] = [{t: 间隔天数, g: grade}]`，每词 ≤30 条、语料 ≤1000 词，每 200 次复习异步触发优化（[store.js:170-187](../app/js/store.js#L170-L187)）。
- 优化器 `SRS.optimize` 用**坐标下降**对 5 个召回增长权重（`w8,w10,w11,w13,w14`）做 ±30% 试探、2 轮，最小化预测可提取性 vs 实际回忆的对数损失（[srs.js:140-156](../app/js/srs.js#L140-L156)）。

**局限**：仅调 5 个权重、试探幅度固定，非完整 FSRS 训练（无梯度下降/全权重/正则）。`fsrs.seqs` 已含「间隔 + 评分」，可转换为成熟优化器的训练数据（§13.1）。

### 1.3 每日计划与会话 ✅

- 每日新词数 / 复习上限 `plan.newPerDay/reviewCap`;`buildQueue` 取到期复习 + 新词并截断，`session` 按 1 复习 : 1 新词交错（[srs.js:160-181](../app/js/srs.js#L160-L181)）。
- 计划条实时显示进度（[app.js:353 updatePlanBar](../app/js/app.js#L353)）;会话构建 [app.js:302 buildSession](../app/js/app.js#L302)。

### 1.4 学习页与详解卡片 ✅

- 学习页渲染 [app.js:371 renderStudy](../app/js/app.js#L371);信息区 [app.js:425 renderStudyInfo](../app/js/app.js#L425)。
- **内容自由组合**：音标、释义、构词解析、助记、英文释义、例句、词根家族、近义词、派生词、词形变化、词源逐项开关，并可拖动 / 箭头排序（[app.js:411 panelOrder](../app/js/app.js#L411)、[app.js:595 orderedCards](../app/js/app.js#L595)、[app.js:675 moveCard](../app/js/app.js#L675)、[app.js:684 wireDrag](../app/js/app.js#L684)）。
- 词素单行自适应（[app.js:559 renderMorphemes](../app/js/app.js#L559)、[app.js:583 fitMorphemes](../app/js/app.js#L583)）;每词独立详解卡片（[app.js:650 renderCards](../app/js/app.js#L650)）;离线助记钩子（[app.js:645 mnemonicText](../app/js/app.js#L645)）。
- 三档评分 [app.js:536 grade](../app/js/app.js#L536);柔和进度条替代数字进度。

### 1.5 词书过滤可选开关 ✅

- 四项过滤：**过滤基础词**（a/the/that 等 326 个小学/初中极基础词，**默认开启**、可关）、「跳过低阶重复词」（考试阶梯）、「跳过已掌握」、「按词书过滤」（多选其它词书、排除其已收录词，可多选）。**仅裁剪每日队列**，词书本身与测试范围不变（[app.js:282 studyEntries](../app/js/app.js#L282)、[library.js:223 basicWordSet](../app/js/library.js#L223)、[library.js:229 excludeWordSet](../app/js/library.js#L229)、[app.js:2271-2295 renderExcludeChips](../app/js/app.js#L2271-L2295)）。除基础词外默认关闭;过滤 hint 汇总四类裁剪数与剩余词数。

---

## 2. 词库与词书（Library）

### 2.1 官方考纲词库为根 ✅

- 内置《全国大学英语四、六级考试大纲（2016 年修订版）》词表 [official.json](../app/data/official.json)：A 组（无★，四级）6,632 条、B 组（带★，六级）1,264 条，保持 PDF 原始顺序与印刷形态。
- 两本官方书「考纲四级（官方）/ 考纲六级（官方）」**置顶**词书列表（[library.js:186-196 listBooks](../app/js/library.js#L186-L197)），可直接学习、绕过 CEFR 质量过滤与 skipLower（[library.js:286-301 officialBook](../app/js/library.js#L286-L301)）。
- 源 PDF 与 A/B 纯文本列表存 `assets/words/`（PDF 体积大不入 Git，见 `.gitignore`）。

### 2.2 考试词书 ✅

- 10 本考试书（中考/高考/四级/六级/考研/专四/专八/托福/雅思/GRE），由 `exams.json` 经 `enrich` 富化（[library.js:161-184 getBook](../app/js/library.js#L161-L184)），CEFR 质量过滤去简单词。

### 2.3 自定义词书导入 ✅

- 底部常驻入口，接受 JSON / TSV / CSV / TXT;统一解析器 [library.js:475-489 parse](../app/js/library.js#L475-L489)，自动跳表头、忽略大小写去重、按文件名命名（[app.js:2304-2307 bookNameFromFile](../app/js/app.js#L2304-L2307)、[app.js:2308-2315 uniqueBookName](../app/js/app.js#L2308-L2315)）。
- 文件选择跨平台适配（[platform.js:132 pickLibrary](../app/js/platform.js#L132)）。

### 2.4 考纲对比 ✅

- 任选词书（含自定义）对比四级 / 六级考纲：`compareToOfficial` 返回考纲内 / 超纲 / 考纲缺失 + 双向覆盖率（[library.js:305-334](../app/js/library.js#L305-L334)）。
- 归一化 `officialForms` 处理变体对、上标、可选字母、短语（[library.js:253-265](../app/js/library.js#L253-L265)）。
- UI 面板：源书 + 级别选择，摘要 + 覆盖率条 + 三个可折叠词表（每段限 300 词可展开全部）（[app.js:2155-2181 renderCompare](../app/js/app.js#L2155-L2181)）。

### 2.5 词条富字段与派生 ✅

- `enrich` 生成完整词条（[library.js:124](../app/js/library.js#L124)）：词素拆分 `morphemes`、结构化义项 `senses`（词性全称 + 分组）、合成助记 `mnemonic`;详解卡片 `buildCards`（[library.js:394-417](../app/js/library.js#L394-L417)）。

### 2.6 词书选择停留原页 ✅

- 「词书与计划」点选任一词书（含自定义）仅切换当前书并重建每日队列，**停留在词书页**，不再自动跳去学习页（[app.js:2296-2303 switchBook](../app/js/app.js#L2296-L2303)）;用户可自行切到学习页开始。

---

## 3. 词根词缀与专项分类

### 3.1 词根家族导航 ✅

- 词根列表 [app.js:1228 renderRoots](../app/js/app.js#L1228)，家族详情 [app.js:1293 openFamily](../app/js/app.js#L1293)，数据 `getFamily`（[library.js:337](../app/js/library.js#L337)），源 `roots.json` / `roottrees.json`。

### 3.2 词缀浏览 ✅

- 词缀列表 [app.js:1259 renderAffixes](../app/js/app.js#L1259)，词缀详情 [app.js:1388 openAffixSheet](../app/js/app.js#L1388)，点击词素跳转 [app.js:1383 openAffixByChip](../app/js/app.js#L1383)，源 `affixes.json`（3,100 条）。

### 3.3 词根/词缀学习进度条 ✅

- 按已学比例显示绿色进度条与「已学/总数」，接近学完整行变绿，可在设置开关（[app.js:1209 learnProgress](../app/js/app.js#L1209)、[app.js:1215 attachRowProgress](../app/js/app.js#L1215)）。

### 3.4 专项主题分类 ✅

- 离线分类器 [themes.js](../app/js/themes.js)：29 个主题（动物/家居/动作/经济/科技/自然/中国文化等），按中英释义命中归类（[themes.js:191 init](../app/js/themes.js#L191)）。
- 主题浏览 [app.js:1328 renderThemes](../app/js/app.js#L1328)，主题详情 + 专项学习 [app.js:1350 openThemeSheet](../app/js/app.js#L1350)。

---

## 4. 测试中心（Quiz）

### 4.1 六范围 × 四题型 ✅

- 范围：当前词书 / 当前专项 / 生词本 / 错题本 / 到期复习 / 全部混合（[quiz.js:131 scopeWords](../app/js/quiz.js#L131)）。
- 题型：英选中 / 中选英 / 例句填空 / 听音选词（[quiz.js:495 availableTypes](../app/js/quiz.js#L495)、[quiz.js:516 buildQuestion](../app/js/quiz.js#L516)）。

### 4.2 自动难度与组卷约束 ✅

- 能力值自适应 `ability` / 目标难度 `targetDifficulty`（[quiz.js:181-187](../app/js/quiz.js#L181-L187)）。
- **抽题不重复**（`seen` 去重）、**同根词不连续**（[quiz.js:597 rootAllowed](../app/js/quiz.js#L597)）、**同题型不连出三题**（[quiz.js:593-595 typeAllowed](../app/js/quiz.js#L593-L595)）;近期接触降权 `recentPenalty`（[quiz.js:223](../app/js/quiz.js#L223)）、新词加成 `noveltyBonus`（[quiz.js:218](../app/js/quiz.js#L218)）。组卷采样 [quiz.js:634 sample](../app/js/quiz.js#L634)。

### 4.3 干扰项生成 ✅

- 同词性 / 同根易混干扰（[quiz.js:454 buildDistractors](../app/js/quiz.js#L454)）；小词书自动借标准书凑干扰项（[quiz.js:92](../app/js/quiz.js#L92)）。
- 听音选词用**音标音近**干扰（[quiz.js:407 buildAudioDistractors](../app/js/quiz.js#L407)、[quiz.js:396 phoneticSim](../app/js/quiz.js#L396)）。
- 例句填空把目标词形镜像到干扰项，选项读起来自然（[quiz.js:319 buildCloze](../app/js/quiz.js#L319)、[quiz.js:302 inflectLike](../app/js/quiz.js#L302)）。

### 4.4 判分、错题本与流程 ✅

- 答对自动跳题、答错展示全部义项与可点开选项单词、上一题回顾（[app.js:994 answerQuiz](../app/js/app.js#L994)、[app.js:1064 renderQuizReveal](../app/js/app.js#L1064)）；错题本 `quiz-wrong-panel`;结束收进顶部胶囊（[app.js:1116 finishQuiz](../app/js/app.js#L1116)、[app.js:1125 renderQuizDone](../app/js/app.js#L1125)）。
- 设置面板（范围/题型/难度/约束）[app.js:766 renderQuizSettings](../app/js/app.js#L766);考前预估 [app.js:724 renderQuizEstimate](../app/js/app.js#L724)。

---

## 5. 查词与词典

### 5.1 查词 / 历史 / 生词本 ✅

- 查词 [app.js:1757-1826 runSearch](../app/js/app.js#L1757-L1826)，词详情弹层 [app.js:1407 openWordSheet](../app/js/app.js#L1407)，查词历史 [app.js:1827-1837 renderHistory](../app/js/app.js#L1827-L1837)，生词本/收藏 [app.js:1838-1871 renderFavorites](../app/js/app.js#L1838-L1871)。
- **在线查词入口** ✅：本地词库无精确匹配时，结果顶部置顶「在线查词：〈query〉」行，点击即开词卡并自动联网查询、按词缓存到本机（[app.js:1716](../app/js/app.js#L1716)、[app.css:1040](../app/css/app.css#L1040)）。

### 5.2 外部词典：多词典并行 ✅

- [dictionary.js](../app/js/dictionary.js)：4 个内置源（中英词典/有道、UAPI 中英词典、免费英文词典 dictionaryapi.dev、Merriam-Webster）+ 任意数量**自定义端点**（[dictionary.js:3-20 PROVIDERS](../app/js/dictionary.js#L3-L20)、[dictionary.js:22-30 customProviders](../app/js/dictionary.js#L22-L30)）。每个源独立开关，**可同时开启多个**，结果合并去重后按词缓存、离线可看。
- **添加自定义词典** ✅：「我的 → 词典 → ＋ 添加词典」填名称、API 地址（`{word}` 占位，可选 `{key}`）、返回格式、鉴权方式与 Key;保存前可「连通性测试」实打实验证端点（[app.js:2624-2649 openDictEdit](../app/js/app.js#L2624-L2649)、[dictionary.js:483-492 testProvider](../app/js/dictionary.js#L483-L492)）。新增即自动启用并排在末位（[store.js:390-403 addDictSource](../app/js/store.js#L390-L403)）。
- **返回格式**：`自动识别` 嗅探有道 `ec/ee/ce`、UAPI `entry`、MW `shortdef`、free `meanings/phonetics`，都不匹配时按通用 JSON 兜底;也可手动指定有道 / UAPI / free / MW 格式（[dictionary.js:393-404 normalizeAuto](../app/js/dictionary.js#L393-L404)、[dictionary.js:406-413 normalizeFor](../app/js/dictionary.js#L406-L413)）。
- **鉴权方式**：不发送 / `Bearer` 头 / 自定义头（默认 `X-API-Key`，头名可改）/ URL `key=` 查询参数;Key 统一存 `dict.keys[id]`，Windows 上逐个 AES-256-GCM 加密落盘（[dictionary.js:433-453 headersFor](../app/js/dictionary.js#L433-L453)、[dictionary.js:415-431 buildUrl](../app/js/dictionary.js#L415-L431)）。
- **开关与优先级** ✅：每行一个开关 + ↑/↓ 调序，徽章显示「优先级 N」;顶部摘要列出开启顺序，配置不完整的源标注「未填 Key」并说明将被跳过;另有「全部开启 / 全部关闭」批量操作（[app.js:2547-2620 renderDictSources](../app/js/app.js#L2547-L2620)、[store.js:375-389 setDictEnabled/moveDictSource](../app/js/store.js#L375-L389)）。
- **合并去重** ✅：默认并行查询全部已开启源，按词性归一（`vt./vi/verb → v`）分组、按释义文本去重，同一条释义合并中英双语、例句与近义并累积来源标记;每条释义尾部内联显示来源徽章（[dictionary.js:494-505 posKey/defKey](../app/js/dictionary.js#L494-L505)、[dictionary.js:508-560 mergeRecords](../app/js/dictionary.js#L508-L560)、[app.js:1553](../app/js/app.js#L1553)）。关闭「合并」则按顺序串行、命中即停，更省配额（[dictionary.js:570-625 lookup](../app/js/dictionary.js#L570-L625)）。
- **来源筛选与失败可见** ✅：多源合并时词卡顶部出现「全部 + 各来源」筛选片，可单看某一源;部分源失败不隐藏，逐条列出原因，健康源照常渲染（[app.js:1604-1617](../app/js/app.js#L1604-L1617)、[app.js:1620-1623](../app/js/app.js#L1620-L1623)）。
- **缓存随配置失效** ✅：缓存记录带启用集合签名 `sig`;开关或顺序一变，旧缓存自动重查而非继续展示旧结果（[dictionary.js:38 signature](../app/js/dictionary.js#L38)、[app.js:1655-1659](../app/js/app.js#L1655-L1659)）。「词典缓存」组显示已缓存词数并可一键清空。
- **兜底回退**：仅当全部已开启源都因网络/跨域失败时，按 free → UAPI → 有道 兜底一次，来源记于 `record.fallbackFrom` 并显示「已从〈源〉回退」（[dictionary.js:562-567 RESCUE](../app/js/dictionary.js#L562-L567)、[app.js:1603](../app/js/app.js#L1603)）。
- **UAPI 中英词典**：免 Key（访客积分，4 QPS 上限），中英双释义 + 英美音标音频 + 考试标签 + 词形变化 + 词组 + 近义 + 双语例句;`normalizeUapis` 解析内嵌词性、补全音频主机、映射考试标签（[dictionary.js:232-301](../app/js/dictionary.js#L232-L301)）。仅原生通道直连，浏览器跨域拦截时由其它源顶上。
- 一个源都没开时，查词给出「请到『我的 → 词典』至少开启一个」并提供直达设置的按钮，而不是静默失败（[dictionary.js:570-625](../app/js/dictionary.js#L570-L625)）。

### 5.3 详细讲解页 ✅

- 自动查词、刷新/删除图标、AI 自动生成开关、词根+词源合并、卡片紧凑化（[app.js:1490-1661 dictSection](../app/js/app.js#L1490-L1661)）;合并记录额外渲染词形变化与常见词组（[app.js:1565](../app/js/app.js#L1565)、[app.js:1573](../app/js/app.js#L1573)）。

---

## 6. AI 解释

### 6.1 大模型按词讲解 ✅

- [ai.js](../app/js/ai.js)：**13 个商用服务商预设，全部走 OpenAI 兼容 `/chat/completions`**（DeepSeek / OpenAI / Anthropic Claude / 通义千问 / 智谱 GLM / Kimi / 文心一言 / 讯飞星火 / 腾讯混元 / MiniMax / 阶跃星辰 / SiliconFlow / 自定义）（[ai.js:4-18](../app/js/ai.js#L4-L18)），另加 2 个 DEV-ONLY 免费预设（下两条），共 15 项。
- **开发期免费预设 🚧 DEV-ONLY**：开发期默认服务商「开发免费（发布前移除）」内置一个免费 OpenAI 兼容端点与共享 Key，开发期免填 Key 即可试用；三个模型 `DeepSeek-V4-Flash`（默认）/ `DeepSeek-V4.1-Flash` / `GLM-5.3-Flash` 以**下拉选择器**直接可选。**正式发布前必须移除并作废 Key**，详见 [DEVELOPMENT.md §8.25](../DEVELOPMENT.md)（[ai.js:29-37](../app/js/ai.js#L29-L37)）。
- **QNAI 免费端点 🚧 DEV-ONLY**：另置顶「QNAI Free（发布前移除）」`https://api.qnaigc.com/v1`，免 Key 直连（内置共享 Key），模型下拉二选一——`qiniu/conatus-free`（默认，实测可用、支持 JSON 模式;免费档有全局限流 `429 free_campaign_global_limit`，数十秒后可恢复）与 `nvidia/nemotron-3-ultra-550b-a55b0-free`（接入时上游持续 `service temporarily unavailable`，恢复即可切换）。**正式发布前与 devfree 一并移除并作废 Key**（[ai.js:42-50](../app/js/ai.js#L42-L50)）。
- **模型选择器**：带固定模型清单（`models`）的服务商在「模型」栏渲染下拉选择器（现为 devfree 三模型与 qnafree 二模型），其余服务商保留自由文本输入；切换服务商自动切换形态并持久化所选模型，清单内无该模型时回落到新服务商默认模型（[app.js:2502-2527 syncAiProviderUi](../app/js/app.js#L2502-L2527)、[app.js:2860-2866](../app/js/app.js#L2860-L2866)、[index.html:746](../app/index.html#L746)）。开发期默认服务商为 devfree（[store.js:32](../app/js/store.js#L32)）。
- 按词生成结构化解释，解析失败重试一次（[ai.js:112](../app/js/ai.js#L112)）;平台网络通道绕 CORS（[platform.js:210 llmChat](../app/js/platform.js#L210)）。浏览器直连受 CORS 限制，Electron / Android 正常。
- **连通性测试 + 可操作错误** ✅：「模型」栏下方「测试连通性」按钮发一条最小 ping 请求，显示 `✓ 连通正常 · 模型 · 耗时s` 或可操作错误，切换服务商自动清空（[index.html:747](../app/index.html#L747)、[app.js:2733](../app/js/app.js#L2733)、[app.js:2477](../app/js/app.js#L2477)）。网络错误分类为「超时（120 秒）」/「浏览器 CORS 拦截，请改用 Electron/Android」，取代裸 `Failed to fetch`（[platform.js:240-245](../app/js/platform.js#L240-L245)、[main.js:348-350](../main.js#L348-L350)）;三端 LLM 超时统一 120s 以适配慢端点（[platform.js:220](../app/js/platform.js#L220)、[main.js:337-340](../main.js#L337-L340)）。
- 学习页 AI 区 [app.js:1663-1728 aiSection](../app/js/app.js#L1663-L1728)，渲染 [app.js:1450 renderAiExplanation](../app/js/app.js#L1450)。

### 6.2 AI 解释库 ✅

- 解释按词缓存、可导出（[app.js:1730-1750 renderAiLibrary](../app/js/app.js#L1730-L1750)），导出走平台文件保存（[platform.js:288 saveTextFile](../app/js/platform.js#L288)）。

**说明**：当前是「按词静态生成一段解释」，无对话会话管理。交互式追问 / 发音评测属未来方向，见 §13.3。

---

## 7. 发音

### 7.1 真人音频优先 + TTS 回退 ✅

- [platform.js:53 speak](../app/js/platform.js#L53)：优先 Wiktionary 真人音频，缺失/离线回退 TTS;Android 用原生 TextToSpeech 插件，Electron/浏览器用 Web Speech。
- 自动朗读默认关，支持语速与口音设置;按文本自动判语种（[platform.js:19-24 detectLang](../app/js/platform.js#L19-L24)）。

---

## 8. 统计与打卡

### 8.1 学习统计 ✅

- 统计总览 [app.js:1940-1967 renderStats](../app/js/app.js#L1940-L1967)；高频接触词榜 [app.js:1968-1989 renderTopViews](../app/js/app.js#L1968-L1989)；带月份与逐日数字的打卡日历 [app.js:1990-2030 renderCalendar](../app/js/app.js#L1990-L2030)；掌握分布 [app.js:2031-2049 renderMastery](../app/js/app.js#L2031-L2049)；正确率 [app.js:2050-2068 renderRetention](../app/js/app.js#L2050-L2068)；趋势 [app.js:2069-2087 renderTrend](../app/js/app.js#L2069-L2087)；逐日历史 [app.js:2088-2117 renderDayHistory](../app/js/app.js#L2088-L2117)。

### 8.2 单词接触次数 ✅

- 每词自动记录查看次数，统计页可看高频接触词与掌握状态（接触计数 + 状态点 [app.js:1183 stateOf](../app/js/app.js#L1183)）。

---

## 9. 我的与个性化

### 9.1 个人资料 ✅

- 头像（256px 方形裁剪 + WebP 压缩，仅存本机）与昵称（[app.js:190 readAvatarImage](../app/js/app.js#L190)、[app.js:1874-1885 renderMeProfile](../app/js/app.js#L1874-L1885)、[app.js:1915-1920 saveProfile](../app/js/app.js#L1915-L1920)），随备份导出/导入迁移。

### 9.2 设置中心 ✅

- 设置并入「我的」，六项平铺紧凑列表，点哪开哪（[app.js:1921-1937 renderMe](../app/js/app.js#L1921-L1937)、[app.js:2459-2467 showSettingsPane](../app/js/app.js#L2459-L2467)、[app.js:2468-2501 openSettings](../app/js/app.js#L2468-L2501)）：学习与测试、外观与主题、发音、词典、AI 解释、数据备份。

---

## 10. 外观

### 10.1 八套主题 ✅

- 8 套主题不只是换色：逐主题重排字体/字重/行距/圆角/描边阴影/留白密度/控件高度/底栏形态/动效，各自适配浅/深色（[app.js:88 applyTheme](../app/js/app.js#L88)、[app.js:100 setTheme](../app/js/app.js#L100)）。

### 10.2 背景壁纸 ✅

- 上传一张图片作应用底色，蒙版浓度 + 模糊调节，压缩后仅存本机（[app.js:108 applyBackground](../app/js/app.js#L108)、[app.js:133 readBackgroundImage](../app/js/app.js#L133)）。

### 10.3 透明度 / 纯文本隐藏 ✅

- 透明度设置与纯文本隐藏模式（学习面板设置）。

---

## 11. 数据与存储

### 11.1 导出 / 导入 ✅

- 通用 JSON 导出（无损状态块）/ 导入恢复（[store.js:479-527 exportData](../app/js/store.js#L479-L527)、[store.js:579-680 importData](../app/js/store.js#L579-L680)），跨机迁移；导出剔除密钥。

### 11.2 存储位置可配置 ✅

- Electron 默认 `userData` 固定可见，可改任意目录（指针 `data-dir.json`，[main.js:50 currentDataDir](../main.js#L50)）；Android 可选 SAF 自定义树;Web 核心三平台路径/说明 UI（`renderStorageUi`）。

### 11.3 卸载不丢数据镜像 ✅

- Android 自动在共享目录 `Documents/Glance` 留备份（`GlanceStorage.java`，API≥29 走 MediaStore 免权限），卸载重装一键恢复；60s 节流 + 隐藏立即镜像（[app.js:2406-2409 scheduleMirror](../app/js/app.js#L2406-L2409)、[platform.js:276-285](../app/js/platform.js#L276-L285)）。

### 11.4 API Key 静态加密 ✅

- 自管 **AES-256-GCM**：随机 32 字节密钥存本机私有目录 `glance-secret.key`（永不进自定义/同步目录），`ai.key/dict.key` 密封为 `keyEnc`（前缀 `g1:`）;解密失败保留密文不销毁（[main.js:62-121](../main.js#L62-L121)）。

---

## 12. 平台与构建

### 12.1 三端共享核心 ✅

- Electron（Windows，`main.js` 窗口/IPC/网络/文件对话框）、Capacitor 6.2.3（Android，minSdk 22 / target 34）、浏览器;`platform.js` 按 `isElectron/isNative` 分发。

### 12.2 CI/CD ✅

- 推送 `main` → `.github/workflows/android-build.yml` 自动构建 APK 并发布 Releases;versionCode = 构建号、versionName 带构建号、固定调试签名;CI 断言版本与签名证书;文档-only 提交不触发构建。

### 12.3 导航返回栈与原生震动 ✅

- **统一返回逻辑（Android 硬件返回）**：`@capacitor/app` 监听 `backButton`，按优先级 嵌套弹层 → 弹层 → 子页（词书/统计/AI 库回 opener）→ 测试态回学习态 → 顶层 tab 历史 → 根节点才退出（[app.js:68 handleBack](../app/js/app.js#L68)、[app.js:2546-2548](../app/js/app.js#L2546-2548)）;顶层 tab 切换维护 `navStack` 历史（[app.js:34-37](../app/js/app.js#L34-L37)）。浏览器/Electron 不注册，无副作用。
- **原生震动反馈**：`@capacitor/haptics`（自带 VIBRATE 权限），[platform.js:92 haptic](../app/js/platform.js#L92) 仅原生生效;评分/答题用 success/warn/error 通知震动，tab/模式/选书/过滤用 light tap;Electron/浏览器 no-op。

---

## 13. 后续可迭代优化（🔭 规划 / ✅ 部分已落地）

> 本节为候选方向，按价值与成本排序；已落地者标注 ✅，其余 🔭 未实现。落地前应先只读勘察、出方案、单点执行。

### 13.1 FSRS 调度升级：引入 / 对照 ts-fsrs ⭐（对照验证 ✅；迁移 🔭）

**现状结论**：Glance 的 FSRS 是**自研 FSRS-6**（§1.1），不是第三方库。优点是零依赖、体积小（190 行）、与三档 UI 和 legacy 统计深度耦合;局限是权重硬编码、优化器简陋（仅 5 权重坐标下降）、缺 FSRS-7 新特性与成熟调度策略。

**成熟库选项（已联网核实，2026-11）**：

- **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)**（[npm](https://www.npmjs.com/package/ts-fsrs)，MIT）：当前 **v6**，`DefaultScheduler` 默认 **FSRS-7**，支持 FSRS-3 / 4 / 4.5 / 5 / 6 / 7，**库版本与模型版本解耦**。
  - API：`await DefaultScheduler({ desiredRetention: 0.9 })` → `scheduler.newCard / preview / review / rollback`;`preview` 一次给出 Again/Hard/Good/Easy 四档间隔。
  - 内置中间件策略：`LearningSteps`（学习/重学步骤）、`Fuzzing`（按 cardId+复习数确定性抖动）、`Leech`（错词达阈值挂起）、`MaximumInterval`、`MonotonicInterval`（高评分不产生更短间隔）、`CostAdr`（按记忆状态与复习成本自适应保持率）、`Stats`。
  - 工程特性：按版本代码分割、tree-shakable 子路径导出、不可变结果、`rollback` 可回滚复习。
  - **参数优化器是独立包** [`@open-spaced-repetition/binding`](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README_CN.md)（基于 `fsrs-rs` + `napi-rs`，支持浏览器/WASI）：从复习历史训练参数、CSV→训练数据转换、推荐学习步骤。比自研坐标下降更准确、更省维护。
- **关于「rs-everything」**：对话片段提到的这个包名**经检索未能核实存在**（npm/GitHub 搜索仅返回 ts-fsrs、simple-ts-fsrs、@squeakyrobot/fsrs 等）。其宣称的 interleaving / 队列管理思路可取，但**不建议依赖一个无法核实的包**;组卷交错见 §13.2，宜自研或用 ts-fsrs 中间件扩展。

**本期已落地（2026-11-14 · 对照验证旁路，零用户数据风险）**：

- 以 esbuild 将 **ts-fsrs 6.0.0 的 FSRS-6 模型**打包为浏览器全局旁路（[scripts/vendor-ts-fsrs.mjs](../scripts/vendor-ts-fsrs.mjs) → [app/js/vendor/ts-fsrs.js](../app/js/vendor/ts-fsrs.js)，`window.TSFSRS`，约 19 KB，**不引入在用调度器**；dev 旁路文件不入正式包）。
- 对照引擎 [app/dev/srs-contrast.js](../app/dev/srs-contrast.js) 在相同 `{S,D,elapsed,grade}`、相同 21 权重、关闭 fuzz 下逐方法比对（retrievability / initDS / nextD / nextS·recall·forget·short-term / interval）+ 整段复习序列 + migrate 保真探针;Node 运行器 [scripts/fsrs-contrast.mjs](../scripts/fsrs-contrast.mjs)（`npm run contrast:fsrs`）与浏览器页 [app/dev/fsrs-contrast.html](../app/dev/fsrs-contrast.html) 双通道。报告：[docs/FSRS-CONTRAST.md](FSRS-CONTRAST.md)。
- **结论**：自研 FSRS-6 核心公式与参考实现**逐方法一致**（差异≤精度级）。发现并修复一处**核心 bug**：`migrate()` 原先每次复习都从粗粒度 Leitner `box` 重置 `S/D`（[srs.js:76-83](../app/js/srs.js#L76-L83)），使连续稳定度退化为近似 Leitner;已加保真守卫（含有效 S/D 的状态原样返回，仅 legacy 升级）。修复后 4200 步随机序列 **S/D 零偏离**，稳定度恢复连续增长。另对齐稳定度边界 `sMin=0.001 / sMax=36500`（[srs.js:37-52](../app/js/srs.js#L37-L52)）。
- **保留为设计取舍**：短期稳定度触发 `elapsed<1`（Glance 以毫秒分数计 elapsed，近似同日）vs 参考算法 `t===0`;非 bug，不改。
- **未做（仍 🔭）**：替换在用调度器、四档评分、binding 优化器、FSRS-7 / 中间件策略 —— 见下方迁移路径，需独立迭代与用户数据兼容回归。

**迁移路径（建议先对照、再择机替换）**：

1. **对照验证 ✅ 已完成（2026-11-14）**：引入 ts-fsrs 作旁路，用相同 `{S,D,elapsed,grade}` 输入比对自研 `interval/nextS` 输出，校验自研 FSRS-6 公式正确性，发现偏差再修（见上「本期已落地」与 [FSRS-CONTRAST.md](FSRS-CONTRAST.md)）。
2. **评分映射**：三档 → 四档（忘记=Again、模糊=Hard、认识=Good，Easy 暂不用）。
3. **状态映射**：`{S,D,due,reps,lapses,box,state}` ↔ ts-fsrs card `{stability,difficulty,dueAt,reps,lapses,...}`;保留 `boxFromS` 派生以兼容统计 UI。
4. **优化器替换**：把现有 `fsrs.seqs`（`{t,g}`，[store.js:222-239](../app/js/store.js#L222-L239)）转换为 binding 训练格式，替换 `SRS.optimize`;需补充每复习时间戳以符合训练数据要求。
5. **策略增强**：按需启用 Leech / LearningSteps / MaximumInterval。
6. **风险与成本**：替换在用调度器需迁移既有用户 SRS 状态并充分回归;新增依赖（可 tree-shake，体积可控）；Capacitor/Electron 需打包 WASM/native binding。**建议作为独立迭代，先验证后迁移，不冒进替换。**

### 13.2 组卷与队列优化（interleaving）（主题/词性交错 ✅；复习推迟 🔭）

- 现状已自研「同根不连续 / 题型不连出三题 / 近期降权」（§4.2）。
- **本期已落地（2026-11-14）· 主题/词性交错**：在 [quiz.js sample](../app/js/quiz.js#L634) 新增两条交错轴——
  - **主题**：候选取首要主题（`themeOf` = `Themes.themesOf(word)[0]`），硬约束「不连出三题同主题」+ 新主题加分（×1.08）+ 近期主题降权;
  - **词性**：候选取 `posGroup`，硬约束「不连出三题同词性」+ 近期词性降权;
  - 两轴随既有三段放宽（phase 0 严格 → phase 1 减半 → phase 2 忽略）逐级松弛，**保题量优先**。实测（六级书，20 题×多轮）：词性最长连续段由随机基线 ~4–5 降到 **≤2**，题量填充率 **100%、零放宽**;主题轴在主题覆盖稀疏的书里作用有限（数据覆盖问题，非代码）。
- **未做（仍 🔭）· 复习推迟（reschedule）**：宜在 [srs.js buildQueue/session](../app/js/srs.js#L160-L181) 上扩展，或借 ts-fsrs 中间件；不依赖未核实的第三方包。

### 13.3 AI 学习空间（AI 辅助学习）🔭 明确不在本期实现

**现状**：AI 讲解是「按词静态生成一段解释」（§6），13 个商用 OpenAI 兼容服务商（开发期另加 2 个免费预设）已够用，**无需重型教育 SDK**。

**升级方向（未来评估）**：从「静态生成」升级为「交互式学习空间」——追问答疑、发音评测、语法纠正、自适应辅导、对话式练习。

**技术取舍（参考调研）**：

- **直接用现有 OpenAI 兼容接口**：若只是按词生成解释或轻量追问，现有 [ai.js](../app/js/ai.js) + [platform.js:210 llmChat](../app/js/platform.js#L210) 已足够，**不必为 SDK 引入额外依赖**。
- **[Speak](https://www.speak.com/) SDK**（Node.js/Python，语言学习专用）：支持发音评测、语法纠正、自适应辅导，底层兼容 OpenAI 实时 API。若要做「交互式追问 + 发音评测」值得评估;代价是引入 SDK 依赖与会话管理复杂度。
- **Google Gemini API**：可作词汇查询 / 语法反馈的**备选模型后端**;当前 ai.js 预设未含 Gemini，可以 OpenAI 兼容方式新增一个服务商，无需 SDK。
- **建议**：先以现有接口做「按词追问」最小验证，再决定是否引入 Speak 这类专用 SDK;发音评测可优先评估浏览器/Web Speech 或原生能力，避免过早重依赖。

### 13.4 其他迭代候选 🔭

- **词库扩充**：官方考纲已为根，可继续扩充释义/例句/真人音频覆盖;可选「跳过考纲已会词」过滤。
- **FSRS-7 短期稳定性**：迁移 ts-fsrs 后启用独立短期稳定性（stabilityFast），改进同日复习建模。
- **学习步骤 / Leech**：为高频错词引入挂起与重学步骤（ts-fsrs 中间件）。
- **多语言界面**：当前中文 UI，可抽 i18n。
- **数据同步**：现为本地 + 共享目录镜像，可评估端到端加密云同步（密钥不落地）。

---

## 14. 功能矩阵速查

| 域 | 功能 | 状态 | 主要位置 |
|---|---|---|---|
| 记忆 | FSRS-6 调度（自研，对照 ts-fsrs 校验） | ✅ | srs.js:18-119 |
| 记忆 | 个性化权重优化（自研） | ✅ | srs.js:140-156 / store.js:170-187 |
| 记忆 | 每日计划 + 会话交错 | ✅ | srs.js:160-180 |
| 学习 | 内容开关 + 排序 + 详解卡片 | ✅ | app.js:371-673 |
| 学习 | 词书过滤（基础词默认开/跳低阶/跳已掌握/多书排除） | ✅ | app.js:282 / library.js:223-239 |
| 词库 | 选书停留词书页（不跳学习） | ✅ | app.js:2246 |
| 词库 | 官方考纲为根（四/六级） | ✅ | library.js:245-334 |
| 词库 | 10 考试书 + 质量过滤 | ✅ | library.js:161-184 |
| 词库 | 自定义导入 JSON/TSV/CSV/TXT | ✅ | library.js:475-489 |
| 词库 | 考纲对比（覆盖/超纲/缺失） | ✅ | library.js:305-334 / app.js:2071-2130 |
| 词根 | 家族导航 + 词缀浏览 + 进度条 | ✅ | app.js:1209-1330 |
| 专项 | 29 主题分类 + 专项学习 | ✅ | themes.js / app.js:1328-1380 |
| 测试 | 6 范围 4 题型 + 自动难度 + 约束 | ✅ | quiz.js |
| 测试 | 干扰项（同根/音近/词形镜像） | ✅ | quiz.js:302-491 |
| 查词 | 查词/历史/生词本 + 在线查词入口 | ✅ | app.js:1407-1442 / app.js:1753-1871 |
| 词典 | 4 内置源 + 自定义添加 + 逐源开关 + 并行合并去重 | ✅ | dictionary.js / store.js:367-424 / app.js:1490-1661 / app.js:2528-2666 |
| AI | 13 商用服务商 + 2 免费预设（DEV-ONLY）+ 连通性测试 + 缓存导出 | ✅ | ai.js / app.js:1450-1488 / app.js:1663-1750 / app.js:2502-2527 / app.js:2858-2884 |
| 发音 | 真人音频优先 + 原生/Web TTS | ✅ | platform.js:53 |
| 统计 | 日历/掌握/正确率/趋势/接触榜 | ✅ | app.js:1890-2066 |
| 我的 | 头像昵称 + 设置中心 | ✅ | app.js:1824-2452 |
| 外观 | 8 主题 + 壁纸 + 透明度 | ✅ | app.js:88-175 |
| 数据 | 导出导入 + 存储位置 + 镜像 + Key 加密 | ✅ | store.js / main.js / platform.js |
| 平台 | Electron/Android/浏览器 + CI/CD | ✅ | main.js / android-build.yml |
| 平台 | 返回栈导航 + 原生震动（Android） | ✅ | app.js:68 / platform.js:92 |
| 迭代 | ts-fsrs 对照验证 ✅ / 迁移 🔭（FSRS-7） | ✅/🔭 | §13.1 |
| 迭代 | 组卷主题/词性交错 ✅ / 复习推迟 🔭 | ✅/🔭 | §13.2 |
| 迭代 | AI 学习空间（Speak/Gemini 评估） | 🔭 | §13.3 |

---

**参考来源（ts-fsrs 核实）**

- [open-spaced-repetition/ts-fsrs（GitHub）](https://github.com/open-spaced-repetition/ts-fsrs)
- [ts-fsrs 文档站](https://open-spaced-repetition.github.io/ts-fsrs/)
- [ts-fsrs（npm）](https://www.npmjs.com/package/ts-fsrs)
- [@open-spaced-repetition/binding 优化器](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README_CN.md)