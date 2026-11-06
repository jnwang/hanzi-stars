# 教材字库来源与核验说明

核验日期：2026-11-06。十二册数据文件：`curriculum-source.json`；独立补充课程：`supplemental-source.json`。

本字库覆盖一年级至六年级十二册的**已核验存档字表**，采用识字表与写字表的并集。每册独立去重后共 4,630 个学习字位，跨册共有 2,973 个不同汉字，每十字一关共 466 颗星。同一个字在不同册再次出现时，保留其对应学期的学习位置。

**版本限制：一至三年级使用按 2022 年课程标准修订的电子教材；四至六年级仍是修订前的统编教材存档。不能将本数据称为“全套 2026 最新教材”或“最新版小学全部生字”。** 人教社介绍了分年级使用新教材的安排，2026 年已推进至其他年级；本项目尚未取得并完整核验四至六年级的新字表。[人教社关于统编教材修订与使用的说明](https://www.pep.com.cn/xw/zt/hd/sktbjc/mtjj/202606/t20260612_2006887.html)

## 版本差异补充

旧版一年级至三年级六册从[荔园外国语小学公开存档](https://lywgyxx.szftedu.cn/xkjc/yw/)取得并按完整原书附录核对，与现有旧四至六年级组成2,996字的旧版基线。逐字比较发现原混合字库缺少其中58字，现作为独立「补充字」课程补入，共6颗星。原十二册保持不变，全部课程合计 **4,688个学习字位、3,031个不同汉字、472颗星**。

补充字的原书注音、课次、页码与PDF哈希保存在 [supplemental-source.json](supplemental-source.json)，完整差集及源集合保存在 [curriculum-coverage-baseline.json](curriculum-coverage-baseline.json)。详见 [复核报告](CURRICULUM-AUDIT.md)。这补齐已核验新旧来源的并集，未声称新版四至六年级全覆盖。

## 原始材料

文字内容来自人民教育出版社《义务教育教科书·语文》的电子教材附录，通过 [zh-lang-textbook 公开 PDF 存档](https://github.com/capric8416/zh-lang-textbook/tree/main/pdf)取得。存档是第三方镜像，不是出版社官方发布接口。这里使用原书页上的字表，不使用该仓库的 OCR 字库或应用代码。

各 PDF 的版权页有出版社、编写人员等信息，但版次、印次字段未填写，因此**无法据这些文件给出精确的第几版第几次印刷**。`editionEvidence.coverProductionDate` 是封面保留的排版文件制作日期，只用来辨别存档，不当作出版日期。`editionEvidence.copyrightEdition` 因此为 `null`。一至三年级书末说明明确记载按《义务教育语文课程标准（2022 年版）》编写修订。四至六年级存档保留修订前的编写说明与内容，故标为旧版，不擅自推断具体审定年月。

下表页码均为 **PDF 文件页码，从 1 开始**，不是书内印刷页码。新识字数不含原书用蓝色标出的已学字新增读音；合并字数包含这些条目，但同一汉字在同册只计一次。

| 册别 / 原书链接 | 版本类别 | 封面制作日期 | 识字表 PDF 页 | 写字表 PDF 页 | 印刷新识字数 | 写字数 | 合并不同字 | 星数 |
|---|---|---|---|---|---:|---:|---:|---:|
| [一年级上册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade1a-textbook.pdf) | 2022 课标修订 | 2024-08-08 | 110–112 | 113 | 280 | 100 | 280 | 28 |
| [一年级下册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade1b-textbook.pdf) | 2022 课标修订 | 2025-12-05 | 119–121 | 122–124 | 410 | 200 | 495 | 50 |
| [二年级上册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade2a-textbook.pdf) | 2022 课标修订 | 2025-07-10 | 113–117 | 118–120 | 460 | 250 | 609 | 61 |
| [二年级下册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade2b-textbook.pdf) | 2022 课标修订 | 2025-12-09 | 118–121 | 122–124 | 450 | 250 | 593 | 60 |
| [三年级上册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade3a-textbook.pdf) | 2022 课标修订 | 2025-07-09 | 114–116 | 117–118 | 250 | 250 | 428 | 43 |
| [三年级下册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade3b-textbook.pdf) | 2022 课标修订 | 2025-12-09 | 116–118 | 119–120 | 250 | 250 | 405 | 41 |
| [四年级上册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade4a-textbook.pdf) | 修订前旧版 | 2022-07-08 | 128–130 | 131–132 | 250 | 250 | 429 | 43 |
| [四年级下册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade4b-textbook.pdf) | 修订前旧版 | 2022-12-22 | 142–144 | 145–146 | 250 | 250 | 423 | 43 |
| [五年级上册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade5a-textbook.pdf) | 修订前旧版 | 2024-06-25 | 122–124 | 125–126 | 200 | 220 | 359 | 36 |
| [五年级下册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade5b-textbook.pdf) | 修订前旧版 | 2022-12-22 | 124–125 | 126–127 | 200 | 180 | 309 | 31 |
| [六年级上册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade6a-textbook.pdf) | 修订前旧版 | 2022-07-18 | 无识字表 | 135–136 | 0 | 180 | 180 | 18 |
| [六年级下册](https://github.com/capric8416/zh-lang-textbook/blob/main/pdf/zh-lang-grade6b-textbook.pdf) | 修订前旧版 | 2023-10-17 | 无识字表 | 126 | 0 | 120 | 120 | 12 |

六年级这两册原书只有写字表，因此使用写字表全部汉字；没有编造识字表。每份原始文件的 SHA-256 已保存在 JSON 的 `sources` 中，以防镜像替换后无法复现核验。

## 提取与排序

研究脚本是 `scripts/curriculum-extract.py`，依赖 `pdfplumber` 和 `pypdf`。脚本只读取上表指定的附录页，按字号、字体和坐标提取字表正文；不从课文正文、目录或标题增添生字。原始 PDF 中存在落在可视页面之外的隐藏文字，已按页面边界排除。一年级上册写字表是两栏；识字表中汉语拼音部分又是局部双栏，均已按截图核对并恢复课次顺序。

`recognitionItems` 与 `writingItems` 保留每次出现的汉字、原表拼音、课次标识、PDF 页码及是否为蓝色复习读音。`recognition` 与 `writing` 分别为同册去重的字表。`lessons` 按附录课次对齐两表；每课先取识字表顺序，再追加该课只见于写字表的字；`orderedCharacters` 是以上合并结果在同册首次出现的顺序。**这是一种依据原书课次生成的学习顺序，不等同于逐句扫描课文后每字首次出现的顺序。**

`readings` 优先保留该字在本册附录中首次出现的有拼音条目，`readingVariants` 保存同册其他印刷读音。写字表没有注音时，原始教材数据不虚构拼音；应用另由读音库和人工语境校对补充。一个多音字仅展示孤立汉字时可能有不止一个合理读音，出题应结合语境，且不能把该字其他正确读音直接当作错误选项。

## 核验结果

- 十二册写字表条目总数全部与书末印刷总数一致。
- 十册识字表排除蓝色复习读音后的新字数全部与书末印刷总数一致；六年级原书无识字表。
- PDF 注音字体的专用编码已转换为 Unicode 声调字母。注音通过位置提取和独立的 PDF 文本序列互相核对，修正了行内字母跨相邻单元格造成的十四处错位。
- 所有非空原始条目的拼音均通过 `pinyin-pro` 的该字多音字读音集合检查；字典用于发现异常，不用默认读音覆盖原书。`scripts/curriculum-check.mjs` 可以复查数量、字符集合、排序和拼音。
- 已人工确认容易误判的原书拼音：三年级下册“曾”是 `zēng`（《三衢道中》作者曾几）；五年级上册“哼”在该表为 `hng`；五年级下册“呵”先后出现 `ā`、`a`，“喇”为 `lā`。这些均保留原书读音。

运行结构与读音校验：

```sh
node scripts/curriculum-check.mjs
```

研究用完整 PDF、提取文本与截图仅存放在被 Git 忽略的 `data/research/` 中，不应随网站或 GitHub 仓库发布。本站只提供所需字表数据与来源信息，不再分发整本教材、插图或课文。
