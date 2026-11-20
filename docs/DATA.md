# Glance 数据格式与组织规范

本文档说明 Glance 的词库组织、自定义词书导入格式、本地存储结构、存储位置与持久化、敏感数据加密及备份导出/导入规范。
依据代码现状编写（2026-11-14）;**任何 schema 变更必须同步更新本文档**（见 §8）。

- 内置词库：`app/data/*.json`（只读，随包分发）
- 用户状态：Electron `userData/settings.json`（可改自定义目录）/ Android 与浏览器 `localStorage['glance.settings']`
- 持久化备份：Android 共享目录镜像 `Documents/Glance/Glance-learning-data.json`（卸载保留，见 §5.4）
- 便携备份：导出 JSON（`kind: 'learning-data'`，`schema: 1`）

## 1. 三层数据总览

| 层 | 载体 | 读写 | 内容 |
|---|---|---|---|
| 内置索引词库 | `app/data/` 九个 JSON（约 22.5 MB） | 只读 | 10 个考试词书、15,645 词条、8,331 词根、3,100 词缀、官方考纲 7,896 条、真题词频 5,772 词头、选词填空 369 选项词 |
| 用户学习状态 | 单一 JSON 文档（见 §5） | 读写，250 ms 防抖落盘 | SRS 进度、日志、生词本、错题、自定义词书、设置、缓存 |
| 便携备份 | 导出文件（见 §6） | 导出 / 导入 | 通用单词表 + 无损状态块，跨机迁移 |

加载路径：

- Electron：IPC `get-dataset` / `get-settings`（[main.js:342](../main.js#L342)、[main.js:257](../main.js#L257)），设置文件为 `currentDataDir()/settings.json`（[main.js:50-56](../main.js#L50-L56)），默认目录 `userData`、可改自定义目录（§5.4）。
- Android / 浏览器：并行 fetch `data/{meta,exams,roots,roottrees,words,affixes,official,frequency,cloze}.json` + `data/exams/manifest.json`（[platform.js:121-133](../app/js/platform.js#L121-L133)）;真题分片按套懒加载 `data/exams/<examId>.json`（[platform.js:134](../app/js/platform.js#L134)）;设置存 `localStorage['glance.settings']`（[platform.js:10](../app/js/platform.js#L10)）。
- 启动顺序：`Store.load()` → `Library.init(ds)` → `Themes.init(ds.words, ds.cloze)`（[app.js:3339-3365](../app/js/app.js#L3339-L3365)）。

**词库与用户状态完全分离**：清状态不伤词库，换机不丢词库;自定义词书属于用户状态，随备份迁移。

## 2. 内置索引词库（app/data/）

### 2.1 文件清单

| 文件 | 大小 | 结构 | 规模 |
|---|---|---|---|
| `meta.json` | 234 B | 对象 | 来源 / 构建日期 / 考试列表 / 计数 |
| `exams.json` | 1.45 MB | `{考试标签: {groups, loose}}` **纯引用** | 10 书 / 52,307 词引用 |
| `words.json` | 9.1 MB | `{单词: 字段表}` **唯一解释源** | 15,655 键 |
| `roots.json` | 2.7 MB | `{词根: 家族}` | 8,331 键 |
| `roottrees.json` | 1.6 MB | `{词根: 派生树}` | 8,331 键 |
| `affixes.json` | 0.6 MB | 数组 | 3,100 条 |
| `official.json` | 80 KB | `{source, note, cet4[], cet6[]}` | 7,896 条（A 6,632 / B 1,264） |
| `frequency.json` | 282 KB | `{source, …, stats, map}` | 5,772 词头 / 72,380 次 |
| `cloze.json` | 91 KB | `{source, …, decks[], sets[], words[]}` **纯引用** | 26 套 / 390 选项位 / 369 词 |
| `exams/`（目录） | 1.5 MB | `manifest.json`（schema 2）+ 62 分片（§2.10） | 62 套真题 / 平均 26.3 题 / 2 套含官方答案 |
| `cet6.json` | 0.51 MB | legacy 种子（纯引用，§4.2） | 3,516 组 / 5,259 词 |

`official.json`、`frequency.json`、`cloze.json` 是三个**非抓取生成**的内置文件：分别源自官方考纲 PDF 词表（§2.7）、六级真题语料词频 CSV（§2.8）与真题选词填空选项库 JSON（§2.9）。

### 2.2 meta.json

```json
{ "source": "morphemelexicon.com", "built": "2026-11-12",
  "exams": ["中考","高考","四级","六级","考研","专四","专八","托福","雅思","GRE"],
  "counts": { "examWords": 15647, "roots": 8331, "words": 15655, "affixes": 3100, "trees": 8331 } }
```

`examWords` 为跨书含重复的总次数;`words` 为去重词条数（含 10 个本地补全词，§2.4）。`exams` 数组决定词书列表顺序。

### 2.3 exams.json

**词书只存引用与分组，不存任何解释副本**（释义/音标/词性/CEFR 一律运行时取自 `words.json`）。以考试标签为键，每本书：

```json
"六级": {
  "groups": [
    { "root": "co", "words": ["conduct", "introduce"] }
  ],
  "loose": ["log"]
}
```

- `groups[].words` 与 `loose` 均为**单词字符串数组**;同一词可同时出现在多本书里，解释只有一份。
- 组元信息（`rootZh/rootEn/familySize`）运行时由 `roots.json[root]` 补齐;**仅 6 个组例外**（中考/高考/专八 的 `a`、`i` 两组词根不在 `roots.json`），保留内联字段且内联值优先（[library.js:236-266 getBook](../app/js/library.js#L236-L266)）。
- 质量过滤（[library.js:13-20](../app/js/library.js#L13-L20)）：`BOOK_MIN_RANK` = 中考 0 / 高考 2(A2) / 其余 3(B1)；CEFR 秩 A1=1…C2=6;**CEFR 缺失(0) 一律保留**（难度不可判）。CEFR 取全局 `cf`，不再随书携带。
- 界面词数为过滤后（六级 5259 引用 → 4327 词条）。

### 2.4 words.json

以单词为键（大小写敏感主键）：

| 字段 | 含义 | 约定 |
|---|---|---|
| `zh` | 中文义 | `pos. 义 / [域] 义` 格式，`/` 分隔义项;运行时解析为 `senses` |
| `ipa` | 音标 | 源站美式优先;运行时剥首尾 `/`（[library.js:133](../app/js/library.js#L133)） |
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

**唯一解释源约定**：改一个词的释义只改这里，所有词书/牌组/词根家族立即生效;增删词书零改动本文件。10 个源站未收录的词由本地补全（字段最小化：`zh/ipa/cf` + 空数组，`fr=0`）：考纲散词 `a`、`i`（释义取自考试书旧副本，迁移时一次性吸收），以及 8 个选词填空库外选项词（§2.9，构建期合并）。scrape 重跑时会保留这些本地键（不在 `examWords` 内的旧键原样保留）。

### 2.5 roots / roottrees / affixes

- `roots.json`：`{root: {g: 英文释义, zh: 中文, tier, size, family: [[word, zh], …]}}`。**家族成员释义运行时全局优先**：成员是 `words.json` 词头时一律显示全局 `zh`，`family` 里的副本仅对全局未收录的屈折/派生词形（如 `greyer`）生效（[library.js:421-429 getFamily](../app/js/library.js#L421-L429)）。
- `roottrees.json`：`{root: 树}`；节点为三元组 `[word, children|null, 释义]`，递归表达派生层级。
- `affixes.json`：`[{id, k, en, zh, count, s}]`；`id` 带方向连字符（`un-` / `-ly`），`k` 为 `prefix|suffix`，`s` 为 `[[释义, [例词…]], …]`。

### 2.6 生成与再生

- 管线：`scripts/scrape-morphemelexicon.cjs` 抓取 morphemelexicon.com → 直接产出六文件；分片缓存于 `.scratch/cache/`，可续跑、限流、429 退避。**exams 直接产出纯引用**（组元信息在写盘前按 `roots.json` 裁剪）；源站缺词用考试书旧释义补全全局（§2.4），并保留本地补全键。
- `app/data/*.json` 是**生成物，不要手改**;改数据改抓取/构建脚本后重跑。
- 旧管线 `scripts/build-cet6.js` 产单文件 legacy `cet6.json`（输出路径仍指向不存在的根 `data/`，重跑不更新在用文件）;在用的 `app/data/cet6.json` 已降为纯引用种子（§4.2），`Platform.loadBundledLibrary` 为其保留接口，当前主流程不再使用。
- **一次性迁移**：[scripts/migrate-single-source.js](../scripts/migrate-single-source.js) 把旧四元组词书/legacy cet6/cloze 副本降为引用并补全全局 10 词;幂等，迁移后重跑无写入。未来重建走 scrape / cloze 构建器，不再产生副本。
- **验收门**：[scripts/verify-single-source.js](../scripts/verify-single-source.js) 全量比对所有书/牌组/家族的首行释义 === `words.json[word].zh`、跨书字节级一致、无副本残留、引用全解析、exams ≤1.8 MB、三本书加载不慢于基线;失败退出码 1。
- **真题数据两条独立管线**（不联网，只读 `assets/words/` 与 `words.json`）：
  - `npm run data:frequency` → [scripts/build-frequency.js](../scripts/build-frequency.js) → `frequency.json`（§2.8）;
  - `npm run data:cloze` → [scripts/build-cet6-cloze.js](../scripts/build-cet6-cloze.js) → `cloze.json`（§2.9）。
  - **顺序有依赖**：cloze 构建读 `frequency.json` 取每个选项词的语料排名与次数（[build-cet6-cloze.js:82](../scripts/build-cet6-cloze.js#L82)、[build-cet6-cloze.js:125](../scripts/build-cet6-cloze.js#L125)），故须先跑 frequency;缺 `frequency.json` 时不报错，选项词的 `fr/ff` 退化为 0。
  - 两者共用词头归并器 [scripts/lib/lemma.js](../scripts/lib/lemma.js)，保证「语料词形 → 词库词头」口径一致（§2.8）。

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

### 2.8 frequency.json（六级真题语料词频）

源：`assets/words/cet6_full_vocabulary_frequency.csv`（`排名,单词,频次` 三列，11,970 行数据）。这是**按印刷词形**统计的真题语料频次，而应用词库是**按词头**索引的，因此构建期把词形归并到词头。

```json
{ "source": "CET-6 真题语料词频统计",
  "sourceFile": "assets/words/cet6_full_vocabulary_frequency.csv",
  "built": "2026-11-14", "rows": 11970, "headwords": 5772, "totalFreq": 72380,
  "top": { "word": "hear", "freq": 606 },
  "stats": { "exact": 4942, "inflection": 4214, "irregular": 67, "suffix": 117,
             "spelling": 45, "unmatched": 2569, "skipped": 16 },
  "map": { "hear": { "r": 1, "f": 606, "n": 3, "er": 5, "ef": 325 } } }
```

| 字段 | 含义 |
|---|---|
| `r` | **归并后**排名（按 `f` 降序，同频按语料最优排名），1 = 语料最高频 |
| `f` | 归并后总次数 = 词头自身 + 其全部屈折/派生词形的次数之和 |
| `n` | 参与归并的词形个数（含词头自身，若它单独出现过） |
| `er` / `ef` | 词头**自身那一行**的语料排名 / 次数;词头本身未单独出现时为 `0` |

- `r/f` 与 `er/ef` 必须分开：`hear` 归并后 606 次（第 1），但它自身只有 325 次（语料第 5），其余 281 次来自 `heard`/`hearing`。词卡据此说明次数构成，不把归并值冒充词形自身的频次（[app.js:1597-1632 freqSection](../app/js/app.js#L1597-L1632)）。
- **词形归并顺序**（[lemma.js:124-159 resolve](../scripts/lib/lemma.js#L124-L159)）：精确词头 → 词库自带的 `inf`/`der` 反向索引 → 不规则变化表 → 英美拼写变体 → 保守后缀规则。
  - 后缀规则带**词性闸门**与最小词干长度（[lemma.js:56-70](../scripts/lib/lemma.js#L56-L70)）：`hacker` 不会折进 `hack`、`lester` 不会折进 `lest`;纯 `-s` 剥离先跑，`believes` 判为 `believe+s` 而非经 `-ves` 规则误判为 `belief`。
  - 拼写变体只在词库自带索引之后尝试，否则 `filled` 会被 `-lled/-led` 互换读成 `filed`;屈折剥离只作用于原词形，不与拼写变体复合（否则 `notre` → `noter` → `not`）。
  - `NO_FOLD` 黑名单挡住看似屈折的姓氏与 OCR 碎片（[lemma.js:74](../scripts/lib/lemma.js#L74)）;`/^[a-z][a-z'-]{1,}$/` 之外的行（`-hour`、`--have`、单字母）计入 `skipped` 不参与统计（[build-frequency.js:46](../scripts/build-frequency.js#L46)）。
- `unmatched` 2,569 行是词库未收的专有名词、超纲词与语料噪声，**不写入 `map`**，也不新建词条——词频只标注既有词库，不扩充词库。
- 审计产物 `.scratch/frequency-forms.json`（逐词形归属 + 未匹配清单 + 前 40 词头明细）随构建写出，本地忽略不入 Git。

### 2.9 cloze.json（六级选词填空真题选项库）

源：`assets/words/六级选词填空词库_2021-2026.json`（上游 `AndrewYuZhenYu/cet6_exam_questions_txt_collection`）。对应六级 **Part III Reading Comprehension · Section A**，题号 26–35，**15 选 10**：每套给 A–O 共 15 个选项词，填 10 个空。

```json
{ "source": "GitHub: AndrewYuZhenYu/… / cet6_zhenti_cleaned（62 个 txt，2016-06 至 2026-06）",
  "sourceFile": "assets/words/六级选词填空词库_2021-2026.json",
  "built": "2026-11-14",
  "section": "Part III Reading Comprehension · Section A", "range": "26–35", "shape": "15 选 10",
  "setCount": 26, "slotCount": 390, "wordCount": 369, "recentSetCount": 18,
  "notes": ["OCR 把选项字母 O 识别为数字 0…", "…"],
  "missing": [ { "exam": "2021年06月 第1套", "year": 2021, "month": "06", "paper": "01", "file": "2021-06_01.txt" } ],
  "stats": { "exact": 218, "inflection": 143, "irregular": 2, "suffix": 3, "spelling": 3, "unmatched": 0, "extra": 0 },
  "decks": [ { "id": "n", "name": "名词选项", "desc": "…", "words": ["mortality", "access", "…"] } ],
  "sets":  [ { "id": "2026-06_01", "year": 2026, "month": "06", "paper": "01", "exam": "2026年06月 第1套",
               "recent": true, "lead": "Two proposals are before…", "file": "2026-06-01.txt",
               "options": [["A", "anywhere"], ["B", "asserts"], "…", ["O", "reproaching"]] } ],
  "words": [ { "word": "mortality", "lemma": "mortality", "inLibrary": true, "how": "exact",
               "pos": "n", "posAll": ["n"],
               "n": 3, "sets": ["2023-06_03","2024-12_03","2025-12_01"],
               "letters": ["2023-06_03:J","2024-12_03:J","2025-12_01:J"], "fr": 2288, "ff": 5 } ] }
```

**三个数组各司其职**：`sets` 保留每套真题原样（provenance），`words` 是去重后的选项词引用及其考频（**不含释义/CEFR/标签副本**，运行时取自 `words.json[lemma]`），`decks` 是分类后的学习牌组。

| 字段 | 含义 |
|---|---|
| `word` / `lemma` | **印刷词形** / 归并到的词库词头;选项常以屈折形出现（`patterns`、`correlated`），两者可以不同 |
| `inLibrary` / `how` | 词库是否收录该词头 / 归并方式（同 §2.8 的 `stats` 口径） |
| `pos` / `posAll` | 首要词性 / **该词形能填的全部空位类型**;`posAll` 决定它进哪几个词性牌组 |
| `n` / `sets` / `letters` | 出现过的真题套数 / 套 id 列表 / `套id:选项字母` 列表（`letters.length === n`） |
| `fr` / `ff` | 该词头在 `frequency.json` 里的归并排名 / 次数;未命中为 0 |

- **词性按印刷词形判定，不照抄词头**（[build-cet6-cloze.js:63-79 formPos](../scripts/build-cet6-cloze.js#L63-L79)）：`purchasable` 是形容词而非 `purchase` 的名/动;`-ing`/`-ed` 同时进动词与形容词组;`-ly` 进副词组但 `friendly`/`likely` 等 24 个 `-ly` 形容词除外;`laymen` 判名词而非 `lay + -men`。裸 `-s` 无法区分复数与三单，交由词头词性决定。**词形与词头相同者直接取词头词性**（`replanting` 并入全局后判动词，不再兼形容词）。150 个词形属多词性，故四个词性牌组词数之和（523）大于去重词数 369。
- **牌组顺序即学习顺序**：先按真题重复次数降序，再按语料次数降序，最后字母序（[build-cet6-cloze.js:155](../scripts/build-cet6-cloze.js#L155)）。运行时**不得**用词库通用 `fr` 重排（[themes.js:234-242](../app/js/themes.js#L234-L242)）。
- **7 个牌组**：`n` 140 / `v` 171 / `adj` 161 / `adv` 51 / `repeat` 19（≥2 套）/ `recent` 255（2021–2026）/ `all` 369。
- **8 个源站未收录选项词**（`behavioural`、`demographics`、`depictions`、`duplications`、`logistical`、`prioritize`、`replanting`、`unmatchable`）的释义在**构建期合并进 `words.json`**（唯一解释源），cloze 本身只留引用;释义表 `EXTRA_GLOSS` 仍是这 8 词的出处（[build-cet6-cloze.js:32-47](../scripts/build-cet6-cloze.js#L32-L47)）。任何选项词在全局缺释义即构建失败（[build-cet6-cloze.js:130](../scripts/build-cet6-cloze.js#L130)）。
- **14 套缺失真题**记于 `missing`（上游仓库无原文），界面列为不可点的说明行，不伪造数据;`notes` 原样保留上游 4 条 OCR 清洗记录。
- `lead` 是**篇目开头摘录**（约 90 字符），不是完整首句;3 套原文开头被截断，`lead` 为空串。界面标注「篇目开头 · 原文摘录」并在非句末时补省略号。
- 每套必须恰好 15 个选项，否则构建抛错（[build-cet6-cloze.js:95](../scripts/build-cet6-cloze.js#L95)）;`slotCount = setCount × 15`。

### 2.10 exams/（六级真题刷题分片）

- **来源**：Gitee `Mjs_00987/cet6_exam_questions_txt_collection` 的 `cet6_zhenti_cleaned/` 62 个 txt（2016–2026，两种命名 `2016-06_01` / `2026-06-01` 均保留原样作 examId）。源 txt 缓存 `.scratch/zhenti-src/`（不入库）;Gitee raw 有 451 反爬，用 `git clone --depth 1` 取源。
- **来源与导入（2026-11-20 起 schema 2）**：在用集为外部 schema 2 分片集（含答案元数据），经 `npm run data:exams:import -- <src-dir>` → [scripts/import-exams.js](../scripts/import-exams.js) 拷入分片并**由分片派生 manifest**（补 `writing/translation` 布尔、题量/题型/sha256/size，按年/月/套降序）;校验 examId 与文件名一致、sections 存在，失败退出码 1;目录中多余旧分片自动清理。**分片是唯一源，manifest 不手改**。原始 txt 溯源管线 [scripts/build-exams.js](../scripts/build-exams.js)（schema 1）保留但**重跑会覆盖在用集**，之后须重新导入 schema 2。
- **分片 schema 2**：schema 1 字段（`sections/groups/questions/writing/translation/quality/source`）不变，新增 `hasAnswers, answersComplete, answersCoverage, answersSource, answersNote, stats{questionCount, byType, missingNos, types}`;`answers` 为 `{"1":"A",…}` map 或 null——2026-06-01（55/55）与 2026-06-03（29/30）含官方答案，其余 null 留位。`type ∈ listening/cloze/matching/reading`;匹配段落字母并入 `passage` 行首 `[A]`–`[O]`，客户端按行切段;cloze 词库在 `group.bank`。
- **加载**：启动只读 `exams/manifest.json`（[platform.js:121-133](../app/js/platform.js#L121-L133)、[main.js:342-360](../main.js#L342-L360)）;打开某套才 `Platform.loadExamShard(examId)`（[platform.js:134](../app/js/platform.js#L134)、Electron IPC `get-exam-shard` [main.js:363](../main.js#L363)，examId 正则白名单）。**分片不进启动全量加载**。年份网格由 manifest 运行时分组，不另存 by-year 聚合（避免重复存储）。
- **残缺如实**：跳号记 `gaps` 不补空题;缺字母记 `missingOptions` 不顶替;`needsReview` 套界面顶部提示与网格「残缺」徽标;含答案套网格显示「含答案 / 答案 xx%」徽标。旧 `report.json` 已随 schema 2 导入移除（解析覆盖率基线仅属 legacy 管线）。

## 3. 运行时组织（Library）

- `Library.init(ds)` 建立词缀索引并清空词书 / 低阶集合 / 官方词集 / 官方书 / 词频书缓存与选词填空索引（[library.js:225-234](../app/js/library.js#L225-L234)）。
- `getBook(tag)`：**词引用 + 词根分组**经 `enrich` 生成完整词条（[library.js:236-266](../app/js/library.js#L236-L266)）;`enrich(word, rootId, rootZh, rootEn, familySize)` 的释义/音标/CEFR/派生/例句**全部取自 `words.json`**，不接受词书传入的解释（[library.js:126-152](../app/js/library.js#L126-L152)）。追加派生字段：
  - `morphemes`：前缀/词根/后缀拆分 + 释义;词根不在词面时按已知词缀表回退拆分（[library.js:40-63](../app/js/library.js#L40-L63)）;
  - `senses`：按 `/` 切义项，识别 `pos.` 与 `[域]` 前缀（[library.js:90-105](../app/js/library.js#L90-L105)）;
  - `mnemonic`：≥2 个词素释义时合成「词素链 → 核心义」助记（[library.js:116-122](../app/js/library.js#L116-L122)）;
  - `examFreq`：真题语料词频 `{rank, freq, forms, exactRank, exactFreq}`，语料未收该词为 `null`（[library.js:157-162 freqOf](../app/js/library.js#L157-L162)）。**与 `words.json` 的 `fr` 是两套指标**：`fr` 是源站通用词频，`examFreq` 是六级真题语料频次，互不覆盖。
- **统一信息块（学习页与词卡同源）**：`renderWordBlocks(entry, host)` 按 `studyPanelOrder` 顺序、`studyPanel` 开关生成 16 个块——音标 / 构词 / 助记 / 释义 / 英文释义 / 词根家族 / 近义词 / 派生词 / 词形变化 / 词源 / 例句 / 搭配 / 真题词频 / 选词填空 / 词典 / AI（[app.js:398-534](../app/js/app.js#L398-L534)）。学习页 `#word-blocks` 与词卡弹层 `.word-blocks` 调用同一渲染器（[index.html:39](../app/index.html#L39)、[app.js:1625-1627](../app/js/app.js#L1625-L1627)），资源来源不同（全局词库 / 真题语料 / 词典缓存 / AI 缓存）但显示与配置只有一套。词典与 AI 块**缓存优先**：有缓存直接离线渲染，无缓存时在块内点「查询词典」/「生成 AI 解释」才联网（[app.js:1786](../app/js/app.js#L1786)、[app.js:1887](../app/js/app.js#L1887)）;渲染词卡本身不发起任何网络请求。
- 考试阶梯 `BOOK_RANK`（中考 0 → GRE 9）：`lowerTags / lowerWordSet` 取**严格低阶**词书词集并缓存，供「跳过低阶重复词」（[library.js:285](../app/js/library.js#L285)）。
- **官方考纲书**：`officialBook(level)` 把 `official.json` 的原始词条经 `officialForms` 归一化取首形、按首形去重，再 `enrich` 成可学习词条（标 `official:true` 与 `officialText` 原文），缓存为 `{tag,name,n,entries,groups:[],official:true}`（[library.js:370-386](../app/js/library.js#L370-L386)）。`listBooks` 将「考纲四级（官方）/ 考纲六级（官方）」**置顶**于考试书之前、真题词频书置于末尾（[library.js:268-281](../app/js/library.js#L268-L281)）;`getBook('考纲四级'|'考纲六级')` 走官方分支（[library.js:236-266](../app/js/library.js#L236-L266)）。官方书**绕过** CEFR 质量过滤与 `skipLower`（官方 tag 不在 `BOOK_RANK`）。
- **考纲对比**：`compareToOfficial(entries, level)` 把任意词书词条与官方词集 `officialWordSet(level)` 比对，返回 `covered`（考纲内）/ `beyond`（超纲）/ `missing`（考纲有而本书缺）及两个覆盖率 `coverageBook`（本书被考纲覆盖比例）/ `coverageOfficial`（考纲被本书覆盖比例）与三份词表（[library.js:389-418](../app/js/library.js#L389-L418)）。归一化 `officialForms`：去上标 → 按 `/` 拆变体 → 小写 → 展开可选字母括号（`mo(u)ld` → `mould`+`mold`）（[library.js:337-348](../app/js/library.js#L337-L348)）。UI 在「词书与计划」页「考纲对比」面板：选源书 + 选考纲级别（四级 / 六级），渲染摘要 + 覆盖率条 + 三个可折叠词表（考纲内 / 超纲 / 考纲缺失），每段限 300 词并可展开全部（[app.js:2404-2465](../app/js/app.js#L2404-L2465)）。
- 自定义词书不走 `getBook`：`activeBook()/resolveBook(tag)` 经 `Library.customBook(tag, stored)` 把**引用**在读取时富化成完整词条（[app.js:269-279](../app/js/app.js#L269-L279)、[library.js:607-625 customBook](../app/js/library.js#L607-L625)）;全局未收录的词保留用户自带释义作为该词的唯一解释。
- 词书过滤只作用于每日队列输入 `studyEntries`，词书本身与测试范围不变（[app.js:282-299](../app/js/app.js#L282-L299)）。
- **真题词频书**：`freqBook()` 把 `frequency.json` 的 `map` 按 `r` 升序取词头、逐个 `lookup` 成词条，缓存为 `{tag:'真题词频', name:'六级真题词频', n, entries, groups:[], frequency:true}`（[library.js:172-179 freqBook](../app/js/library.js#L172-L179)）。`getBook('真题词频')` 走该分支、`listBooks` 把它排在考试书之后（[library.js:268-281](../app/js/library.js#L268-L281)）。**排序即教学顺序**：`SRS.buildQueue` 按词书给定顺序取新词，所以学这本书就是从真题最高频词开始。同官方书一样绕过 CEFR 过滤与 `skipLower`（`真题词频` 不在 `BOOK_RANK`）。
- **选词填空运行时接口**（[library.js:181-223](../app/js/library.js#L181-L223)）：`clozeMeta/clozeDecks/clozeDeck/clozeWords/clozeOf/clozeSets/clozeSet/clozePosName` 只读访问 §2.9 的三个数组;`clozeMap()` 建「小写词形 → 选项记录」索引并缓存，`init` 时清空。
- **`lookup` 的选词填空回退**（[library.js:483-491 lookup](../app/js/library.js#L483-L491)）：词库查不到该词形时，若它是真题选项，就用 `clozeEntry(word)` 造卡——**以词头富化（释义/音标/词根/派生齐全，全部来自全局），但保留印刷词形**，因为考试考的正是该词形的词性（[library.js:214-223 clozeEntry](../app/js/library.js#L214-L223)）。这条规则对**所有**选项词形生效：`patterns` 的词头 `pattern` 在词库里，但卡片标题必须是 `patterns`。`clozeOnly` 标记全局未收录的词（当前为 0 个，8 词已并入全局）。
- `search` 在词库命中不足 limit 时，补入**非词头键的选项词形**（释义经词头取自全局），保证 `patterns` 这类印刷形搜得到（[library.js:455-465](../app/js/library.js#L455-L465)）。
- **专项分类器接入**：`Themes.init(words, cloze)` 除 29 个静态主题外，把 `cloze.decks` 注册为 `cloze_<id>` 动态主题（`group:'exam'`），**原样保留构建顺序**（[themes.js:195-244 init](../app/js/themes.js#L195-L244)）。因此新牌组自动进入「专项」页与测试中心的「当前专项」范围，无需改测试引擎。

## 4. 自定义词书导入规范

入口：词书与计划页底部常驻导入;接受 `.json .tsv .csv .txt`（[platform.js:140](../app/js/platform.js#L140)）。统一解析器 `Library.parse`（[library.js:583-605](../app/js/library.js#L583-L605)）。**全局已收录的词在解析期即降为纯引用**（`{word, rootFamily}`），导入携带的释义/音标/CEFR/例句副本一律丢弃;全局未收录的词保留用户自带内容作为该词的唯一解释。

### 4.1 JSON：扁平数组（推荐）

```json
[ { "word": "conduct", "meaning": "n. 行为 / vt. 指挥",
    "cefr": "B1", "phonetic": "/ˈkɑndʌkt/",
    "example": "His conduct was praised.",
    "examples": ["…"], "synonyms": ["behavior"], "collocations": ["code of conduct"],
    "rootFamily": { "root": "co", "rootZh": "共同", "rootEn": "together" } } ]
```

- 也可用 `{ "words": [ … ] }` 包裹；`meaning` 与 `zh` 等价。**二者仅对全局未收录的词生效**（旧版导入兜底）;已收录词以全局 `zh` 为准。
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

自带 `affixes` 时，词素释义优先用导入表（解析期临时替换词缀索引）。`groups[].words` 同时接受**字符串引用**（新格式，如在用的 `cet6.json`）与上述对象（legacy 兜底）（[library.js:525-536 fromCet6](../app/js/library.js#L525-L536)）。

### 4.3 分隔文本（TSV / CSV / TXT）

规则（[library.js:565-581](../app/js/library.js#L565-L581)）：

1. 首行含 `\t` → TSV，否则 CSV；CSV 支持双引号包裹与 `""` 转义；
2. 去 BOM、去空行、跳过 `#` 注释行；
3. 首行命中表头词表自动跳过（word/words/term/单词/词汇/英文… 与 meaning/释义/中文/解释…）;
4. 列约定：**第 1 列单词、第 2 列释义、第 3 列例句**;音标与 CEFR 留空；
5. 按单词**小写去重**，保留首次出现；
6. 无词根信息，`rootFamily = null`。

### 4.4 命名、落库与边界

- 书名 = 文件名去路径去扩展名、trim、截 24 字符，空则「自定义词书」（[app.js:2588-2591](../app/js/app.js#L2588-L2591)）。
- 与内置书标签/书名或已有自定义书重名 → 追加 `（2）（3）…`（[app.js:2592-2599](../app/js/app.js#L2592-L2599)）。
- 落库：`Store.data.customBooks[name] = { entries: […] }`，保存后立即切换为当前词书（[app.js:2611-2614](../app/js/app.js#L2611-L2614)）。
- 0 词条或解析异常 → alert 拒绝，不写库。
- entries 落盘为**引用**（全局已收录词）或用户自带内容（未收录词）;读取时经 `Library.customBook` 富化：已收录词与内置书完全同源（义项分组/助记钩子齐全），未收录词回退整条用户释义。旧版落盘的副本在启动时一次性迁移删除（[library.js:627-640 migrateCustomBooks](../app/js/library.js#L627-L640)、[app.js:3366](../app/js/app.js#L3366)），迁移幂等。无阶梯归属，「跳过低阶重复词」对其 no-op。
- 删除自定义书时若为当前书 → 回退「六级」（[app.js:2547](../app/js/app.js#L2547)）。

## 5. 本地存储规范（用户状态）

单一 JSON 文档；写入 250 ms 防抖（[store.js:182-185](../app/js/store.js#L182-L185)）;读取经 `normalize` 缺省补齐、类型纠正与旧版迁移（[store.js:108-174](../app/js/store.js#L108-L174)）。落盘后经 flush hook 触发共享目录镜像（§5.4）。

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
| `customThemes` | `[{id, name≤20, words[], ts}]` | 自定义专项词组；id 为 `ct_` 前缀，词去重保序 |
| `quiz` | `{config, ability, answered, correct, streak, history}` | 测试配置/能力/按词历史;`config` 含 `explore`(0–40，默认 20)/`confusion`/`curated`;`history[word]` 含 `mix{伙伴词: 误选次数}`（每词 ≤8，[store.js:574 cleanMix](../app/js/store.js#L574)、[store.js:586 recordQuizResult](../app/js/store.js#L586)） |
| `quizExamples` | `{word: {examples[≤6], provider, ts}}` | 例句填空缓存 |
| `aiCache` / `dictCache` | `{word: record}` | AI 解释 / 外部词典按词缓存 |
| `space` | `{report: {date: rec}, clinic: {word: rec}, qa: {word: {turns[≤8], t, provider, model}}}` | AI 学习空间缓存：每日报告按天、门诊讲解按词、问答按词多轮;rec 为 `{text≤4000, t, provider, model}`;上限 report 14 / clinic 300 / qa 100（[store.js normalizeSpace](../app/js/store.js)） |
| 偏好 | `plan, activeBook, profile, theme, studyPanel, studyPanelOrder, bookFilter, progressBars, autoSpeak, preferAudio, ttsRate, ttsLang, background, ai, dict` | 本机设置 |

**`dict` 块（多词典）**（[store.js:34](../app/js/store.js#L34)、[store.js:61-106 normalizeDict](../app/js/store.js#L61-L106)）：

```jsonc
{
  "provider": "freezh",          // 主镜像 = enabled[0]，仅为兼容旧字段，由 syncDictPrimary 自动同步
  "enabled": ["freezh", "uapis", "free", "custom-1"],  // 已开启的源，数组顺序即优先级
  "merge": true,                 // true 并行合并去重；false 串行、命中即停
  "custom": [                    // 用户添加的端点，id 取首个空闲的 custom-N
    { "id": "custom-1", "name": "英文备用源", "base": "https://…/{word}",
      "format": "auto",          // auto | youdao | uapis | free | mw
      "auth": "bearer",          // none | bearer | query | header
      "headerName": "" }         // auth=header 时的头名，留空用 X-API-Key
  ],
  "keys": { "mw": "…", "custom-1": "…" }   // 全部词典 Key 集中在此，落盘时整体换成 keysEnc
}
```

- 内置 id 固定 `freezh / uapis / free / mw`;`enabled` 只接受已知 id、自动去重，未知 id 丢弃（[store.js:58-60](../app/js/store.js#L58-L60)）。
- **旧版迁移**：单服务商时代的 `dict.provider` 转为 `enabled:[provider]`;`dict.key` 迁入 `keys[provider]`;旧的 `provider:'custom' + base` 自动转成一条 `custom-N` 并把 Key 一并搬过去（[store.js:84-96](../app/js/store.js#L84-L96)）。
- `dictCache[word]` 除释义外还存 `providers[]`（参与合并的源）、`sources[]`（各源原始记录）与 `sig`（启用集合签名）;`sig` 与当前配置不符即视为过期，自动重查（[dictionary.js:38](../app/js/dictionary.js#L38)、[dictionary.js:620-624](../app/js/dictionary.js#L620-L624)）。

**学习面板（唯一顺序 + 唯一开关）**（[store.js:15-24](../app/js/store.js#L15-L24)、[store.js:121-132](../app/js/store.js#L121-L132)）：

```jsonc
{
  "studyPanel": { "phonetic": true, "morphemes": true, "mnemonic": true, "meaning": true,
                  "definitions": true, "family": true, "synonyms": true, "derivatives": true,
                  "inflections": true, "etymology": true, "examples": true, "collocations": true,
                  "freq": true, "cloze": true, "dict": true, "ai": true },   // 16 块，默认全开
  "studyPanelOrder": ["phonetic", "morphemes", "mnemonic", "meaning", "definitions", "family",
                      "synonyms", "derivatives", "inflections", "etymology", "examples",
                      "collocations", "freq", "cloze", "dict", "ai"]          // 唯一排列，学习页与词卡共用
}
```

- 归一化：非法 id 丢弃、重复去重、缺失按默认补齐;学习页与词卡弹层都只读这一份（[app.js:400-404 panelOrder](../app/js/app.js#L400-L404)）。
- **旧版迁移**：旧 `cardOrder`（弹层卡片顺序）在本机没有 `studyPanelOrder` 时整段接管顺序、保留旧相对次序，否则只补缺失块，随后删除该键;旧 `ai.autoExplain`（打开详解自动生成）一律删除，AI 改为块内手动生成（[store.js:125-129](../app/js/store.js#L125-L129)、[store.js:146](../app/js/store.js#L146)）。
- 导出/导入：`settings.studyPanel` + `settings.studyPanelOrder`;导入旧备份的 `settings.cardOrder` 按同一规则迁移，`autoExplain` 同样丢弃（[store.js:641-646](../app/js/store.js#L641-L646)、[store.js:653](../app/js/store.js#L653)）。
- 验收门：`node scripts/verify-panel-order.js`（默认值 / 旧顺序迁移 / 脏顺序清洗 / 导出形状 / 新旧备份导入）。

### 5.2 SRS 状态与判定

状态对象（[srs.js:66](../app/js/srs.js#L66)）：`{box, due, reps, lapses, last, state, S, D}`。

- `S/D`：FSRS 稳定度（天）/ 难度;`box/state` 为兼容层（直方图与「已掌握」 cutoff）。
- `due/last`：epoch ms;`state ∈ new | learning | relearn | known`。
- 判定（[srs.js:69-71](../app/js/srs.js#L69-L71)）：`isNew = 无状态或 reps=0 且 box=0`；`isKnown = box ≥ 5`（稳定度 ≥ 15 天）；`isDue = 非 new 且 due ≤ now`。

### 5.3 容量上限

| 项 | 上限 | 出处 |
|---|---|---|
| 查词历史 | 100 条 | [store.js:264](../app/js/store.js#L264) |
| FSRS 每词序列 | 30 条 | [store.js:174](../app/js/store.js#L174) |
| FSRS 序列词数 | 1000 词（超出删最旧） | [store.js:178](../app/js/store.js#L178) |
| FSRS 优化频率 | 每 200 次复习 | [store.js:179](../app/js/store.js#L179) |
| 测试按词历史 | 2000 词（超出删最旧） | [store.js:334](../app/js/store.js#L334) |
| AI 空间缓存 | report 14 天 / clinic 300 词 / qa 100 词、每词 turns ≤8、text ≤4000 | [store.js normalizeSpace / SPACE_CAPS](../app/js/store.js) |
| 昵称 / 书名 | 16 / 24 字符 | [store.js:62](../app/js/store.js#L62)、[app.js:2539](../app/js/app.js#L2539) |

### 5.4 存储位置与持久化（卸载不丢数据）

目标：**默认路径固定可查**、**可改任意目录长期保存**、**卸载应用后数据仍在**（除非人工删除）。设置 → 数据 → 「存储位置」面板展示当前路径与操作（[app.js:2488-2525](../app/js/app.js#L2488-L2525)）。三平台策略不同：

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
- 触发：flush hook → 60 s 节流镜像（`scheduleMirror`，[app.js:2690-2693](../app/js/app.js#L2690-L2693)）;页面 `visibilitychange` 隐藏时立即镜像（[app.js:3342](../app/js/app.js#L3342)）;面板「立即备份」手动触发。
- 恢复：首启检测到私有存储为空（无 srs/logs/customBooks/favorites）→ `readMirror` → 弹确认（展示路径与更新时间）→ `importData(payload, 'replace')`（[app.js:2694-2703](../app/js/app.js#L2694-L2703)）。
- 插件 `info()` 返回 `{sdk, defaultPath, custom, hasCustom, customTs, hasDefault, defaultTs}`，供 UI 展示路径与最近备份时间。

**Web 适配层**：`Platform.storageInfo/SetDir/ResetDir/OpenDir/PickFolder/WriteMirror/ReadMirror` 按平台分发（Electron IPC / Android 插件 / 浏览器 no-op）（[platform.js:251-286](../app/js/platform.js#L251-L286)）。

### 5.5 敏感数据安全（API Key 加密）

原则：**API Key 绝不进入共享镜像、便携备份或自定义数据目录的明文**;解密密钥只留在本机私有目录。

- **Electron 静态加密**：`ai.key` 与 `dict.keys` 里的**每一个**词典 Key 以 **AES-256-GCM** 密封（前缀 `g1:`，结构 `iv(12)‖authTag(16)‖密文` 的 base64），落盘只存 `ai.keyEnc` / `dict.keysEnc[id]`（[main.js:90-104](../main.js#L90-L104)、[main.js:106-133 sealKeys](../main.js#L106-L133)）。
  - 密钥为随机 32 字节，存于**默认私有目录** `userData/glance-secret.key`（base64，权限 0600），**永不写入自定义/同步目录**（[main.js:62-76](../main.js#L62-L76)）。因此把数据目录拷走或同步到别处也无法读出 Key。
  - 读取时 `unsealKeys` 逐 id 解密还原 `dict.keys`;某个 id 解密失败**只保留该 id 的密文**、其余照常还原（避免下次空 key 落盘永久抹掉 stored key），失败项置 `keys[id]=''`（[main.js:134-159](../main.js#L134-L159)）。空串占位会被 `normalizeDict` 原样保留，不会被下一次落盘清掉（[store.js:61-70](../app/js/store.js#L61-L70)）。
  - 删除自定义词典或清空 Key 时，对应的 `keysEnc[id]` 一并移除，不留孤儿密文（[main.js:119-122](../main.js#L119-L122)、[store.js:414-424 removeDictSource](../app/js/store.js#L414-L424)）。
  - 兼容旧版 `safeStorage` blob（无 `g1:` 前缀）best-effort 解密;因 Windows 上 OSCrypt 密钥跨重启不持久，新构建已改用自管 AES 密钥。
- **Android / 浏览器**：Key 仅存应用私有 `localStorage`，不上传;共享镜像与导出均剔除 Key。
- **备份剔除**：`exportData` 显式 `delete ai.key/keyEnc`、`delete dict.key/keyEnc/keys/keysEnc`，并逐个清洗 `dict.custom[].key`（[store.js:498-503](../app/js/store.js#L498-L503)）;`importData` replace 时**保留本机整个 Key 映射**，导入的自定义词典若与本机同 id 则沿用本机 Key（[store.js:645-652](../app/js/store.js#L645-L652)）。
- 推论：卸载重装后共享镜像可恢复学习进度，但 **Key 需重新填写**（Key 不在镜像里）。
- **开发期免费 Key（DEV-ONLY，例外说明）**：`ai.js` 的 `DEV_FREE_API.devKey` 与 `QNAI_FREE_API.devKey` 是内置在**代码**里的公开开发密钥（非用户私密 Key），供开发期免配置试用 AI；它们不属于 `data.ai.key`，故没入备份/镜像（备份只剔除用户 Key）。**正式发布前必须删除这两整块代码并到服务端作废 Key**（Key 已进公开 git 历史），详见 [DEVELOPMENT.md §8.25](../DEVELOPMENT.md)。本节加密保护的是**用户自填 Key**，与公开开发 Key 是两回事。

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
            "customBooks": {}, "customThemes": [], "quiz": {}, "quizExamples": {},
            "settings": { "plan": {}, "activeBook": "六级",
                          "studyPanel": {}, "studyPanelOrder": [], "theme": "blue",
                          "autoSpeak": false, "preferAudio": true, "ttsRate": 1, "ttsLang": "",
                          "profile": { "nickname": "", "avatar": "data:…" },
                          "ai": {}, "dict": {}, "background": { "veil": 38, "blur": 0 } } } }
```

（[store.js:482-530 exportData](../app/js/store.js#L482-L530)）

- `words`：**通用可读表**（ISO 时间、状态字符串），供外部分析;`data`：**无损还原块**（ms 时间、原始结构）。
- 隐私排除：`ai.key`/`ai.keyEnc`、`dict.key`/`dict.keyEnc`/`dict.keys`/`dict.keysEnc` 与 `dict.custom[].key` 不导出（[store.js:498-503](../app/js/store.js#L498-L503)）;壁纸原图不导出（仅 veil/blur）;`bookFilter`、`progressBars` 属本机偏好，不入备份。
- 头像与昵称随 `settings.profile` 迁移。

### 6.2 导入语义

校验 `kind === 'learning-data'`，且含 `data` 块或 `words` 表（[store.js:582-588](../app/js/store.js#L582-L588)）。

| 块 | merge | replace |
|---|---|---|
| `srs` / `aiCache` / `dictCache` / `customBooks` | 按词/按书覆盖 | 同 merge（customBooks 不清空，备份外的本地书保留） |
| `logs` | 按日覆盖 | 先清空再还原 |
| `views` | n 相加、first 取早、last 取晚 | 先清空再还原 |
| `errors` | count 取大、last 取晚 | 先清空再还原 |
| `favorites` / `favGroups` | 按词覆盖 / 组名并集 | 先清空再还原 |
| `customThemes` | 按 id 并集：words 合并去重，name 取 ts 较新者 | 先清空再还原 |
| `history` | 合并去重、按 ts 降序截 100 | 先清空再合并 |
| `quiz` | 能力按答题数加权、计数相加、历史累加（`mix` 次数相加后按 top-8 截断） | 配置校验后重置（含 explore/confusion/curated）、历史清空再累加 |
| `fsrs` | 仅本地 count 为空时接收 | 接收 |
| `space` | 按 key 取 t 较新者;qa 同词 turns 去重合并后截 8 | 先清空再按 merge 还原 |
| `settings` | 忽略 | 生效，但**保留本机 API Key**;学习面板按 §5.1 迁移（旧 `cardOrder` 接管顺序、`autoExplain` 丢弃） |

（[store.js:582-687 importData](../app/js/store.js#L582-L687)）

### 6.3 仅 words 表的回退重建

无 `data` 块时 best-effort（[store.js:670-684](../app/js/store.js#L670-L684)）：`state ≠ new` 才建 SRS（`known → box=5`，其余 box 取表值或 1，`S/D=0`）;`views>0`、`favorite`、`errors>0` 按表回填;时间字段 `Date.parse` 失败记 0。

## 7. 通用约定速查

- 单词主键**大小写敏感**（`lookup` 精确匹配）;仅导入去重与搜索用 lowercase。
- 音标存储可带 `/`，展示统一剥离;源串多音标以 `, ` 并存。
- 中文义解析顺序：`pos.` 前缀 → `[域]` 前缀 → 剩余为义项;`/` 为义项分隔符。
- 时间：内部 epoch ms，备份表层 ISO;日期键 `YYYY-MM-DD`（本地时区）。
- 内置词书/牌组**只存单词引用与分组**（字符串数组）;解释副本零容忍。用户数据与备份一律对象 schema;旧版自定义书副本由启动迁移一次性清除。
- 发音：真人音频（Commons）优先，失败回退原生 TTS / Web Speech。
- 词库质量过滤与词书过滤是两套独立机制：前者裁书（CEFR），后者只裁每日队列（可选开关）。

## 8. 维护约定

1. **改内置数据**：改 `scripts/scrape-morphemelexicon.cjs` 后重跑生成六个抓取文件;不手改 `app/data/*.json`。**例外 `official.json` / `frequency.json` / `cloze.json`**：均非抓取生成，分别见 §2.7 / §2.8 / §2.9 与第 7、9 条。**任何改动后跑 `node scripts/verify-single-source.js` 验收门**（首行同源 0 例外 / 无副本 / 引用全解析 / 体积与耗时不劣化）;新增词书只能加引用，不得携带解释。
2. **改用户状态 schema**：在 `store.js normalize` 加迁移分支（旧数据可读），必要时 bump 导出 `schema` 并在 `importData` 兼容旧版;同步更新本文档 §5/§6。
3. **改导入格式**：扩展 `Library.parse` 分支与表头词表;同步更新本文档 §4 与 README 使用说明。
4. **改词素/义项/助记派生逻辑**：只影响运行时 enrich，不落盘;同步更新本文档 §3。
5. 本文档与 README「文档」节互链;schema 变更的提交信息需注明影响面（词库 / 存储 / 备份）。
6. **改存储位置/加密**：Electron 目录逻辑在 `main.js`（指针 `data-dir.json`、密钥 `glance-secret.key`），Android 镜像在 `GlanceStorage.java`，Web 分发在 `platform.js`，UI 在 `app.js renderStorageUi`;改任一处需同步更新本文档 §5.4/§5.5。**密钥文件与 `keyEnc` 前缀（`g1:`）属安全边界，变更须保证旧数据可解密、失败不销毁 stored key。**
7. **改官方考纲词库**：源 PDF 与 A/B 两份纯文本列表在 `assets/words/`;`official.json` 的 `cet4/cet6` 须保持 PDF 原始顺序与印刷形态（变体 / 上标 / 可选字母 / 短语），归一化只在运行时 `officialForms` 做，不写回数组。改提取须重核 §2.7 方法与两份 txt 行数（A 6,632 / B 1,264）;改对比口径同步更新本文档 §3 与 README「考纲对比」。
8. **加词典源 / 改合并口径**：内置源加在 `dictionary.js PROVIDERS` 并同步 `store.js DICT_BUILTIN`、`app.js DICT_MARKS/DICT_PROVIDER_BLURB`;新增返回格式要同时进 `DICT_FORMATS`、`normalizeFor` 与添加弹层的下拉。改合并去重口径须复核 `mergeRecords` 的条数上限（义项 10/组、词性组 12、音频 4、考试标签 8、词组 10、词形 10）与 `sig` 失效逻辑，并同步更新本文档 §5.1 与 [FEATURES.md §5.2](FEATURES.md)。**新增任何需要 Key 的源，Key 必须走 `dict.keys[id]`**，否则不会被 `sealKeys` 加密、也不会被备份剔除。
9. **改真题词频 / 选词填空数据**：源 CSV 与选项库 JSON 在 `assets/words/`，改数据改构建脚本后**按序**重跑 `npm run data:frequency && npm run data:cloze`（§2.6）。
   - 改词形归并口径只改 [scripts/lib/lemma.js](../scripts/lib/lemma.js)（两条管线共用），改完须复核 `stats` 的 `unmatched` 是否异常上升，并抽查 `.scratch/frequency-forms.json` 的归属;**放宽后缀规则务必带词性闸门**，否则会把无关词头的频次算进来。
   - 改词性判定只改 `formPos`（§2.9）;改牌组定义须同步 `POS_GROUPS` / `decks` 与 [FEATURES.md §3.4](FEATURES.md)，牌组 id 会直接变成主题 id `cloze_<id>`。
   - **新增内置 JSON 必须同时改三处加载点**：[platform.js:123](../app/js/platform.js#L123) 的 `names`、[main.js:342-360](../main.js#L342-L360) 的 `get-dataset`、以及本文档 §2.1 清单;漏改会让该平台静默拿到 `null`。真题分片（§2.10）走独立的 `loadExamShard` / `get-exam-shard` 懒加载通道，manifest 进启动加载、分片不进。
   - 运行时**不得**用词库通用 `fr` 重排真题牌组或词频书（会破坏「高频优先」的教学顺序）;词卡上 `examFreq` 的归并值与词形自身值必须分开表述。