# 补充字读音与词语说明

核验日期：2026-11-06。

本次补充字是旧版小学教材附录中已有、当前混合版次字库中缺少的 58 字。原书来源为[深圳市福田区荔园外国语教育集团公开教材存档](https://lywgyxx.szftedu.cn/xkjc/yw/)，具体 PDF、哈希、页码与课次保存在 `supplemental-source.json`。版本差集依据见 `research/audit-latest/audit-report.md` 与 `old-baseline-comparison.json`。这些是有原书出处的版本差异补充，不表示某册最新版官方生字表。

## 本次改动与核验结果

- 58 个所选读音全部来自原书识字表；独立使用 pypdf 读取对应字后的原拼音编码，与 `supplemental-source.json.readings` 逐字交叉，差异为 0。
- `pronunciation-contexts.json` 新增 57 个汉字键；“逮”的 `dǎi → 逮住`、`dài → 逮捕` 已存在，完全沿用。原有 2,985 个键及其全部词语逐项 JSON 比较完全一致。
- 合并原 12 册和补充册，全部 3,192 个教材字音均有包含目标字的语境；缺项、非法单字读音均为 0。
- 按“目标字拼音 + 将目标字所有出现位置替换为 □ 后的文字”检查上述全部教材字音，冲突为 0。
- 58 个补充词语中目标字的 pinyin-pro 整词推断读音与教材选定音一致，差异为 0。
- 新总量为 3,042 个语境汉字、3,329 个字音语境。总量包含少量原有常用多音扩展字，与应用去重学习字数不是同一个指标。

本次选词以常见、短小、挖空后能区分同音字为原则；这些词语是练习语境，并非全部来自教材原句。通用拼音库只作诊断，教材注音与人工语义核验为准。没有把其他合法读音作为错误读音；选择题仍应排除该字其他合法读音。

## 易混读音和语境

- **仇 chóu → 仇敌**：与姓氏音 qiú 区分。曾考虑“报仇”，但它与原有“酬 chóu → 报酬”挖空后同为“报□”，因此选“仇敌”，原有“酬”条目保持不动。[词语核验](https://zdic.net/hans/仇敌)
- **吱 zhī → 吱呀**：符合教材声音语境；没有使用易读作 zī 的“吱声”。[字音核验](https://zdic.net/hans/吱)
- **呛 qiàng → 烟呛人**：是烟气刺激的意思，与饮水进入气管的 qiāng 用法区别。[字义、字音核验](https://zdic.net/hans/呛)
- **咖 kā → 咖啡、喳 zhā → 叽叽喳喳、嘀 dí → 嘀咕**：沿用教材所选读音，未改为这些字的其他读法。嘀咕中的“嘀”是第二声。[嘀咕核验](https://dict.concised.moe.edu.tw/dictView.jsp?ID=8321&la=0&powerMode=0)
- **唧 jī → 唧唧叫**：采用细碎虫鸣的语境；挖空时须隐藏两个“唧”。[字义核验](https://zdic.net/hans/唧)
- **瑰 guī → 瑰宝**：避开“玫瑰”在语流中的轻声情况。[词语核验](https://zdic.net/hans/瑰宝)
- **绦 tāo → 丝绦**：与教材《咏柳》的用字相合，不误作“条”。[字音核验](https://zdic.net/hans/绦)
- **逮 dǎi → 逮住**：保留本次教材音；原有 dài → 逮捕 也继续保留。“秤”本次选择原书 chèng → 杆秤。

这里核验的是文本语境和目标字读音；音频生成与复听由主构建流程另行处理，不声称逐条音频已经人工听审。

## 本次 58 字所选语境

| 字 | 教材所选音 | 练习语境 |
|---|---|---|
| 仇 | chóu | 仇敌 |
| 凰 | huáng | 凤凰 |
| 君 | jūn | 君子 |
| 吱 | zhī | 吱呀 |
| 呕 | ǒu | 呕吐 |
| 呛 | qiàng | 烟呛人 |
| 咖 | kā | 咖啡 |
| 唧 | jī | 唧唧叫 |
| 啡 | fēi | 咖啡 |
| 喳 | zhā | 叽叽喳喳 |
| 嘀 | dí | 嘀咕 |
| 婶 | shěn | 婶母 |
| 孝 | xiào | 孝心 |
| 屁 | pì | 放屁 |
| 屎 | shǐ | 鸟屎 |
| 屠 | tú | 屠夫 |
| 廊 | láng | 走廊 |
| 懦 | nuò | 懦弱 |
| 曼 | màn | 轻歌曼舞 |
| 档 | dàng | 档案 |
| 椰 | yē | 椰子 |
| 橱 | chú | 橱窗 |
| 残 | cán | 残缺 |
| 毽 | jiàn | 踢毽子 |
| 淌 | tǎng | 流淌 |
| 瑰 | guī | 瑰宝 |
| 畅 | chàng | 欢畅 |
| 础 | chǔ | 基础 |
| 秤 | chèng | 杆秤 |
| 秧 | yāng | 秧苗 |
| 窑 | yáo | 窑洞 |
| 篇 | piān | 篇章 |
| 糙 | cāo | 粗糙 |
| 绦 | tāo | 丝绦 |
| 绪 | xù | 情绪 |
| 缆 | lǎn | 缆车 |
| 缭 | liáo | 缭绕 |
| 羚 | líng | 羚羊 |
| 股 | gǔ | 一股风 |
| 艳 | yàn | 鲜艳 |
| 苏 | sū | 苏醒 |
| 董 | dǒng | 董事长 |
| 蔷 | qiáng | 蔷薇 |
| 蕉 | jiāo | 香蕉 |
| 薇 | wēi | 蔷薇 |
| 蚜 | yá | 蚜虫 |
| 蛾 | é | 飞蛾 |
| 评 | píng | 评语 |
| 谦 | qiān | 谦虚 |
| 蹈 | dǎo | 舞蹈 |
| 辰 | chén | 星辰 |
| 锯 | jù | 锯齿 |
| 陀 | tuó | 陀螺 |
| 驳 | bó | 反驳 |
| 骂 | mà | 责骂 |
| 鬼 | guǐ | 鬼脸 |
| 鹂 | lí | 黄鹂 |
| 逮 | dǎi | 逮住 |

## 可重复的合并检查

在仓库根目录执行以下只读命令。它同时核验原有条目未修改，以及包含补充册的语境覆盖、合法读音、整词诊断和挖空冲突。

```bash
node --input-type=module - <<'JS'
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pinyin, polyphonic } from 'pinyin-pro';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const main = read('data/curriculum-source.json');
const supplement = read('data/supplemental-source.json');
const contexts = read('data/pronunciation-contexts.json');
const old = Object.fromEntries(Object.entries(contexts)
  .filter(([c]) => c === '逮' || !supplement.orderedCharacters.includes(c)));
assert.equal(
  crypto.createHash('sha256').update(JSON.stringify(old)).digest('hex'),
  '0c115292c51ef379cc8573a7990df8f7de6e4e992a4c5d9a0d7cc13d76ff424a',
  '本次补充前的所有语境条目必须保持原样'
);
const pairs = new Map();
for (const book of [...main.books, supplement]) {
  for (const c of book.orderedCharacters) {
    const r = book.readings[c] || pinyin(c, { toneSandhi: false });
    pairs.set(c + '|' + r, [c, r]);
  }
  for (const it of [...book.recognitionItems, ...book.writingItems]) {
    if (it.pinyin) pairs.set(it.character + '|' + it.pinyin, [it.character, it.pinyin]);
  }
}
const clues = new Map();
for (const [c, r] of pairs.values()) {
  const word = contexts[c]?.[r];
  assert(word?.includes(c), c + ' 缺少语境');
  assert(polyphonic(c, { type: 'array' })[0].includes(r), c + ' 非法读音');
  const clue = r + '|' + word.replaceAll(c, '□');
  assert(!clues.has(clue) || clues.get(clue) === c, clue + ' 同音挖空冲突');
  clues.set(clue, c);
}
for (const c of supplement.orderedCharacters) {
  const r = supplement.readings[c];
  const word = contexts[c][r];
  assert.equal(pinyin(word, { type: 'array', toneSandhi: false })[[...word].indexOf(c)], r);
}
console.log({ supplementCharacters: supplement.orderedCharacters.length,
  allTextbookCharacterReadings: pairs.size, missing: 0,
  invalid: 0, ambiguousClues: 0, supplementalPhraseDifferences: 0 });
JS
```
