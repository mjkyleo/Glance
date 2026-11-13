# Glance · 词根背单词

以**词根助记**和**词性详解**为核心的英语词汇学习应用。同一套 Web 核心同时运行在 **Windows（Electron）** 与 **Android（Capacitor）**，界面简洁、离线可用、数据可迁移。

[![Android Build](https://github.com/mjkyleo/Glance/actions/workflows/android-build.yml/badge.svg)](https://github.com/mjkyleo/Glance/actions/workflows/android-build.yml)
[![Latest Release](https://img.shields.io/github/v/release/mjkyleo/Glance)](https://github.com/mjkyleo/Glance/releases/latest)

**[下载最新版本](https://github.com/mjkyleo/Glance/releases/latest)**

---

## 功能

**记得住**
- FSRS-6 自适应记忆调度：按你的遗忘节奏安排复习，使用越多越贴合个人记忆曲线。
- 词根分解 + 词缀导航 + 词根家族：把同根词放在一起记。
- 结构化词性详解（及物/不及物等全称、分组义项）与离线助记钩子。
- 四六级/考研/托福/GRE 等考试标签，以及可选的大模型深度讲解。

**学得进**
- 29 个专项主题（动物、家居、动作、经济、科技、自然、中国文化等），支持整主题专项学习。
- 测试中心：六种范围（词书 / 专项 / 生词本 / 错题本 / 到期 / 混合）、三种题型（英选中 / 中选英 / 例句填空）与自动难度，抽题不重复、同根词不连续、同题型不连出三题；详见 [测试中心](#测试中心)。
- 学习页内容自由组合：音标、释义、构词解析、助记、英文释义、例句、词根家族、近义词、派生词、词形变化、词源逐项开关，并可拖动或按箭头调整上下顺序；会话进度以柔和进度条呈现。
- 每日新词/复习计划、打卡日历、掌握分布、正确率与学习时长统计。

**顺手用**
- 8 套主题不只是换色：每套都按对应设计语言重排字体、字重、行距、圆角、描边/阴影、留白密度、控件高度、底栏形态与动效，并各自适配浅色/深色模式。
- 背景图片：「设置 → 外观」可上传一张图片作为应用底色，像聊天背景或手机壁纸；支持蒙版浓度与模糊调节，压缩后仅保存在本机，详见 [背景图片](#背景图片)。
- 设置按功能分类：学习、外观、发音、词书、词典、AI 解释、数据，不再堆在长列表里。
- 底部「我的」集中管理学习统计、词书与计划、AI 解释库、数据备份与设置。
- 查词、查词历史、生词本分组；每个词自动记录**查看次数**，统计页可看高频接触词与掌握状态。
- 内置外部词典：免费词典开箱即用，可切换 Merriam-Webster 或自定义端点；结果按词缓存，离线可看。
- 真人发音优先，缺失时回退系统 TTS；支持语速与口音设置。
- 学习数据可导出为通用 JSON、再导入恢复，换机或外部分析都方便。

## 截图

| 学习 | 我的 |
| --- | --- |
| <img src="docs/screenshots/study.png" width="280" alt="学习页" /> | <img src="docs/screenshots/me.png" width="280" alt="我的" /> |

| 专项分类 | 学习统计 |
| --- | --- |
| <img src="docs/screenshots/themes.png" width="280" alt="专项分类" /> | <img src="docs/screenshots/stats.png" width="280" alt="学习统计" /> |

| 分类设置 | 词典 |
| --- | --- |
| <img src="docs/screenshots/settings.png" width="280" alt="设置分类与主题风格" /> | <img src="docs/screenshots/dictionary.png" width="280" alt="词典卡片" /> |

| 纸白主题 | 樱粉主题 |
| --- | --- |
| <img src="docs/screenshots/theme-paper.png" width="280" alt="纸白主题" /> | <img src="docs/screenshots/theme-sakura.png" width="280" alt="樱粉主题" /> |

| 暮紫主题 | 词书与计划 |
| --- | --- |
| <img src="docs/screenshots/theme-violet.png" width="280" alt="暮紫主题" /> | <img src="docs/screenshots/books.png" width="280" alt="词书与每日计划" /> |

| 面板排序 | 按顺序展示 |
| --- | --- |
| <img src="docs/screenshots/panel-order.png" width="280" alt="学习面板拖动或箭头排序" /> | <img src="docs/screenshots/study-order.png" width="280" alt="学习页按自定义顺序展示" /> |

| 测试设置 | 例句填空 |
| --- | --- |
| <img src="docs/screenshots/quiz-start.png" width="280" alt="测试范围、题量、题型与难度设置" /> | <img src="docs/screenshots/quiz-session.png" width="280" alt="例句填空题与判分反馈" /> |

| 背景图片 |
| --- |
| <img src="docs/screenshots/background.png" width="280" alt="上传壁纸作为应用底色" /> |

## 测试中心

学习页顶部切到「测试」，或从「设置 → 学习 → 测试」进入。组卷、难度与干扰项逻辑都在独立引擎 `app/js/quiz.js` 中完成，界面只负责展示。

### 组卷设置

| 项目 | 可选值 | 说明 |
| --- | --- | --- |
| 测试范围 | 当前词书 / 当前专项 / 生词本 / 错题本 / 到期复习 / 全部混合 | 「当前专项」可再指定 29 个主题之一；范围决定候选词池 |
| 题目数量 | 5 / 10 / 20（默认 10） | 可用题量不足时会提示，可缩小范围或减少题数 |
| 题型 | 英选中 / 中选英 / 例句填空（可多选，默认三种混合） | 某题型无可用题目时自动回退到其他题型 |
| 难度 | 自动 / 简单 / 普通 / 困难 | 自动模式结合历史正确率与 FSRS 状态，把目标正确率保持在约 70–85% |
| 联网补充例句 | 开 / 关（默认开） | 本地没有例句时联网获取并缓存；离线或失败自动回退 |

开始前会显示预计可用题量、各题型覆盖数和需要联网补充例句的词数；预计为 0 时无法开始。

### 抽题规则

- 同一轮测试不重复出现同一个单词；同一词根家族连续不超过 2 题；连续同题型不超过 2 题（不会出现三连）。
- 基础权重：到期复习 > 错题 > 收藏与低掌握 > 当前词书/专项新词 > 已掌握（少量保留）；近期频繁接触的词会被降权。
- 综合得分为「基础权重 × 难度匹配 × 词根覆盖加成 × 新鲜度加成 − 近期曝光惩罚 − 重复词/同根连出惩罚」，再按得分加权随机，避免总是抽到同几个词。
- 干扰项优先同词性，并尽量匹配同词根、同主题、同考试标签和相近难度；合格选项不足 4 个时直接跳过该词。

### 三种题型

| 题型 | 题干 | 选项 |
| --- | --- | --- |
| 英选中 | 显示英文单词与音标 | 4 个中文释义，正确项为首要释义；排除近义、包含关系与反义项 |
| 中选英 | 显示中文释义 | 4 个英文单词，先按同词性硬过滤，再按同词根、同主题、考试标签、拼写与长度相似度排序，从前 8–12 个候选中加权抽 3 个 |
| 例句填空 | 挖空的双语例句 | 4 个同词性、同形态的单词；优先使用本地例句，缺少时按设置联网获取并缓存；上下文不足、答案不唯一或干扰项不够时更换题目，**不会伪造例句** |

### 作答与结果

- 选择后立即判分：标出正确项，并显示单词、音标与词根；答错的词自动进入错题本和「错题」收藏分组。
- 一轮结束后显示正确率、错题清单，可「再测一次」或「调整设置」。
- 支持键盘操作：`1`–`4` 选择选项，`Enter` 开始/下一题，`S` 朗读。

## 主题设计

八套主题沿用同一套信息架构与交互，只替换设计语言。切换主题会连同排版、形状、层次、密度和动效一起变化：

| 主题 | 设计取法 | 主要差异 |
| --- | --- | --- |
| 天蓝 | Apple | 大留白、克制阴影、紧凑圆角、约 200ms 微反馈 |
| 抹茶 | Japanese Fresh | 1px 细描边、轻字重、1.8 行距、宽字距、无阴影 |
| 暖陶 | Warm Dashboard | 暖色底、24px 大圆角、弥散暖影、悬浮底栏、悬停上浮 |
| 雾灰 | Scandinavian | 细线分隔、小圆角、极轻字重、低对比慢过渡 |
| 墨黑 | Monochrome | 直角、黑白高对比、大写标签、粗标题配细正文 |
| 纸白 | Notion | 衬线标题、纸张颗粒底、文档式左对齐、仅颜色过渡 |
| 樱粉 | Korean Minimal | 柔粉光晕、大圆角、轻字重、悬浮底栏 |
| 暮紫 | Soft UI | 无硬边框、柔和靛紫投影、大圆角、轻微上浮 |

## 背景图片

在「我的 → 设置 → 外观 → 背景图片」选择一张本地图片，即可把它设为整个应用的底层背景，效果类似聊天背景或手机壁纸。

- 所有页面、弹层和底部导航共用同一张背景，切换主题或深浅色时自动叠加当前主题的底色与文字配色。
- 上传时自动压缩：最长边缩到 1440px，JPEG 质量从 0.85 逐级下调并按需缩小尺寸，控制在约 48 万字符以内，避免占满本地存储。
- 「蒙版浓度」（0–80%）控制主题底色覆盖强度，保证卡片与文字清晰；「模糊」（0–16px）让背景更柔和。
- 点「移除背景」恢复纯色底，蒙版与模糊设置会保留，方便下次换图。
- 图片只保存在本机，不写入导出备份；备份只携带蒙版与模糊值，导入时也不会覆盖本机图片。

## 安装

**Windows**：从 [Releases](https://github.com/mjkyleo/Glance/releases/latest) 下载 `glance-setup-*.exe` 安装。应用未做代码签名，SmartScreen 提示时选择「更多信息 → 仍要运行」。

**Android**：从 [Releases](https://github.com/mjkyleo/Glance/releases/latest) 下载 `Glance-android.apk`，允许「安装未知应用」后安装。APK 由 GitHub Actions 自动构建。

> 从旧版本升级（包名相同但签名不同）：先在「设置 → 数据」导出备份，再卸载旧版，安装新 APK 后导入即可。此后新版本可直接覆盖安装，无需再卸载。

**macOS**：仓库保留了 electron-builder 的 mac 配置，可自行构建，暂未提供签名安装包。

## 使用

1. **学习**：首页按每日计划推送新词与到期复习；认识 / 模糊 / 忘记三档评分会更新记忆状态。学习页展示哪些信息、以什么顺序展示，可在「我的 → 设置 → 学习」随时调整。
2. **专项**：底部「专项」选择主题，查看词表后点「专项学习」集中攻克一类词。
3. **测试**：顶部切换到「测试」，选择范围、题量与题型，难度保持「自动」即可；开始前会显示预计可用题量，题量不足时提示缩小范围。答题后立即判分并显示正确答案与词根，答错的词会进入错题本。完整规则见 [测试中心](#测试中心)。
4. **查词**：底部「查词」搜索单词、词根或词缀；打开词卡可看词性详解、助记、词根家族、外部词典与 AI 讲解。
5. **词典**：词卡内点「查询词典」按当前服务商检索，结果自动缓存；在「设置 → 词典」切换服务商。
6. **我的**：底部「我的」查看今日进度、连续打卡与掌握数，进入学习统计、词书与计划、AI 解释库、数据备份或完整设置。
7. **外观**：「设置 → 外观」切换天蓝 / 抹茶 / 暖陶 / 雾灰 / 墨黑 / 纸白 / 樱粉 / 暮紫八套主题，每套都会同步改变字体、圆角、阴影、留白与动效；同一页可上传[背景图片](#背景图片)并调节蒙版浓度与模糊，深色模式自动跟随系统。
8. **备份**：「设置 → 数据」导出全部学习数据，或导入 JSON 恢复（合并 / 覆盖两种模式）。

## 数据格式

导出文件为通用 JSON，`words` 表可直接转成 CSV 或导入其他工具；`data` 块用于无损恢复。

```jsonc
{
  "app": "Glance",
  "kind": "learning-data",
  "schema": 1,
  "exportedAt": "2026-11-13T00:00:00.000Z",
  "summary": { "totalWords": 0, "known": 0, "learning": 0, "relearn": 0, "fresh": 0, "totalViews": 0, "daysActive": 0 },
  "words": [
    {
      "word": "abandon", "state": "learning", "box": 3, "due": "2026-11-14T00:00:00.000Z",
      "reps": 2, "lapses": 1, "views": 6, "firstSeen": "2026-11-01T00:00:00.000Z",
      "lastSeen": "2026-11-13T00:00:00.000Z", "favorite": true, "favoriteGroup": "默认", "errors": 0
    }
  ],
  "data": { "srs": {}, "logs": {}, "views": {}, "favorites": {}, "history": [], "errors": {}, "aiCache": {}, "dictCache": {}, "settings": {} }
}
```

- `state`：`new` / `learning` / `relearn` / `known`。
- 导出默认**剔除 API Key**（`ai.key`、`dict.key`），导入覆盖模式也会保留本机 Key。
- `data.quiz` 保存测试配置与自适应能力值，`data.quizExamples` 缓存例句题用到的双语例句，换机后可继续使用；`data.settings.background` 只记录蒙版与模糊，背景图片本身**不导出**，避免备份文件过大并保护隐私。
- 导入时优先使用 `data` 块无损恢复；仅含 `words` 表的文件会尽力重建进度。合并模式不会覆盖本机测试偏好，覆盖模式才会重置。

## 外部词典

| 服务商 | 地址 | Key |
| --- | --- | --- |
| 中英词典（默认，有道源） | `https://dict.youdao.com/jsonapi?q={word}` | 不需要 |
| 免费英文词典 | `https://api.dictionaryapi.dev/api/v2/entries/en/{word}` | 不需要 |
| Merriam-Webster | `https://dictionaryapi.com/api/v3/references/collegiate/json/{word}?key={key}` | 需在 dictionaryapi.com 免费申请 |
| 自定义端点 | 任意返回 JSON 的地址，用 `{word}` 占位 | 可选，默认以 `Bearer` 发送 |

有道源提供中文释义、美/英双音标、双语例句、考试标签与词根助记，支持英文单词、短语（如 `take off`）和中译英（如 `苹果`）。查询结果按词缓存在本地，同一单词不会重复联网。

> 有道接口不校验 Key，但会拒绝带 `Origin` 头的浏览器请求；Windows/Android 端走原生网络通道不受影响，纯浏览器预览会自动回退到免费英文词典。

## 构建

**Windows（Electron）**

```bash
npm install
npm start          # 开发运行（自动处理无沙箱回退）
npm run build      # electron-builder 生成安装包
```

**Android（Capacitor + GitHub Actions）**

```bash
npm install
npx cap sync android
```

推送 `main` 后，[android-build.yml](.github/workflows/android-build.yml) 会自动构建 APK 并发布到 Releases。Release 标题取自本次构建提交的实际改动，正文列出上一次发布以来的功能变更。

## 目录结构

```
app/                共享 Web 核心（Electron / Android / 浏览器）
  index.html
  css/
  js/               platform / store / srs / library / themes / quiz / ai / dictionary / app
  data/             索引化词库（words / exams / roots / affixes / meta）
main.js             Electron 主进程（窗口、IPC、网络通道、文件对话框）
android/            Capacitor Android 工程
docs/screenshots/   README 截图
scripts/            词库构建与开发启动脚本
DEVELOPMENT.md      开发清单与详细变更记录
```

## 文档

开发进度、逐项实现与验证记录见 [DEVELOPMENT.md](DEVELOPMENT.md)；Logo 图形、图标安全区与启动页规范见 [docs/LOGO-SPEC.md](docs/LOGO-SPEC.md)。

## License

ISC
