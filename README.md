# Glance · 词根背单词

以**词根助记**和**词性详解**为核心的英语词汇学习应用。同一套 Web 核心同时运行在 **Windows（Electron）** 与 **Android（Capacitor）**，界面简洁、离线可用、数据可迁移。

[![Android Build](https://github.com/mjkyleo/Glance/actions/workflows/android-build.yml/badge.svg)](https://github.com/mjkyleo/Glance/actions/workflows/android-build.yml)
[![Latest Release](https://img.shields.io/github/v/release/mjkyleo/Glance)](https://github.com/mjkyleo/Glance/releases)

**[下载最新版本](https://github.com/mjkyleo/Glance/releases)**

---

## 功能

**记得住**
- FSRS-6 自适应记忆调度：按你的遗忘节奏安排复习，使用越多越贴合个人记忆曲线。
- 词根分解 + 词缀导航 + 词根家族：把同根词放在一起记。
- 结构化词性详解（及物/不及物等全称、分组义项）与离线助记钩子。
- 四六级/考研/托福/GRE 等考试标签，以及可选的大模型深度讲解。

**学得进**
- 29 个专项主题（动物、家居、动作、经济、科技、自然、中国文化等），支持整主题专项学习。
- 单词测试：同词根易混干扰项，错词自动进入生词本与错题本。
- 每日新词/复习计划、打卡日历、掌握分布、正确率与学习时长统计。

**用得上**
- 查词、查词历史、生词本分组；每个词自动记录**查看次数**，统计页可看高频接触词与掌握状态。
- 内置外部词典：免费词典开箱即用，可切换 Merriam-Webster 或自定义端点；结果按词缓存，离线可看。
- 真人发音优先，缺失时回退系统 TTS；支持语速与口音设置。
- 学习数据可导出为通用 JSON、再导入恢复，换机或外部分析都方便。

## 截图

| 学习 | 词典 |
| --- | --- |
| <img src="docs/screenshots/study.png" width="280" alt="学习页" /> | <img src="docs/screenshots/dictionary.png" width="280" alt="词典卡片" /> |

| 专项分类 | 统计 |
| --- | --- |
| <img src="docs/screenshots/themes.png" width="280" alt="专项分类" /> | <img src="docs/screenshots/stats.png" width="280" alt="学习统计" /> |

## 安装

**Windows**：从 [Releases](https://github.com/mjkyleo/Glance/releases) 下载 `glance-setup-*.exe` 安装。应用未做代码签名，SmartScreen 提示时选择「更多信息 → 仍要运行」。

**Android**：从 [Releases](https://github.com/mjkyleo/Glance/releases) 下载 `Glance-android.apk`，允许「安装未知应用」后安装。APK 由 GitHub Actions 自动构建。

**macOS**：仓库保留了 electron-builder 的 mac 配置，可自行构建，暂未提供签名安装包。

## 使用

1. **学习**：首页按每日计划推送新词与到期复习；认识 / 模糊 / 忘记三档评分会更新记忆状态。
2. **专项**：底部「专项」选择主题，查看词表后点「专项学习」集中攻克一类词。
3. **查词**：底部「查词」搜索单词、词根或词缀；打开词卡可看词性详解、助记、词根家族、外部词典与 AI 讲解。
4. **词典**：词卡内点「查询词典」按当前服务商检索，结果自动缓存；在「设置 → 外部词典」切换服务商。
5. **统计**：查看打卡、掌握分布、正确率趋势与高频接触词。
6. **备份**：「设置 → 数据」导出全部学习数据，或导入 JSON 恢复（合并 / 覆盖两种模式）。

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
- 导入时优先使用 `data` 块无损恢复；仅含 `words` 表的文件会尽力重建进度。

## 外部词典

| 服务商 | 地址 | Key |
| --- | --- | --- |
| 中英词典（有道，默认） | `https://dict.youdao.com/jsonapi?q={word}` | 不需要 |
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

推送 `main` 后，[android-build.yml](.github/workflows/android-build.yml) 会自动构建 APK 并发布到 Releases。

## 目录结构

```
app/                共享 Web 核心（Electron / Android / 浏览器）
  index.html
  css/
  js/               platform / store / srs / library / themes / ai / dictionary / app
  data/             索引化词库（words / exams / roots / affixes / meta）
main.js             Electron 主进程（窗口、IPC、网络通道、文件对话框）
android/            Capacitor Android 工程
docs/screenshots/   README 截图
scripts/            词库构建与开发启动脚本
DEVELOPMENT.md      开发清单与详细变更记录
```

## 文档

开发进度、逐项实现与验证记录见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## License

ISC
