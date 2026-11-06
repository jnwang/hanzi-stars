# 汉字星星

一个供孩子独立练习汉字的小网站。按年级、学期选择内容，每 10 个字组成一颗星，星星中央显示本关第一个汉字。

- 一至六年级、上下学期可以自由选择，每学期内部按顺序解锁。
- 一屏预习本关全部汉字与拼音，支持逐字听读和顺序跟读。
- 随机看字选四个拼音，干扰项涉及声母、韵母和声调；另一合法读音不会被用作错误选项。
- **只重考答错的字**：例如 10 个字错 2 个，下一轮只考这 2 个，已经答对的字不再重复考。
- 所有字认读通过后，每字先跟写，再隐藏范字独立写；笔顺、方向或位置错误以及使用提示，都不能直接算独立书写通过。
- 全部认读与书写完成后点亮星星。上下学期分别点亮年级图标的两半。
- 本地保存中途进度、已点亮星星和练习日期；支持 JSON 备份导入、导出。不需要家长判题。
- 可选 GitHub 私有仓库自动同步。每台设备由家长首次连接，之后自动备份和读取进度。

## 启动与检查

需要 Node.js 22.18+（建议 Node.js 24）。

```bash
npm ci
npm run dev
```

```bash
npm test
node scripts/check-assets.mjs
npm run build
npm run preview
```

成品在 `dist/`，支持 GitHub Pages 子目录；路由使用 URL hash，刷新关卡页面不会 404。

## GitHub Pages

网站：<https://jnwang.github.io/hanzi-stars/>。

源码保存在 `main`，构建结果发布到 `gh-pages` 分支。使用已登录的 GitHub CLI，更新源码并推送后执行：

```bash
npm run publish:pages
```

脚本会依次测试、检查学习资产、构建，在独立临时目录中更新 `gh-pages`，并设置 Pages 从该分支的根目录发布；不会切换或覆盖当前源码工作区。需要对仓库有写入及 Pages 设置权限，不需要 OAuth 的 `workflow` 权限。第一次发布通常需要等待数分钟。

如以后使用 Actions 自动部署，可将 `deployment/pages-workflow.yml.example` 放到 `.github/workflows/pages.yml`，并在 Settings → Pages 将 Source 切换为 GitHub Actions；推送工作流文件需要对应账号授权。

网站源码仓库不含孩子的练习记录。默认只保存在浏览器；启用云同步后，记录写入家长指定的私有仓库。GitHub Pages 与本机预览属于不同来源，需分别连接同一个私有仓库，或导出再导入。

## iPad 与跨设备同步

在 iPad Safari 普通标签页打开网站。支持手指或触控笔在田字格中写字；手掌防误触取决于设备和浏览器，不是原生 Apple Pencil 笔记应用。可通过“分享 → 添加到主屏幕”建立独立入口，并在实际使用的入口中完成连接。

1. 首页右上角 → 学习记录 → 跨设备同步。
2. 私有记录仓库已准备为 `jnwang/hanzi-stars-progress`；也可填写自己的私有仓库（先创建 README）。
3. 在 GitHub 创建 **Fine-grained personal access token**，Repository access 选择 **Only select repositories**，只选择记录仓库。Repository permissions 仅添加 **Contents: Read and write**，设置到期日。
4. 将密钥填入网站，点“连接并开启自动同步”。每台设备首次各配置一次，建议使用不同密钥。

连接密钥只保存在该浏览器的本地存储，直接用于请求 `api.github.com`，不会放入网址、学习记录导出文件或公开仓库。密钥具有所选仓库的文件读写能力，按 [GitHub 文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) 只授予记录仓库权限。不要把密钥发到聊天中。

学习进度立即存到本机，有变化约 2 秒后上传；打开网页、返回前台、恢复网络和可见时每分钟会读取云端。iPad 后台可能暂停网页，关闭时的上传不作保证，**换设备前确认“已同步”**。重新打开后会补传未同步进度。没网时可继续当前已加载的练习，站点并非完整离线应用。

已点亮星星、打卡日期和不同关卡会合并；同一关若被两台设备同时练习，保留进度更多的一份完整练习，避免把两套题目与答案拼成错误队列。正在答题或写字时不会突然切换，返回选关后应用云端更新。已完成关卡的复习优先保留较新的记录。

云端路径为 `progress/<字库版本>.json`，每次保存有 GitHub 提交历史。使用文件 SHA 检测并重试写入冲突，校验失败不会覆盖云端文件。每次同步都会检查仓库是否仍为私有；公开、归档、密钥失效或网络失败时显示错误并保留本机记录。初次接收云端记录前，本机旧记录保留在本地存储的 `:before-sync` 项。断开只删除本设备连接密钥，不删除两端记录。

Safari 网站存储可能被用户清理或系统回收；参见 [WebKit 存储策略](https://webkit.org/blog/14403/updates-to-storage-policy/)。云端备份不会随之删除，重新连接同一仓库后可以恢复；尚未上传的本机内容仍需及时同步。

## 字库与版本

目前提供十二册，共 **4,630 个册内字位、2,973 个不同汉字、466 颗星**。合并每册识字表和写字表，册内去重；跨册重复的字保留各册练习，因此册内字位多于全库不同汉字数。

**一至三年级使用已核对的 2022 课标修订教材存档；四至六年级使用已核对的旧版统编教材存档，并非 2026 修订版。** 各册版次、页码、来源与数量详见 [data/SOURCES.md](data/SOURCES.md)。完整教材 PDF 仅用于本地核验，不发布。

拼音优先使用教材附录中该字的注音；没有注音的写字表条目使用已核对字音或词典读音。短词语用于区分多音字和同音字，不声称都是原课文中的词语。语境资产及说明见 `data/pronunciation-contexts.json` 和对应 notes 文件。语音是普通话合成音频。

更新字库后执行：

```bash
node scripts/curriculum-check.mjs
npm run prepare:data
python3 scripts/generate-audio.py
node scripts/check-assets.mjs
```

音频生成脚本使用 macOS Tingting 声音及 FFmpeg；生成的 MP3 已随站点提供，使用或部署不需要 macOS。所有笔顺和音频均同站点加载，不依赖运行时外部 CDN。

## 进度与书写判定

进度按字库内容版本分开保存，字库变化不会将旧的已完成关卡套用到新的分组。导入前验证字库版本、关卡顺序和认读记录，成功导入前会保存一份原记录。存储不可用或容量不足时明确提示，损坏的原记录不会被静默覆盖。

一颗星代表完成本关的屏幕认读和书写练习；独立纸笔书写与长期记忆仍需在日常阅读、作业中使用和复习。

Hanzi Writer 的规范笔画数据来自 Make Me a Hanzi，遵循 Arphic Public License；相关许可随站点位于 `public/licenses/`。代码依赖及锁定版本见 `package-lock.json`。
