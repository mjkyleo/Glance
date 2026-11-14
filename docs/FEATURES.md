# Glance 功能全景与迭代规划

> 本文逐模块说明 Glance 的**全部功能**、**已实现状态**与**后续可迭代优化方向**，作为产品与开发的单一参照。
> 实现细节与逐项验证记录见 [DEVELOPMENT.md](../DEVELOPMENT.md);数据 schema 见 [DATA.md](DATA.md)。
> 文中 `文件:行号` 为编写时（2026-11-14，`android-37`）核实的代码位置，重构后需同步更新。

**状态标记**

- ✅ 已实现并实测（浏览器 / Electron / CI 构建验证）
- 🚧 已实现但有已知局限（见各节「局限」）
- 🔭 规划中 / 可迭代优化（**尚未实现**，见 §13）

**架构一句话**：一套共享 Web 核心 `app/` 同时跑在 Electron（Windows）、Capacitor（Android）与浏览器;`platform.js` 按平台分发存储 / 网络 / 发音 / 文件能力，业务逻辑全部平台无关。

| 模块文件 | 行数 | 职责 |
|---|---|---|
| [app.js](../app/js/app.js) | 2774 | UI 渲染、交互、会话编排、设置 |
| [quiz.js](../app/js/quiz.js) | 797 | 测试引擎：组卷、难度、干扰项、约束 |
| [store.js](../app/js/store.js) | 571 | 持久化 + 学习域逻辑（SRS 状态、计划、日志、收藏） |
| [library.js](../app/js/library.js) | 469 | 词书组织、词条富化、官方考纲、对比 |
| [dictionary.js](../app/js/dictionary.js) | 384 | 外部词典检索与多源归一化 |
| [platform.js](../app/js/platform.js) | 284 | 平台适配（存储/网络/发音/文件/镜像） |
| [themes.js](../app/js/themes.js) | 244 | 专项主题分类器（29 主题） |
| [srs.js](../app/js/srs.js) | 197 | FSRS-6 调度内核 + 个性化优化 |
| [ai.js](../app/js/ai.js) | 129 | 大模型按词讲解（13 服务商） |

---

## 1. 记忆调度与学习

### 1.1 FSRS-6 调度内核 ✅（自研）

**当前为自研实现，非第三方库**——[srs.js](../app/js/srs.js) 用约 190 行纯 JS 直接实现 FSRS-6 公式：

- **默认权重** `w0..w20`（[srs.js:16](../app/js/srs.js#L16)），`w20` 为遗忘曲线衰减;目标保持率 `RETENTION = 0.9`（[srs.js:13](../app/js/srs.js#L13)）。
- **遗忘曲线**（幂函数）`retrievability(t,S,w)`（[srs.js:19-21](../app/js/srs.js#L19-L21)）。
- **初始难度/稳定性** `initDS`（[srs.js:25-27](../app/js/srs.js#L25-L27)）;**难度均值回归** `nextD`（[srs.js:29-33](../app/js/srs.js#L29-L33)）;**稳定性更新** `nextS` 含同日短期、忘记、困难/容易分支（[srs.js:35-50](../app/js/srs.js#L35-L50)）。
- **间隔计算** `interval` 按目标保持率反推 + ±5% 模糊（[srs.js:52-57](../app/js/srs.js#L52-L57)）。
- **三档反馈**：认识 / 模糊 / 忘记 → FSRS grade `3/2/1`（[srs.js:11-12](../app/js/srs.js#L11-L12)，无「容易」档）。
- **legacy 兼容**：由稳定性派生 Leitner `box/state`，旧数据 `migrate` 升级（[srs.js:58-78](../app/js/srs.js#L58-L78)），统计与「已掌握」判定（稳定性 ≥15 天）沿用旧阈值。

**局限**：权重硬编码为 FSRS-6 默认值;短期记忆用简化的同日分支而非 FSRS-7 的独立短期稳定性;无 Leech（高频错词挂起）、学习步骤（learning steps）等策略。升级路径见 §13.1。

### 1.2 个性化权重优化 ✅（自研，轻量）

- 每词维护复习序列 `fsrs.seqs[word] = [{t: 间隔天数, g: grade}]`，每词 ≤30 条、语料 ≤1000 词，每 200 次复习异步触发优化（[store.js:164-182](../app/js/store.js#L164-L182)）。
- 优化器 `SRS.optimize` 用**坐标下降**对 5 个召回增长权重（`w8,w10,w11,w13,w14`）做 ±30% 试探、2 轮，最小化预测可提取性 vs 实际回忆的对数损失（[srs.js:113-152](../app/js/srs.js#L113-L152)）。

**局限**：仅调 5 个权重、试探幅度固定，非完整 FSRS 训练（无梯度下降/全权重/正则）。`fsrs.seqs` 已含「间隔 + 评分」，可转换为成熟优化器的训练数据（§13.1）。

### 1.3 每日计划与会话 ✅

- 每日新词数 / 复习上限 `plan.newPerDay/reviewCap`;`buildQueue` 取到期复习 + 新词并截断，`session` 按 1 复习 : 1 新词交错（[srs.js:155-176](../app/js/srs.js#L155-L176)）。
- 计划条实时显示进度（[app.js:326 updatePlanBar](../app/js/app.js#L326)）;会话构建 [app.js:275 buildSession](../app/js/app.js#L275)。

### 1.4 学习页与详解卡片 ✅

- 学习页渲染 [app.js:344 renderStudy](../app/js/app.js#L344);信息区 [app.js:398 renderStudyInfo](../app/js/app.js#L398)。
- **内容自由组合**：音标、释义、构词解析、助记、英文释义、例句、词根家族、近义词、派生词、词形变化、词源逐项开关，并可拖动 / 箭头排序（[app.js:384 panelOrder](../app/js/app.js#L384)、[app.js:567 orderedCards](../app/js/app.js#L567)、[app.js:647 moveCard](../app/js/app.js#L647)、[app.js:656 wireDrag](../app/js/app.js#L656)）。
- 词素单行自适应（[app.js:531 renderMorphemes](../app/js/app.js#L531)、[app.js:555 fitMorphemes](../app/js/app.js#L555)）;每词独立详解卡片（[app.js:622 renderCards](../app/js/app.js#L622)）;离线助记钩子（[app.js:617 mnemonicText](../app/js/app.js#L617)）。
- 三档评分 [app.js:509 grade](../app/js/app.js#L509);柔和进度条替代数字进度。

### 1.5 词书过滤可选开关 ✅

- 「跳过低阶重复词」（考试阶梯）+「跳过已掌握」，**仅裁剪每日队列**，词书本身与测试范围不变（[app.js:263-272 studyEntries](../app/js/app.js#L263-L272)、[library.js:208-217 lowerWordSet](../app/js/library.js#L208-L217)）。默认均关闭。

---

## 2. 词库与词书（Library）

### 2.1 官方考纲词库为根 ✅

- 内置《全国大学英语四、六级考试大纲（2016 年修订版）》词表 [official.json](../app/data/official.json)：A 组（无★，四级）6,632 条、B 组（带★，六级）1,264 条，保持 PDF 原始顺序与印刷形态。
- 两本官方书「考纲四级（官方）/ 考纲六级（官方）」**置顶**词书列表（[library.js:186-197 listBooks](../app/js/library.js#L186-L197)），可直接学习、绕过 CEFR 质量过滤与 skipLower（[library.js:263-279 officialBook](../app/js/library.js#L263-L279)）。
- 源 PDF 与 A/B 纯文本列表存 `assets/words/`（PDF 体积大不入 Git，见 `.gitignore`）。

### 2.2 考试词书 ✅

- 10 本考试书（中考/高考/四级/六级/考研/专四/专八/托福/雅思/GRE），由 `exams.json` 经 `enrich` 富化（[library.js:161-184 getBook](../app/js/library.js#L161-L184)），CEFR 质量过滤去简单词。

### 2.3 自定义词书导入 ✅

- 底部常驻入口，接受 JSON / TSV / CSV / TXT;统一解析器 [library.js:452-467 parse](../app/js/library.js#L452-L467)，自动跳表头、忽略大小写去重、按文件名命名（[app.js:2158 bookNameFromFile](../app/js/app.js#L2158)、[app.js:2162 uniqueBookName](../app/js/app.js#L2162)）。
- 文件选择跨平台适配（[platform.js:118 pickLibrary](../app/js/platform.js#L118)）。

### 2.4 考纲对比 ✅

- 任选词书（含自定义）对比四级 / 六级考纲：`compareToOfficial` 返回考纲内 / 超纲 / 考纲缺失 + 双向覆盖率（[library.js:282-312](../app/js/library.js#L282-L312)）。
- 归一化 `officialForms` 处理变体对、上标、可选字母、短语（[library.js:230-243](../app/js/library.js#L230-L243)）。
- UI 面板：源书 + 级别选择，摘要 + 覆盖率条 + 三个可折叠词表（每段限 300 词可展开全部）（[app.js:2008-2068](../app/js/app.js#L2008-L2068)）。

### 2.5 词条富字段与派生 ✅

- `enrich` 生成完整词条（[library.js:124](../app/js/library.js#L124)）：词素拆分 `morphemes`、结构化义项 `senses`（词性全称 + 分组）、合成助记 `mnemonic`;详解卡片 `buildCards`（[library.js:371](../app/js/library.js#L371)）。

---

## 3. 词根词缀与专项分类

### 3.1 词根家族导航 ✅

- 词根列表 [app.js:1199 renderRoots](../app/js/app.js#L1199)，家族详情 [app.js:1264 openFamily](../app/js/app.js#L1264)，数据 `getFamily`（[library.js:314](../app/js/library.js#L314)），源 `roots.json` / `roottrees.json`。

### 3.2 词缀浏览 ✅

- 词缀列表 [app.js:1230 renderAffixes](../app/js/app.js#L1230)，词缀详情 [app.js:1359 openAffixSheet](../app/js/app.js#L1359)，点击词素跳转 [app.js:1354 openAffixByChip](../app/js/app.js#L1354)，源 `affixes.json`（3,100 条）。

### 3.3 词根/词缀学习进度条 ✅

- 按已学比例显示绿色进度条与「已学/总数」，接近学完整行变绿，可在设置开关（[app.js:1180 learnProgress](../app/js/app.js#L1180)、[app.js:1186 attachRowProgress](../app/js/app.js#L1186)）。

### 3.4 专项主题分类 ✅

- 离线分类器 [themes.js](../app/js/themes.js)：29 个主题（动物/家居/动作/经济/科技/自然/中国文化等），按中英释义命中归类（[themes.js:191 init](../app/js/themes.js#L191)）。
- 主题浏览 [app.js:1299 renderThemes](../app/js/app.js#L1299)，主题详情 + 专项学习 [app.js:1321 openThemeSheet](../app/js/app.js#L1321)。

---

## 4. 测试中心（Quiz）

### 4.1 六范围 × 四题型 ✅

- 范围：当前词书 / 当前专项 / 生词本 / 错题本 / 到期复习 / 全部混合（[quiz.js:125 scopeWords](../app/js/quiz.js#L125)）。
- 题型：英选中 / 中选英 / 例句填空 / 听音选词（[quiz.js:489 availableTypes](../app/js/quiz.js#L489)、[quiz.js:510 buildQuestion](../app/js/quiz.js#L510)）。

### 4.2 自动难度与组卷约束 ✅

- 能力值自适应 `ability` / 目标难度 `targetDifficulty`（[quiz.js:181-187](../app/js/quiz.js#L181-L187)）。
- **抽题不重复**（`seen` 去重）、**同根词不连续**（[quiz.js:591 rootAllowed](../app/js/quiz.js#L591)）、**同题型不连出三题**（[quiz.js:587-589 typeAllowed](../app/js/quiz.js#L587-L589)）;近期接触降权 `recentPenalty`（[quiz.js:217](../app/js/quiz.js#L217)）、新词加成 `noveltyBonus`（[quiz.js:212](../app/js/quiz.js#L212)）。组卷采样 [quiz.js:611 sample](../app/js/quiz.js#L611)。

### 4.3 干扰项生成 ✅

- 同词性 / 同根易混干扰（[quiz.js:448 buildDistractors](../app/js/quiz.js#L448)）；小词书自动借标准书凑干扰项（[quiz.js:92](../app/js/quiz.js#L92)）。
- 听音选词用**音标音近**干扰（[quiz.js:401 buildAudioDistractors](../app/js/quiz.js#L401)、[quiz.js:390 phoneticSim](../app/js/quiz.js#L390)）。
- 例句填空把目标词形镜像到干扰项，选项读起来自然（[quiz.js:313 buildCloze](../app/js/quiz.js#L313)、[quiz.js:296 inflectLike](../app/js/quiz.js#L296)）。

### 4.4 判分、错题本与流程 ✅

- 答对自动跳题、答错展示全部义项与可点开选项单词、上一题回顾（[app.js:966 answerQuiz](../app/js/app.js#L966)、[app.js:1035 renderQuizReveal](../app/js/app.js#L1035)）；错题本 `quiz-wrong-panel`;结束收进顶部胶囊（[app.js:1087 finishQuiz](../app/js/app.js#L1087)、[app.js:1096 renderQuizDone](../app/js/app.js#L1096)）。
- 设置面板（范围/题型/难度/约束）[app.js:738 renderQuizSettings](../app/js/app.js#L738);考前预估 [app.js:696 renderQuizEstimate](../app/js/app.js#L696)。

---

## 5. 查词与词典

### 5.1 查词 / 历史 / 生词本 ✅

- 查词 [app.js:1658 runSearch](../app/js/app.js#L1658)，词详情弹层 [app.js:1378 openWordSheet](../app/js/app.js#L1378)，查词历史 [app.js:1714 renderHistory](../app/js/app.js#L1714)，生词本/收藏 [app.js:1725 renderFavorites](../app/js/app.js#L1725)。

### 5.2 外部词典 ✅

- [dictionary.js](../app/js/dictionary.js)：免费词典开箱即用，可切 Merriam-Webster 或自定义端点;多源归一化（有道/免费/MW/自定义，[dictionary.js:47-294](../app/js/dictionary.js#L47-L294)），结果按词缓存、离线可看。
- 服务商二级底部弹层选择（推荐/Key 徽章 + 能力说明）[app.js:2375 renderDictProviderList](../app/js/app.js#L2375)。

### 5.3 详细讲解页 ✅

- 自动查词、刷新/删除图标、AI 自动生成开关、词根+词源合并、卡片紧凑化（[app.js:1461 dictSection](../app/js/app.js#L1461)）。

---

## 6. AI 解释

### 6.1 大模型按词讲解 ✅

- [ai.js](../app/js/ai.js)：**13 个商用服务商预设，全部走 OpenAI 兼容 `/chat/completions`**（DeepSeek / OpenAI / Anthropic Claude / 通义千问 / 智谱 GLM / Kimi / 文心一言 / 讯飞星火 / 腾讯混元 / MiniMax / 阶跃星辰 / SiliconFlow / 自定义）（[ai.js:4-18](../app/js/ai.js#L4-L18)）。
- **开发期免费预设 🚧 DEV-ONLY**：置顶且为开发期默认服务商的「开发免费（发布前移除）」内置一个免费 OpenAI 兼容端点与共享 Key，开发期免填 Key 即可试用；三个模型 `DeepSeek-V4-Flash`（默认）/ `DeepSeek-V4.1-Flash` / `GLM-5.3-Flash` 以**下拉选择器**直接可选。**正式发布前必须移除并作废 Key**，详见 [DEVELOPMENT.md §8.25](../DEVELOPMENT.md)（[ai.js:29-37](../app/js/ai.js#L29-L37)）。
- **模型选择器**：带固定模型清单（`models`）的服务商在「模型」栏渲染下拉选择器（当前仅 devfree 的三模型），其余服务商保留自由文本输入；切换服务商自动切换形态并持久化所选模型（[app.js:2358 syncAiProviderUi](../app/js/app.js#L2358)、[app.js:2618](../app/js/app.js#L2618)、[index.html:746](../app/index.html#L746)）。开发期默认服务商为 devfree（[store.js:32](../app/js/store.js#L32)）。
- 按词生成结构化解释，解析失败重试一次（[ai.js:99](../app/js/ai.js#L99)）;平台网络通道绕 CORS（[platform.js:196 llmChat](../app/js/platform.js#L196)）。浏览器直连受 CORS 限制，Electron / Android 正常。
- 学习页 AI 区 [app.js:1564 aiSection](../app/js/app.js#L1564)，渲染 [app.js:1421 renderAiExplanation](../app/js/app.js#L1421)。

### 6.2 AI 解释库 ✅

- 解释按词缓存、可导出（[app.js:1631 renderAiLibrary](../app/js/app.js#L1631)），导出走平台文件保存（[platform.js:264 saveTextFile](../app/js/platform.js#L264)）。

**说明**：当前是「按词静态生成一段解释」，无对话会话管理。交互式追问 / 发音评测属未来方向，见 §13.3。

---

## 7. 发音

### 7.1 真人音频优先 + TTS 回退 ✅

- [platform.js:53 speak](../app/js/platform.js#L53)：优先 Wiktionary 真人音频，缺失/离线回退 TTS;Android 用原生 TextToSpeech 插件，Electron/浏览器用 Web Speech。
- 自动朗读默认关，支持语速与口音设置;按文本自动判语种（[platform.js:19-24 detectLang](../app/js/platform.js#L19-L24)）。

---

## 8. 统计与打卡

### 8.1 学习统计 ✅

- 统计总览 [app.js:1827 renderStats](../app/js/app.js#L1827)；高频接触词榜 [app.js:1855 renderTopViews](../app/js/app.js#L1855)；带月份与逐日数字的打卡日历 [app.js:1877 renderCalendar](../app/js/app.js#L1877)；掌握分布 [app.js:1918 renderMastery](../app/js/app.js#L1918)；正确率 [app.js:1937 renderRetention](../app/js/app.js#L1937)；趋势 [app.js:1956 renderTrend](../app/js/app.js#L1956)；逐日历史 [app.js:1975 renderDayHistory](../app/js/app.js#L1975)。

### 8.2 单词接触次数 ✅

- 每词自动记录查看次数，统计页可看高频接触词与掌握状态（接触计数 + 状态点 [app.js:1154 stateOf](../app/js/app.js#L1154)）。

---

## 9. 我的与个性化

### 9.1 个人资料 ✅

- 头像（256px 方形裁剪 + WebP 压缩，仅存本机）与昵称（[app.js:171 readAvatarImage](../app/js/app.js#L171)、[app.js:1761 renderMeProfile](../app/js/app.js#L1761)、[app.js:1802 saveProfile](../app/js/app.js#L1802)），随备份导出/导入迁移。

### 9.2 设置中心 ✅

- 设置并入「我的」，六项平铺紧凑列表，点哪开哪（[app.js:1808 renderMe](../app/js/app.js#L1808)、[app.js:2313 showSettingsPane](../app/js/app.js#L2313)、[app.js:2322 openSettings](../app/js/app.js#L2322)）：学习与测试、外观与主题、发音、词典、AI 解释、数据备份。

---

## 10. 外观

### 10.1 八套主题 ✅

- 8 套主题不只是换色：逐主题重排字体/字重/行距/圆角/描边阴影/留白密度/控件高度/底栏形态/动效，各自适配浅/深色（[app.js:69 applyTheme](../app/js/app.js#L69)、[app.js:81 setTheme](../app/js/app.js#L81)）。

### 10.2 背景壁纸 ✅

- 上传一张图片作应用底色，蒙版浓度 + 模糊调节，压缩后仅存本机（[app.js:89 applyBackground](../app/js/app.js#L89)、[app.js:114 readBackgroundImage](../app/js/app.js#L114)）。

### 10.3 透明度 / 纯文本隐藏 ✅

- 透明度设置与纯文本隐藏模式（学习面板设置）。

---

## 11. 数据与存储

### 11.1 导出 / 导入 ✅

- 通用 JSON 导出（无损状态块）/ 导入恢复（[store.js:365 exportData](../app/js/store.js#L365)、[store.js:461 importData](../app/js/store.js#L461)），跨机迁移；导出剔除密钥。

### 11.2 存储位置可配置 ✅

- Electron 默认 `userData` 固定可见，可改任意目录（指针 `data-dir.json`，[main.js:50 currentDataDir](../main.js#L50)）；Android 可选 SAF 自定义树;Web 核心三平台路径/说明 UI（`renderStorageUi`）。

### 11.3 卸载不丢数据镜像 ✅

- Android 自动在共享目录 `Documents/Glance` 留备份（`GlanceStorage.java`，API≥29 走 MediaStore 免权限），卸载重装一键恢复；60s 节流 + 隐藏立即镜像（[app.js:2260 scheduleMirror](../app/js/app.js#L2260)、[platform.js:252-261](../app/js/platform.js#L252-L261)）。

### 11.4 API Key 静态加密 ✅

- 自管 **AES-256-GCM**：随机 32 字节密钥存本机私有目录 `glance-secret.key`（永不进自定义/同步目录），`ai.key/dict.key` 密封为 `keyEnc`（前缀 `g1:`）;解密失败保留密文不销毁（[main.js:62-121](../main.js#L62-L121)）。

---

## 12. 平台与构建

### 12.1 三端共享核心 ✅

- Electron（Windows，`main.js` 窗口/IPC/网络/文件对话框）、Capacitor 6.2.3（Android，minSdk 22 / target 34）、浏览器;`platform.js` 按 `isElectron/isNative` 分发。

### 12.2 CI/CD ✅

- 推送 `main` → `.github/workflows/android-build.yml` 自动构建 APK 并发布 Releases;versionCode = 构建号、versionName 带构建号、固定调试签名;CI 断言版本与签名证书;文档-only 提交不触发构建。

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
4. **优化器替换**：把现有 `fsrs.seqs`（`{t,g}`，[store.js:165-182](../app/js/store.js#L165-L182)）转换为 binding 训练格式，替换 `SRS.optimize`;需补充每复习时间戳以符合训练数据要求。
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

**现状**：AI 讲解是「按词静态生成一段解释」（§6），13 个 OpenAI 兼容服务商已够用，**无需重型教育 SDK**。

**升级方向（未来评估）**：从「静态生成」升级为「交互式学习空间」——追问答疑、发音评测、语法纠正、自适应辅导、对话式练习。

**技术取舍（参考调研）**：

- **直接用现有 OpenAI 兼容接口**：若只是按词生成解释或轻量追问，现有 [ai.js](../app/js/ai.js) + [platform.js:196 llmChat](../app/js/platform.js#L196) 已足够，**不必为 SDK 引入额外依赖**。
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
| 记忆 | 个性化权重优化（自研） | ✅ | srs.js:121-158 / store.js:164-182 |
| 记忆 | 每日计划 + 会话交错 | ✅ | srs.js:160-181 |
| 学习 | 内容开关 + 排序 + 详解卡片 | ✅ | app.js:344-656 |
| 学习 | 词书过滤（跳低阶/跳已掌握） | ✅ | app.js:263-272 |
| 词库 | 官方考纲为根（四/六级） | ✅ | library.js:219-312 |
| 词库 | 10 考试书 + 质量过滤 | ✅ | library.js:161-184 |
| 词库 | 自定义导入 JSON/TSV/CSV/TXT | ✅ | library.js:452-467 |
| 词库 | 考纲对比（覆盖/超纲/缺失） | ✅ | library.js:282-312 / app.js:2008-2068 |
| 词根 | 家族导航 + 词缀浏览 + 进度条 | ✅ | app.js:1180-1359 |
| 专项 | 29 主题分类 + 专项学习 | ✅ | themes.js / app.js:1299-1321 |
| 测试 | 6 范围 4 题型 + 自动难度 + 约束 | ✅ | quiz.js |
| 测试 | 干扰项（同根/音近/词形镜像） | ✅ | quiz.js:296-448 |
| 查词 | 查词/历史/生词本 + 外部词典 | ✅ | app.js:1378-1725 / dictionary.js |
| AI | 13 服务商按词讲解 + 缓存导出 | ✅ | ai.js / app.js:1564-1631 |
| 发音 | 真人音频优先 + 原生/Web TTS | ✅ | platform.js:53 |
| 统计 | 日历/掌握/正确率/趋势/接触榜 | ✅ | app.js:1827-1975 |
| 我的 | 头像昵称 + 设置中心 | ✅ | app.js:1761-2322 |
| 外观 | 8 主题 + 壁纸 + 透明度 | ✅ | app.js:69-114 |
| 数据 | 导出导入 + 存储位置 + 镜像 + Key 加密 | ✅ | store.js / main.js / platform.js |
| 平台 | Electron/Android/浏览器 + CI/CD | ✅ | main.js / android-build.yml |
| 迭代 | ts-fsrs 对照验证 ✅ / 迁移 🔭（FSRS-7） | ✅/🔭 | §13.1 |
| 迭代 | 组卷主题/词性交错 ✅ / 复习推迟 🔭 | ✅/🔭 | §13.2 |
| 迭代 | AI 学习空间（Speak/Gemini 评估） | 🔭 | §13.3 |

---

**参考来源（ts-fsrs 核实）**

- [open-spaced-repetition/ts-fsrs（GitHub）](https://github.com/open-spaced-repetition/ts-fsrs)
- [ts-fsrs 文档站](https://open-spaced-repetition.github.io/ts-fsrs/)
- [ts-fsrs（npm）](https://www.npmjs.com/package/ts-fsrs)
- [@open-spaced-repetition/binding 优化器](https://github.com/open-spaced-repetition/ts-fsrs/blob/main/packages/binding/README_CN.md)