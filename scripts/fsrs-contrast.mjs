// Node runner for the FSRS-6 contrast side-path.
// Loads self-developed srs.js + vendored ts-fsrs 6, runs the contrast, prints a summary
// and writes docs/FSRS-CONTRAST.md. DEV/verification only — no scheduler replacement.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Load browser-global scripts into this context.
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(root, 'app/js/srs.js'), 'utf8'), { filename: 'srs.js' });
vm.runInThisContext(fs.readFileSync(path.join(root, 'app/js/vendor/ts-fsrs.js'), 'utf8'), { filename: 'ts-fsrs.js' });
const SRS = global.SRS;
const TSFSRS = global.TSFSRS;
const { runContrast } = require('../app/dev/srs-contrast.js');

const opts = {
  seed: Number(process.env.SEED || 20261114),
  sequences: Number(process.env.SEQS || 300),
  stepsPerSeq: Number(process.env.STEPS || 14)
};
const report = runContrast(SRS, TSFSRS, opts);

// ---- console summary ----
console.log('==== FSRS-6 contrast (self-developed vs ts-fsrs 6) ====');
console.log('weights identical:', report.meta.weightsIdentical, '| decay:', report.meta.selfDecay);
console.log('\n-- method grid (n / match / precision / DEVIATION / maxAbs) --');
for (const [k, b] of Object.entries(report.methods)) {
  console.log(`${k.padEnd(18)} ${String(b.n).padStart(5)} / ${String(b.match).padStart(5)} / ${String(b.precision).padStart(4)} / ${String(b.deviation).padStart(4)} / ${b.maxAbs.toExponential(3)}`);
}
console.log('\n-- migrate() probe --');
console.log(JSON.stringify(report.migrateProbe));
console.log('\n-- integrated sequences --');
const it = report.integrated;
console.log(`steps=${it.steps} devS=${it.devS} devD=${it.devD} maxAbsS=${it.maxAbsS.toFixed(4)} maxAbsD=${it.maxAbsD.toFixed(4)}`);
console.log('\n-- short-term trigger probe --');
for (const p of report.triggerProbe) console.log(`elapsed=${p.elapsed} selfS=${p.selfS.toFixed(4)} refS=${p.refS.toFixed(4)} |Δ|=${p.absS.toExponential(3)} [self:${p.selfBranch} ref:${p.refBranch}]`);
console.log('\n-- findings --');
for (const f of report.findings) console.log(`[${f.severity.toUpperCase()}] ${f.id}: ${f.title}`);

// ---- markdown report ----
function mdTableMethod(name, b) {
  const rows = b.worst.map(x => `| ${JSON.stringify(x.ctx)} | ${fmt(x.self)} | ${fmt(x.ref)} | ${x.abs.toExponential(3)} | ${x.status} |`).join('\n');
  return `### ${name}\n\nn=${b.n} · match=${b.match} · precision=${b.precision} · **deviation=${b.deviation}** · maxAbs=${b.maxAbs.toExponential(3)} · maxRel=${b.maxRel.toExponential(3)}\n` +
    (rows ? `\n| 输入 | 自研 | 参考 | abs | 判定 |\n|---|---|---|---|---|\n${rows}\n` : '\n_无偏差样本。_\n');
}
function fmt(x) { return typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(6)) : String(x); }

const m = report.methods;
const it2 = report.integrated;
const md = `# Glance FSRS-6 对照验证报告（自研 vs ts-fsrs 6）

> 旁路验证，**不替换在用调度器、零用户数据风险**。生成时间 ${report.meta.generatedAt}。
> 参考实现：ts-fsrs 6.0.0 \`FSRS6Algorithm\`（vendor 于 [app/js/vendor/ts-fsrs.js](../app/js/vendor/ts-fsrs.js)，由 [scripts/vendor-ts-fsrs.mjs](../scripts/vendor-ts-fsrs.mjs) 打包）。
> 自研实现：[app/js/srs.js](../app/js/srs.js)。对照引擎：[app/dev/srs-contrast.js](../app/dev/srs-contrast.js)。
> 复现：\`npm run vendor:fsrs && npm run contrast:fsrs\`；浏览器：\`app/dev/fsrs-contrast.html\`。

## 1. 口径

- 模型对模型：**FSRS-6 vs FSRS-6**，相同 21 权重（一致：${report.meta.weightsIdentical}），decay=${report.meta.selfDecay}。
- 评分映射：自研 {forgot:1, fuzzy:2, know:3} ↔ ts-fsrs {Again:1, Hard:2, Good:3}（无 Easy）。
- 确定性：interval 对照时以 \`Math.random()=0.5\` 关闭自研 ±5% fuzz（参考算法层本无 fuzz）。
- 判定：rel<1e-6 且 abs<1e-6 = match；rel<1e-4 = precision（参考逐步 roundTo 8 位所致）；其余 = **deviation**。
- 随机序列：seed=${report.meta.seed}，${report.meta.sequences} 段 × ${report.meta.stepsPerSeq} 步，整数 elapsed 天（避开短期触发歧义）。

## 2. 方法级网格对照

${mdTableMethod('retrievability（遗忘曲线）', m.retrievability)}
${mdTableMethod('initDS · 初始稳定度 S', m.initDS_S)}
${mdTableMethod('initDS · 初始难度 D', m.initDS_D)}
${mdTableMethod('nextD（难度更新）', m.nextD)}
${mdTableMethod('nextS · recall（g≥2，跨日）', m.nextS_recall)}
${mdTableMethod('nextS · forget（g=1，跨日，含上限）', m.nextS_forget)}
${mdTableMethod('nextS · short-term（同日）', m.nextS_shortTerm)}
${mdTableMethod('interval（目标 retention 0.9，fuzz 关）', m.interval)}

## 3. migrate() 探针（FSRS 状态保真）

输入已含 FSRS 状态 \`S=${report.migrateProbe.input.S}, D=${report.migrateProbe.input.D}, box=${report.migrateProbe.input.box}\`：

- 输出 \`S=${report.migrateProbe.output.S}, D=${report.migrateProbe.output.D}\`
- 是否保留：**${report.migrateProbe.preserved ? '是（连续稳定度未被 box 覆盖）' : '否（被 box 覆盖 —— 核心 bug）'}**

${report.migrateProbe.clobbered
  ? '`migrate()`（[srs.js:76-83](../app/js/srs.js#L76-L83)）在每次非首复习经 [srs.js:90](../app/js/srs.js#L90) 调用，无条件以 `INTERVALS[box]` 重置 S/D，使连续 FSRS 稳定度退化为粗粒度 Leitner 近似。**需修复**：仅在缺少 S/D 时升级 legacy 状态。'
  : '`migrate()`（[srs.js:76-83](../app/js/srs.js#L76-L83)）已加保真守卫：含有效 S/D 的状态原样返回，仅 legacy（无 S/D）状态按 box 升级。连续 FSRS 稳定度得以保留。'}

## 4. 整段复习序列对照

${it2.steps} 步：S 偏离 **${it2.devS}** 步、D 偏离 **${it2.devD}** 步；max|ΔS|=${it2.maxAbsS.toFixed(4)}、max|ΔD|=${it2.maxAbsD.toFixed(4)}。

${it2.worst.length ? '| 段 | 步 | elapsed | g | 自研 S | 参考 S | 自研 D | 参考 D | |ΔS| |\n|---|---|---|---|---|---|---|---|---|\n' + it2.worst.map(x => `| ${x.seq} | ${x.step} | ${x.elapsed} | ${x.g} | ${fmt(x.selfS)} | ${fmt(x.refS)} | ${fmt(x.selfD)} | ${fmt(x.refD)} | ${x.absS.toExponential(3)} |`).join('\n') : '_无偏离样本。_'}

## 5. 短期稳定度触发阈值探针

| elapsed(天) | 自研 S | 参考 S | |ΔS| | 自研分支 | 参考分支 |
|---|---|---|---|---|---|
${report.triggerProbe.map(p => `| ${p.elapsed} | ${fmt(p.selfS)} | ${fmt(p.refS)} | ${p.absS.toExponential(3)} | ${p.selfBranch} | ${p.refBranch} |`).join('\n')}

自研 \`sameDay = elapsed<1\`（24h 滚动窗）；参考 \`t===0\`（同日）。\`0<elapsed<1\` 时分支不同。

## 6. 结论与修复建议

${report.findings.map(f => `- **[${f.severity.toUpperCase()}] ${f.title}**（\`${f.id}\`）\n  - ${f.detail}\n  - 建议：${f.recommendation}`).join('\n')}

## 7. 维护约定

- 本报告为**生成物**，改 \`srs.js\` 公式或 ts-fsrs 版本后须重跑 \`npm run contrast:fsrs\` 刷新。
- 对照旁路仅用于验证；**不得**据此直接替换在用调度器（迁移需另行评估用户数据兼容性）。
- vendor 文件由 \`npm run vendor:fsrs\` 再生，不手改。
`;

const outDir = path.join(root, 'docs');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'FSRS-CONTRAST.md');
fs.writeFileSync(outFile, md, 'utf8');
fs.writeFileSync(path.join(root, '.scratch/fsrs-contrast.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('\nreport →', path.relative(root, outFile));
console.log('json   → .scratch/fsrs-contrast.json');