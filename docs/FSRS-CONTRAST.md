# Glance FSRS-6 对照验证报告（自研 vs ts-fsrs 6）

> 旁路验证，**不替换在用调度器、零用户数据风险**。生成时间 2026-11-14T04:41:15.899Z。
> 参考实现：ts-fsrs 6.0.0 `FSRS6Algorithm`（vendor 于 [app/js/vendor/ts-fsrs.js](../app/js/vendor/ts-fsrs.js)，由 [scripts/vendor-ts-fsrs.mjs](../scripts/vendor-ts-fsrs.mjs) 打包）。
> 自研实现：[app/js/srs.js](../app/js/srs.js)。对照引擎：[app/dev/srs-contrast.js](../app/dev/srs-contrast.js)。
> 复现：`npm run vendor:fsrs && npm run contrast:fsrs`；浏览器：`app/dev/fsrs-contrast.html`。

## 1. 口径

- 模型对模型：**FSRS-6 vs FSRS-6**，相同 21 权重（一致：true），decay=0.1542。
- 评分映射：自研 {forgot:1, fuzzy:2, know:3} ↔ ts-fsrs {Again:1, Hard:2, Good:3}（无 Easy）。
- 确定性：interval 对照时以 `Math.random()=0.5` 关闭自研 ±5% fuzz（参考算法层本无 fuzz）。
- 判定：rel<1e-6 且 abs<1e-6 = match；rel<1e-4 = precision（参考逐步 roundTo 8 位所致）；其余 = **deviation**。
- 随机序列：seed=20261114，300 段 × 14 步，整数 elapsed 天（避开短期触发歧义）。

## 2. 方法级网格对照

### retrievability（遗忘曲线）

n=72 · match=72 · precision=0 · **deviation=0** · maxAbs=5.427e-9 · maxRel=9.011e-9

_无偏差样本。_

### initDS · 初始稳定度 S

n=3 · match=3 · precision=0 · **deviation=0** · maxAbs=0.000e+0 · maxRel=0.000e+0

_无偏差样本。_

### initDS · 初始难度 D

n=3 · match=3 · precision=0 · **deviation=0** · maxAbs=4.399e-9 · maxRel=8.605e-10

_无偏差样本。_

### nextD（难度更新）

n=15 · match=15 · precision=0 · **deviation=0** · maxAbs=9.297e-9 · maxRel=1.395e-9

_无偏差样本。_

### nextS · recall（g≥2，跨日）

n=540 · match=413 · precision=127 · **deviation=0** · maxAbs=3.210e-5 · maxRel=9.069e-8

_无偏差样本。_

### nextS · forget（g=1，跨日，含上限）

n=270 · match=270 · precision=0 · **deviation=0** · maxAbs=3.958e-8 · maxRel=3.400e-8

_无偏差样本。_

### nextS · short-term（同日）

n=27 · match=27 · precision=0 · **deviation=0** · maxAbs=4.789e-9 · maxRel=3.467e-8

_无偏差样本。_

### interval（目标 retention 0.9，fuzz 关）

n=9 · match=9 · precision=0 · **deviation=0** · maxAbs=0.000e+0 · maxRel=0.000e+0

_无偏差样本。_


## 3. migrate() 探针（FSRS 状态保真）

输入已含 FSRS 状态 `S=24.4728247, D=4.99022837, box=4`：

- 输出 `S=24.4728247, D=4.99022837`
- 是否保留：**是（连续稳定度未被 box 覆盖）**

`migrate()`（[srs.js:76-83](../app/js/srs.js#L76-L83)）已加保真守卫：含有效 S/D 的状态原样返回，仅 legacy（无 S/D）状态按 box 升级。连续 FSRS 稳定度得以保留。

## 4. 整段复习序列对照

4200 步：S 偏离 **0** 步、D 偏离 **0** 步；max|ΔS|=0.0000、max|ΔD|=0.0000。

_无偏离样本。_

## 5. 短期稳定度触发阈值探针

| elapsed(天) | 自研 S | 参考 S | |ΔS| | 自研分支 | 参考分支 |
|---|---|---|---|---|---|
| 0 | 5 | 5 | 0.000e+0 | short-term | short-term |
| 0.25 | 5 | 5.875675 | 8.757e-1 | short-term | recall |
| 0.5 | 5 | 6.710091 | 1.710e+0 | short-term | recall |
| 0.9 | 5 | 7.968220 | 2.968e+0 | short-term | recall |
| 1 | 8.269204 | 8.269204 | 5.876e-8 | recall | recall |
| 2 | 11.025184 | 11.025184 | 7.615e-9 | recall | recall |

自研 `sameDay = elapsed<1`（24h 滚动窗）；参考 `t===0`（同日）。`0<elapsed<1` 时分支不同。

## 6. 结论与修复建议

- **[LOW] 短期稳定度触发阈值不同（elapsed<1 vs t===0）**（`short-term-trigger`）
  - 自研用 elapsed<1（24h 滚动窗）判短期；参考用 elapsed_days===0（同日）。0<elapsed<1 时分支不同，3 个探针出现差异。
  - 建议：设计取舍：Glance 以毫秒分数计算 elapsed，<1 近似同日。可保留并注明，或对齐为同日判定。
- **[INFO] 核心公式与参考实现一致**（`core-formulas-match`）
  - retrievability / initDS / nextD / nextS(recall·forget·short-term) / interval 在网格输入下全部匹配（差异≤精度级）。自研 FSRS-6 数学忠实。
  - 建议：核心公式无需改动；migrate 保真守卫与稳定度边界（sMin/sMax）已对齐参考实现。

## 7. 维护约定

- 本报告为**生成物**，改 `srs.js` 公式或 ts-fsrs 版本后须重跑 `npm run contrast:fsrs` 刷新。
- 对照旁路仅用于验证；**不得**据此直接替换在用调度器（迁移需另行评估用户数据兼容性）。
- vendor 文件由 `npm run vendor:fsrs` 再生，不手改。
