# Glance 数据格式与组织规范

本文档说明 Glance 的词库组织、自定义词书导入格式、本地存储结构、存储位置与持久化、敏感数据加密及备份导出/导入规范。
依据代码现状编写（2026-11-14，android-35）;**任何 schema 变更必须同步更新本文档**（见 §8）。

- 内置词库：`app/data/*.json`（只读，随包分发）
- 用户状态：Electron `userData/settings.json`（可改自定义目录）/ Android 与浏览器 `localStorage['glance.settings']`
- 持久化备份：Android 共享目录镜像 `Documents/Glance/Glance-learning-data.json`（卸载保留，见 §5.4）
- 便携备份：导出 JSON（`kind: 'learning-data'`，`schema: 1`）

## 1. 三层数据总览

| 层 | 载体 | 读写 | 内容 |
|---|---|---|---|
| 内置索引词库 | `app/data/` 七个 JSON（约 22 MB） | 只读 | 10 个考试词书、15,645 词条、8,331 词根、3,100 词缀、官方考纲 7,896 条 |
| 用户学习状态 | 单一 JSON 文档（见 §5） | 读写，250 ms 防抖落盘 | SRS 进度、日志、生词本、错题、自定义词书、设置、缓存 |
| 便携备份 | 导出文件（见 §6） | 导出 / 导入 | 通用单词表 + 无损状态块，跨机迁移 |

加载路径：

- Electron：IPC `get-dataset` / `get-settings`（[main.js:311](../main.js#L311)、[main.js:226](../main.js#L226)），设置文件为 `currentDataDir()/settings.json`（[main.js:57](../main.js#L57)），默认目录 `userData`、可改自定义目录（§5.4）。
- Android / 浏览器：并行 fetch `data/{meta,exams,roots,roottrees,words,affixes,official}.json`（[platform.js:107-116](../app/js/platform.js#L107-L116)）;设置存 `localStorage['glance.settings']`（[platform.js:10](../app/js/platform.js#L10)）。
- 启动顺序：`Store.load()` → `Library.init(ds)` → `Themes.init(ds.words)`（[app.js:2639-2665](../app/js/app.js#L2639-L2665)）。

**词库与用户状态完全分离**：清状态不伤词库，换机不丢词库;自定义词书属于用户状态，随备份迁移。

## 2. 内置索引词库（app/data/）

### 2.1 文件清单

| 文件 | 大小 | 结构 | 规模 |
|---|---|---|---|
| `meta.json` | 234 B | 对象 | 来源 / 构建日期 / 考试列表 / 计数 |
| `exams.json` | 7.6 MB | `{考试标签: 词书}` | 10 书 |
| `words.json` | 9.5 MB | `{单词: 字段表}` | 15,645 键 |
| `roots.json` | 2.7 MB | `{词根: 家族}` | 8,331 键 |
| `roottrees.json` | 1.6 MB | `{词根: 派生树}` | 8,331 键 |
| `affixes.json` | 0.6 MB | 数组 | 3,100 条 |
| `official.json` | 80 KB | `{source, note, cet4[], cet6[]}` | 7,896 条（A 6,632 / B 1,264） |

`official.json` 是唯一**非抓取生成**的内置文件：源自官方考纲 PDF 词表，逐行忠实提取，详见 §2.7。

### 2.2 meta.json

```json
{ "source": "morphemelexicon.com", "built": "2026-11-12",
  "exams": ["中考","高考","四级","六级","考研","专四","专八","托福","雅思","GRE"],
  "counts": { "examWords": 15647, "roots": 8331, "words": 15645, "affixes": 3100, "trees": 8331 } }
```

`examWords` 为跨书含重复的总次数;`words` 为去重词条数。`exams` 数组决定词书列表顺序。

### 2.3 exams.json

以考试标签为键，每本书：

```json
"六级": {
  "n": 5259,
  "groups": [
    { "root": "co", "rootZh": "共同", "rootEn": "together", "familySize": 59,
      "words": [ ["conduct", "n. 行为 / vt. 指挥", "B1", "/ˈkɑndʌkt/"] ] }
  ],
  "loose": [ ["word", "中文义", "CEFR", "音标"] ]
}
```

- 词条为**四元组数组** `[word, zh, cefr, ipa]`（压缩约定，仅内置词库使用）。
- `groups` 按词根家族组织;`loose` 为无词根归属的散词（当前各书为空数组，保留字段）。
- `n` 是**质量过滤前**的原始词数;界面词数为过滤后（六级 5259 → 4327）。
- 质量过滤（[library.js:13-20](../app/js/library.js#L13-L20)）：`BOOK_MIN_RANK` = 中考 0 / 高考 2(A2) / 其余 3(B1)；CEFR 秩 A1=1…C2=6;**CEFR 缺失(0) 一律保留**（难度不可判）。

### 2.4 words.json

以单词为键（大小写敏感主键）：

| 字段 | 含义 | 约定 |
|---|---|---|
| `zh` | 中文义 | `pos. 义 / [域] 义` 格式，`/` 分隔义项;运行时解析为 `senses` |
| `ipa` | 音标 | 源站美式优先;运行时剥首尾 `/`（[library.js:132](../app/js/library.js#L132)） |
| `cf` | CEFR 等级 | 空串 = 缺失 |
| `fr` | 源站词频指标 | 0 = 缺失 |
| `def` | 英文释义 | `[[pos, 英文释义, [近义词…]], …]` |
| `der` | 派生词 | `[[词, 词缀, "pre"\|"suf"], …]`，截断 12 条 |
| `inf` | 词形变化 | 字符串数组，截断 8 条 |
| `au` | 真人发音 | `["1\|4/49/En-ca-conduct.ogg"]`；`\|` 后为 Wikimedia Commons 路径，取 1 条;播放失败回退 TTS（[platform.js:28-32](../app/js/platform.js#L28-L32)） |
| `ety` | 词源 | 截断 200 字符 |
| `tag` | 考试标签 | 如 `["高考","四级","六级"]` |
| `root` | 词根 id | 外键 → `roots` / `roottrees` |

示例（`conduct`）：

```json
{ "zh": "n. 行为, 举动 / vt. 指挥, 管理 / vi. 领导, 传导", "ipa": "/ˈkɑndʌkt/",
  "cf": "B1", "fr": 4361,
  "def": [["v", "direct the course of; manage or control", ["carry on", "deal"]]],
  "der": [["conductance", "ance", "suf"], ["misconduct", "mis", "pre"]],
  "inf": ["conducts", "conducted", "conducting"],
  "au": ["1|4/49/En-ca-conduct.ogg"], "ety": "From Late Latin conductus …",
  "tag": ["高考","四级","六级","考研","托福","GRE","专八"], "root": "co" }
```

字段截断在抓取期完成（[scrape-morphemelexicon.cjs:133-138](../scripts/scrape-morphemelexicon.cjs#L133-L138)）。
`examples` / `collocations` 为预留字段：当前内置数据均为空，导入与 legacy 格式可携带。

### 2.5 roots / roottrees / affixes

- `roots.json`：`{root: {g: 英文释义, zh: 中文, tier, size, family: [[word, zh], …]}}`。
- `roottrees.json`：`{root: 树}`；节点为三元组 `[word, children|null, 释义]`，递归表达派生层级。
- `affixes.json`：`[{id, k, en, zh, count, s}]`；`id` 带方向连字符（`un-` / `-ly`），`k` 为 `prefix|suffix`，`s` 为 `[[释义, [例词…]], …]`。

### 2.6 生成与再生

- 管线：`scripts/scrape-morphemelexicon.cjs` 抓取 morphemelexicon.com → 直接产出六文件；分片缓存于 `.scratch/cache/`，可续跑、限流、429 退避。
- `app/data/*.json` 是**生成物，不要手改**;改数据改抓取/构建脚本后重跑。
- 旧管线 `scripts/build-cet6.js` 产单文件 `app/data/cet6.json`（legacy 格式，见 §4.2）;`Platform.loadBundledLibrary` 为其保留接口，当前主流程不再使用。

### 2.7 official.json（官方考纲词表）

《全国大学英语四、六级考试大纲（2016 年修订版）》PDF「词表」部分的逐行忠实提取，作为词库的**官方根参照**。源 PDF 与两份纯文本列表存于 `assets/words/`：

- `考纲词表-A组-四级(无星).txt`：行首**不带** ★ 的词（四级 / 一般要求），6,632 行，保持 PDF 原始顺序。
- `考纲词表-B组-六级(带星).txt`：行首**带** ★ 的词（六级 / 较高要求），1,264 行。

```json
{ "source": "全国大学英语四、六级考试大纲（2016年修订版）· 词表",
  "note": "逐行忠实提取，保留原始顺序与印刷形态…",
  "cet4": ["a/an", "abandon", "…", "mo(u)ld", "according to", "advisor/adviser"],
  "cet6": ["abbreviation", "abide", "…", "zeal", "zigzag", "zip", "zoom"] }
```

- `cet4` / `cet6` 为**原始词条文本数组**，不做归一化：保留变体对 `advisor/adviser`、同形异义上标 `word¹`、可选字母 `mo(u)ld`、短语 `according to` 等印刷形态;★ 已按分组剥离，不写入数组。
- 提取方法：PyMuPDF 取词表页（PDF 第 21–149 页）文本层;因 PDF 文本层有缺陷（全角 Ｇ 作变体省略号 / 复合词连字符、 apostrophe 丢失、短语空格丢失、上标独行、可选字母跨行），以同考纲家族分组参考 txt 作词典做**字典分词**校正，而非依赖字符几何间距（宽字母 m/w 的间距偏差与真实空格几乎相同，不可靠）。
- 归一化在运行时由 `Library.officialForms` 完成（去上标 → 按 `/` 拆变体 → 小写 → 展开可选字母括号），见 §3。

## 3. 运行时组织（Library）

- `Library.init(ds)` 建立词缀索引并清空词书 / 低阶集合 / 官方词集 / 官方书缓存（[library.js:152-159](../app/js/library.js#L152-L159)）。
- `getBook(tag)`：四元组 + 词根信息经 `enrich` 生成完整词条（[library.js:161-184](../app/js/library.js#L161-L184)），追加派生字段：
  - `morphemes`：前缀/词根/后缀拆分 + 释义;词根不在词面时按已知词缀表回退拆分（[library.js:40-63](../app/js/library.js#L40-L63)）;
  - `senses`：按 `/` 切义项，识别 `pos.` 与 `[域]` 前缀（[library.js:90-105](../app/js/library.js#L90-L105)）;
  - `mnemonic`：≥2 个词素释义时合成「词素链 → 核心义」助记（[library.js:116-122](../app/js/library.js#L116-L122)）。
- `buildCards(entry)` 依 `cardOrder` 生成详解卡片（助记/构词/词根词源/近义/派生/词形/例句/搭配/英释）。
- 考试阶梯 `BOOK_RANK`（中考 0 → GRE 9）：`lowerTags / lowerWordSet` 取**严格低阶**词书词集并缓存，供「跳过低阶重复词」（[library.js:208-217](../app/js/library.js#L208-L217)）。
- **官方考纲书**：`officialBook(level)` 把 `official.json` 的原始词条经 `officialForms` 归一化取首形、按首形去重，再 `enrich` 成可学习词条（标 `official:true` 与 `officialText` 原文），缓存为 `{tag,name,n,entries,groups:[],official:true}`（[library.js:263-279](../app/js/library.js#L263-L279)）。`listBooks` 将「考纲四级（官方）/ 考纲六级（官方）」**置顶**于考试书之前（[library.js:186-197](../app/js/library.js#L186-L197)）;`getBook('考纲四级'|'考纲六级')` 走官方分支（[library.js:163-164](../app/js/library.js#L163-L164)）。官方书**绕过** CEFR 质量过滤与 `skipLower`（官方 tag 不在 `BOOK_RANK`）。
- **考纲对比**：`compareToOfficial(entries, level)` 把任意词书词条与官方词集 `officialWordSet(level)` 比对，返回 `covered`（考纲内）/ `beyond`（超纲）/ `missing`（考纲有而本书缺）及两个覆盖率 `coverageBook`（本书被考纲覆盖比例）/ `coverageOfficial`（考纲被本书覆盖比例）与三份词表（[library.js:282-312](../app/js/library.js#L282-L312)）。归一化 `officialForms`：去上标 → 按 `/` 拆变体 → 小写 → 展开可选字母括号（`mo(u)ld` → `mould`+`mold`）（[library.js:230-243](../app/js/library.js#L230-L243)）。UI 在「词书与计划」页「考纲对比」面板：选源书 + 选考纲级别（四级 / 六级），渲染摘要 + 覆盖率条 + 三个可折叠词表（考纲内 / 超纲 / 考纲缺失），每段限 300 词并可展开全部（[app.js:2008-2068](../app/js/app.js#L2008-L2068)）。
- 自定义词书不走 `getBook`：`activeBook()` 直接返回 `customBooks[tag]`（[app.js:250-255](../app/js/app.js#L250-L255)）;对比面板用 `resolveBook(tag)` 统一解析自定义 / 官方 / 考试书（[app.js:256-260](../app/js/app.js#L256-L260)）。
- 词书过滤只作用于每日队列输入 `studyEntries`，词书本身与测试范围不变（[app.js:263-272](../app/js/app.js#L263-L272)）。

## 4. 自定义词书导入规范

入口：词书与计划页底部常驻导入;接受 `.json .tsv .csv .txt`（[platform.js:126](../app/js/platform.js#L126)）。统一解析器 `Library.parse`（[library.js:452-467](../app/js/library.js#L452-L467)）。

### 4.1 JSON：扁平数组（推荐）

```json
[ { "word": "conduct", "meaning": "n. 行为 / vt. 指挥",
    "cefr": "B1", "phonetic": "/ˈkɑndʌkt/",
    "example": "His conduct was praised.",
    "examples": ["…"], "synonyms": ["behavior"], "collocations": ["code of conduct"],
    "rootFamily": { "root": "co", "rootZh": "共同", "rootEn": "together" } } ]
```

- 也可用 `{ "words": [ … ] }` 包裹；`meaning` 与 `zh` 等价。
- `root` + `rootZh` + `rootEn` 平铺写法等价于 `rootFamily`。
- `antonyms` 可保留但当前界面未使用。
- 多值字符串字段（synonyms/examples/collocations）可用 `;；\n` 分隔。

### 4.2 JSON：legacy cet6 格式

```json
{ "groups": [ { "root": "co", "rootZh": "共同", "rootEn": "together", "familySize": 59,
                "words": [ { "word": "conduct", "meaning": "…", "cefr": "B1",
                             "phonetic": "…", "example": "…" } ] } ],
  "affixes": [ { "affix": "con-", "zh": "共同", "en": "together" } ] }
```

自带 `affixes` 时，词素释义优先用导入表（解析期临时替换词缀索引）。

### 4.3 分隔文本（TSV / CSV / TXT）

规则（[library.js:314-350](../app/js/library.js#L314-L350)）：

1. 首行含 `\t` → TSV，否则 CSV；CSV 支持双引号包裹与 `""` 转义；
2. 去 BOM、去空行、跳过 `#` 注释行；
3. 首行命中表头词表自动跳过（word/words/term/单词/词汇/英文… 与 meaning/释义/中文/解释…）;
4. 列约定：**第 1 列单词、第 2 列释义、第 3 列例句**;音标与 CEFR 留空；
5. 按单词**小写去重**，保留首次出现；
6. 无词根信息，`rootFamily = null`。

### 4.4 命名、落库与边界

- 书名 = 文件名去路径去扩展名、trim、截 24 字符，空则「自定义词书」（[app.js:2089-2092](../app/js/app.js#L2089-L2092)）。
- 与内置书标签/书名或已有自定义书重名 → 追加 `（2）（3）…`（[app.js:2093-2100](../app/js/app.js#L2093-L2100)）。
- 落库：`Store.data.customBooks[name] = { entries: […] }`，保存后立即切换为当前词书（[app.js:2112-2115](../app/js/app.js#L2112-L2115)）。
- 0 词条或解析异常 → alert 拒绝，不写库。
- entries 保存 parse 结果（含 parse 期拆好的 `morphemes`），**不做内置 enrich**：义项分组回退为整条 meaning（[app.js:1044](../app/js/app.js#L1044)），无助记钩子；无阶梯归属，「跳过低阶重复词」对其 no-op。
- 删除自定义书时若为当前书 → 回退「六级」（[app.js:2072](../app/js/app.js#L2072)）。

## 5. 本地存储规范（用户状态）

单一 JSON 文档；写入 250 ms 防抖（[store.js:125-133](../app/js/store.js#L125-L133)）;读取经 `normalize` 缺省补齐、类型纠正与旧版迁移（[store.js:56-123](../app/js/store.js#L56-L123)）。落盘后经 flush hook 触发共享目录镜像（§5.4）。

### 5.1 顶层块

| 块 | 结构 | 说明 |
|---|---|---|
| `srs` | `{word: 状态}` | FSRS-6 状态，见 §5.2 |
| `logs` | `{'YYYY-MM-DD': {newWords[], reviewWords[], know, fuzzy, forgot, ms}}` | 每日活动；打卡/统计/连续天数来源 |
| `views` | `{word: {n, first, last}}` | 接触计数（每次展示 +1） |
| `favorites` / `favGroups` | `{word: {ts, group}}` / `[组名]` | 生词本与分组 |
| `errors` | `{word: {count, last}}` | 错题本 |
| `history` | `[{word, ts}]` | 查词历史，上限 100 |
| `fsrs` | `{w, seqs: {word: [{t, g}]}, count, lastOpt}` | 个性化权重与复习序列 |
| `customBooks` | `{name: {entries[]}}` | 自定义词书（§4） |
| `quiz` | `{config, ability, answered, correct, streak, history}` | 测试配置/能力/按词历史 |
| `quizExamples` | `{word: {examples[≤6], provider, ts}}` | 例句填空缓存 |
| `aiCache` / `dictCache` | `{word: record}` | AI 解释 / 外部词典按词缓存 |
| 偏好 | `plan, activeBook, profile, theme, studyPanel, studyPanelOrder, cardOrder, bookFilter, progressBars, autoSpeak, preferAudio, ttsRate, ttsLang, background, ai, dict` | 本机设置 |

### 5.2 SRS 状态与判定

状态对象（[srs.js:65](../app/js/srs.js#L65)）：`{box, due, reps, lapses, last, state, S, D}`。

- `S/D`：FSRS 稳定度（天）/ 难度;`box/state` 为兼容层（直方图与「已掌握」 cutoff）。
- `due/last`：epoch ms;`state ∈ new | learning | relearn | known`。
- 判定（[srs.js:67-69](../app/js/srs.js#L67-L69)）：`isNew = 无状态或 reps=0 且 box=0`；`isKnown = box ≥ 5`（稳定度 ≥ 15 天）；`isDue = 非 new 且 due ≤ now`。

### 5.3 容量上限

| 项 | 上限 | 出处 |
|---|---|---|
| 查词历史 | 100 条 | [store.js:256](../app/js/store.js#L256) |
| FSRS 每词序列 | 30 条 | [store.js:166](../app/js/store.js#L166) |
| FSRS 序列词数 | 1000 词（超出删最旧） | [store.js:170](../app/js/store.js#L170) |
| FSRS 优化频率 | 每 200 次复习 | [store.js:171](../app/js/store.js#L171) |
| 测试按词历史 | 2000 词（超出删最旧） | [store.js:326](../app/js/store.js#L326) |
| 昵称 / 书名 | 16 / 24 字符 | [store.js:61](../app/js/store.js#L61)、[app.js:2091](../app/js/app.js#L2091) |

### 5.4 存储位置与持久化（卸载不丢数据）

目标：**默认路径固定可查**、**可改任意目录长期保存**、**卸载应用后数据仍在**（除非人工删除）。设置 → 数据 → 「存储位置」面板展示当前路径与操作（[app.js:2205-2242](../app/js/app.js#L2205-L2242)）。三平台策略不同：

| 平台 | 主存储 | 持久化备份 | 卸载后 |
|---|---|---|---|
| Electron | `userData/settings.json`（默认）或自定义目录 | 自定义目录本身即长期存储 | 默认目录通常随卸载清除;自定义目录保留 |
| Android | 应用私有 `localStorage` | 共享目录镜像 `Documents/Glance/Glance-learning-data.json` | 私有存储清除;**共享镜像保留**，重装可恢复 |
| 浏览器 | `localStorage['glance.settings']` | 无（靠手动导出 §6） | 清站点数据即丢失 |

**Electron 可配置数据目录**（[main.js:47-57](../main.js#L47-L57)、[main.js:238-288](../main.js#L238-L288)）：

- 默认目录 `app.getPath('userData')` 不变;可选自定义目录由指针文件 `userData/data-dir.json` 记录（`{dir}`），`currentDataDir()` 读取并校验存在性，失效则回退默认。
- `storage-set-dir`：弹目录选择框（或传入 `dir`）→ 校验可写 → **目标已有 settings.json 则直接采纳**（重装后重新指向旧目录即可找回数据），否则把当前文件迁移过去（read+write+rename，避免 Windows `CopyFileW` EPERM）→ 写指针。
- `storage-reset-dir`：先把自定义目录文件拷回默认（temp-first：先写临时文件再改名，失败不致默认文件缺失;旧默认文件留 `.prev-<ts>` 备份）→ 删指针。
- `storage-open-dir`：资源管理器打开当前数据目录。
- 迁移与回退均**不复制密钥文件**（见 §5.5），故数据目录可安全同步/拷贝。

**Android 共享存储镜像**（`GlanceStorage` 插件，[GlanceStorage.java](../android/app/src/main/java/com/glance/app/GlanceStorage.java)，注册于 [MainActivity.java:11](../android/app/src/main/java/com/glance/app/MainActivity.java#L11)）：

- 主存储仍是应用私有 `localStorage`;镜像是**额外备份**，写到共享目录，卸载应用不会删除。
- 默认目标 `Documents/Glance/Glance-learning-data.json`：API ≥ 29 走 MediaStore（**无需任何权限**，[GlanceStorage.java:160-221](../android/app/src/main/java/com/glance/app/GlanceStorage.java#L160-L221)）;API ≤ 28 走传统 File + `WRITE/READ_EXTERNAL_STORAGE`（manifest 以 `maxSdkVersion="28"` 限定）。
- 可选 SAF 自定义目录树（`pickFolder` → `ACTION_OPEN_DOCUMENT_TREE`，持久化 URI 权限）;`clearFolder` 清除自定义树回退默认。
- 镜像内容 = `Store.exportData()`（§6.1 信封），**不含 API Key 与壁纸原图**。
- 触发：flush hook → 60 s 节流镜像（`scheduleMirror`，[app.js:2191-2193](../app/js/app.js#L2191-L2193)）;页面 `visibilitychange` 隐藏时立即镜像（[app.js:2641](../app/js/app.js#L2641)）;面板「立即备份」手动触发。
- 恢复：首启检测到私有存储为空（无 srs/logs/customBooks/favorites）→ `readMirror` → 弹确认（展示路径与更新时间）→ `importData(payload, 'replace')`（[app.js:2642-2654](../app/js/app.js#L2642-L2654)）。
- 插件 `info()` 返回 `{sdk, defaultPath, custom, hasCustom, customTs, hasDefault, defaultTs}`，供 UI 展示路径与最近备份时间。

**Web 适配层**：`Platform.storageInfo/SetDir/ResetDir/OpenDir/PickFolder/WriteMirror/ReadMirror` 按平台分发（Electron IPC / Android 插件 / 浏览器 no-op）（[platform.js:227-260](../app/js/platform.js#L227-L260)）。

### 5.5 敏感数据安全（API Key 加密）

原则：**API Key 绝不进入共享镜像、便携备份或自定义数据目录的明文**;解密密钥只留在本机私有目录。

- **Electron 静态加密**：`ai.key` / `dict.key` 以 **AES-256-GCM** 密封为 `keyEnc`（前缀 `g1:`，结构 `iv(12)‖authTag(16)‖密文` 的 base64），落盘只存 `keyEnc`（[main.js:90-104](../main.js#L90-L104)）。
  - 密钥为随机 32 字节，存于**默认私有目录** `userData/glance-secret.key`（base64，权限 0600），**永不写入自定义/同步目录**（[main.js:62-76](../main.js#L62-L76)）。因此把数据目录拷走或同步到别处也无法读出 Key。
  - 读取时 `unsealKeys` 解密还原 `key`;解密失败**保留 `keyEnc` 不销毁**（避免下次空 key 落盘永久抹掉 stored key），仅置 `key=''`（[main.js:105-128](../main.js#L105-L128)）。
  - 兼容旧版 `safeStorage` blob（无 `g1:` 前缀）best-effort 解密;因 Windows 上 OSCrypt 密钥跨重启不持久，新构建已改用自管 AES 密钥。
- **Android / 浏览器**：Key 仅存应用私有 `localStorage`，不上传;共享镜像与导出均剔除 Key。
- **备份剔除**：`exportData` 显式 `delete ai.key/keyEnc`、`delete dict.key/keyEnc`（[store.js:384-385](../app/js/store.js#L384-L385)）;`importData` replace 时**保留本机 Key**（[store.js:527-530](../app/js/store.js#L527-L530)）。
- 推论：卸载重装后共享镜像可恢复学习进度，但 **Key 需重新填写**（Key 不在镜像里）。
- **开发期免费 Key（DEV-ONLY，例外说明）**：`ai.js` 的 `DEV_FREE_API.devKey` 是内置在**代码**里的公开开发密钥（非用户私密 Key），供开发期免配置试用 AI；它不属于 `data.ai.key`，故没入备份/镜像（备份只剔除用户 Key）。**正式发布前必须删除该代码块并作废 Key**，详见 [DEVELOPMENT.md §8.25](../DEVELOPMENT.md)。本节加密保护的是**用户自填 Key**，与公开开发 Key 是两回事。

## 6. 备份导出 / 导入规范

### 6.1 导出信封（schema 1）

```json
{ "app": "Glance", "kind": "learning-data", "schema": 1, "exportedAt": "ISO",
  "summary": { "totalWords": 0, "known": 0, "learning": 0, "relearn": 0, "fresh": 0,
               "favorites": 0, "totalViews": 0, "daysActive": 0 },
  "words": [ { "word": "conduct", "state": "learning", "box": 2, "due": "ISO",
               "reps": 3, "lapses": 1, "views": 5, "firstSeen": "ISO", "lastSeen": "ISO",
               "favorite": true, "favoriteGroup": "默认", "errors": 0 } ],
  "data": { "srs": {}, "logs": {}, "views": {}, "favorites": {}, "favGroups": [],
            "history": [], "errors": {}, "fsrs": {}, "aiCache": {}, "dictCache": {},
            "customBooks": {}, "quiz": {}, "quizExamples": {},
            "settings": { "plan": {}, "activeBook": "六级", "cardOrder": [],
                          "studyPanel": {}, "studyPanelOrder": [], "theme": "blue",
                          "autoSpeak": false, "preferAudio": true, "ttsRate": 1, "ttsLang": "",
                          "profile": { "nickname": "", "avatar": "data:…" },
                          "ai": {}, "dict": {}, "background": { "veil": 38, "blur": 0 } } } }
```

（[store.js:365-409](../app/js/store.js#L365-L409)）

- `words`：**通用可读表**（ISO 时间、状态字符串），供外部分析;`data`：**无损还原块**（ms 时间、原始结构）。
- 隐私排除：`ai.key`/`ai.keyEnc`、`dict.key`/`dict.keyEnc` 不导出（[store.js:384-385](../app/js/store.js#L384-L385)）;壁纸原图不导出（仅 veil/blur）;`bookFilter`、`progressBars` 属本机偏好，不入备份。
- 头像与昵称随 `settings.profile` 迁移。

### 6.2 导入语义

校验 `kind === 'learning-data'`，且含 `data` 块或 `words` 表（[store.js:461-467](../app/js/store.js#L461-L467)）。

| 块 | merge | replace |
|---|---|---|
| `srs` / `aiCache` / `dictCache` / `customBooks` | 按词/按书覆盖 | 同 merge（customBooks 不清空，备份外的本地书保留） |
| `logs` | 按日覆盖 | 先清空再还原 |
| `views` | n 相加、first 取早、last 取晚 | 先清空再还原 |
| `errors` | count 取大、last 取晚 | 先清空再还原 |
| `favorites` / `favGroups` | 按词覆盖 / 组名并集 | 先清空再还原 |
| `history` | 合并去重、按 ts 降序截 100 | 先清空再合并 |
| `quiz` | 能力按答题数加权、计数相加、历史累加 | 配置校验后重置、历史清空再累加 |
| `fsrs` | 仅本地 count 为空时接收 | 接收 |
| `settings` | 忽略 | 生效，但**保留本机 API Key** |

（[store.js:469-539](../app/js/store.js#L469-L539)）

### 6.3 仅 words 表的回退重建

无 `data` 块时 best-effort（[store.js:540-555](../app/js/store.js#L540-L555)）：`state ≠ new` 才建 SRS（`known → box=5`，其余 box 取表值或 1，`S/D=0`）;`views>0`、`favorite`、`errors>0` 按表回填;时间字段 `Date.parse` 失败记 0。

## 7. 通用约定速查

- 单词主键**大小写敏感**（`lookup` 精确匹配）;仅导入去重与搜索用 lowercase。
- 音标存储可带 `/`，展示统一剥离;源串多音标以 `, ` 并存。
- 中文义解析顺序：`pos.` 前缀 → `[域]` 前缀 → 剩余为义项;`/` 为义项分隔符。
- 时间：内部 epoch ms，备份表层 ISO;日期键 `YYYY-MM-DD`（本地时区）。
- 数组压缩（四元组/三元组）**仅内置词库**;用户数据与备份一律对象 schema。
- 发音：真人音频（Commons）优先，失败回退原生 TTS / Web Speech。
- 词库质量过滤与词书过滤是两套独立机制：前者裁书（CEFR），后者只裁每日队列（可选开关）。

## 8. 维护约定

1. **改内置数据**：改 `scripts/scrape-morphemelexicon.cjs` 后重跑生成六个抓取文件;不手改 `app/data/*.json`。**例外 `official.json`**：源自官方考纲 PDF 词表（非抓取），见 §2.7 与第 7 条。
2. **改用户状态 schema**：在 `store.js normalize` 加迁移分支（旧数据可读），必要时 bump 导出 `schema` 并在 `importData` 兼容旧版;同步更新本文档 §5/§6。
3. **改导入格式**：扩展 `Library.parse` 分支与表头词表;同步更新本文档 §4 与 README 使用说明。
4. **改词素/义项/助记派生逻辑**：只影响运行时 enrich，不落盘;同步更新本文档 §3。
5. 本文档与 README「文档」节互链;schema 变更的提交信息需注明影响面（词库 / 存储 / 备份）。
6. **改存储位置/加密**：Electron 目录逻辑在 `main.js`（指针 `data-dir.json`、密钥 `glance-secret.key`），Android 镜像在 `GlanceStorage.java`，Web 分发在 `platform.js`，UI 在 `app.js renderStorageUi`;改任一处需同步更新本文档 §5.4/§5.5。**密钥文件与 `keyEnc` 前缀（`g1:`）属安全边界，变更须保证旧数据可解密、失败不销毁 stored key。**
7. **改官方考纲词库**：源 PDF 与 A/B 两份纯文本列表在 `assets/words/`;`official.json` 的 `cet4/cet6` 须保持 PDF 原始顺序与印刷形态（变体 / 上标 / 可选字母 / 短语），归一化只在运行时 `officialForms` 做，不写回数组。改提取须重核 §2.7 方法与两份 txt 行数（A 6,632 / B 1,264）;改对比口径同步更新本文档 §3 与 README「考纲对比」。