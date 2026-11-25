# dsh-emotion-recognition

给 DeepSeek Harness（DSH）用的情绪记忆插件：**PAD 情绪场 + 带情感指纹的记忆 + 她自己的主观评分**。

> **这是 fork**，上游是 [xsy822/dsh-emotion-memory](https://github.com/xsy822/dsh-emotion-memory) 0.1.4（MIT，作者 xiaoshiyan）。
> 上游从 2025-11 起停止更新，这里按我们的用法改了若干处，并把「主观评分」这条线加进来。

## 它做什么

- **客观**：每轮结束由一个轻量模型读这一轮对话，输出 OCC 评估变量（合意性 / 唤醒 / 掌控 / 意外 / 指向 / 关系权力），
  再经坐标映射成 PAD 三维状态和 14 项情绪的强度；下一轮开头注入一条状态。
- **记忆**：写进记忆的条目带「情感指纹」（写下时的 PAD 与主导情绪），检索时用当前情绪做偏置。
- **主观**（本 fork 新增）：她可以用 `emo_mood` 工具写下「此刻的心情」并给几个情绪打 0~10 分，覆盖上一次。
  设置页的「心情」页签分「主观 / 客观」两栏，可以把两边摆在一起对照。

## 相对上游的改动

1. **工具改名**：`remember` → `emo_remember`，避免和 `dsh-fish-memory` 的 `remember` 撞名。
2. **置信门槛调高**：心情更新 20 → 40、写记忆 45 → 65（判得很淡的就不动心情、不写记忆）。
3. **判定多拿上下文**：`judge` 除了这一轮，还带「最近 6 轮真对话」和「当前心情」，减少反讽、接梗被判歪。
4. **新增 `emo_mood`**：她写主观心情 + 自评分（每个词 0~10，各算各的，不要求加起来等于 10）。
   `scores` 按 JSON 文本传（宿主参数 schema 不认 object），解析失败就当没打分，只留那句话。
5. **设置页两栏**：「心情」页签里分「主观 / 客观」，主观显示她的自评分与折算到 14 项情绪的分析，
   客观保留原有的 PAD / 成分 / 派生 / 通道表；默认打开「主观」。
6. **主观不归一**：主观那栏每一项各算各的百分比，加起来不必是 100%，超过 100% 就顶格显示。
7. **情绪条上色**：按 [Plutchik 情绪轮](https://en.wikipedia.org/wiki/Contrasting_and_categorization_of_emotions#Plutchik's_wheel_of_emotions)
   的家族配色（喜悦黄 / 乐观橙 / 惊讶青 / 悲伤蓝 / 厌恶紫 / 敌意暗红……）算好颜色，但**平时一律淡蓝**，
   只有该项到 100% 才显出本色并带呼吸发光——一眼能看出「哪一项是真的满」。
8. **折算表**：她用的词（安心、好奇、烦躁……）按 Plutchik 的 8 个基本情绪与组合规则，
   参考大连理工情感词汇本体库的 7 大类归类，折算到 14 项情绪；生理词（累、困、饿）单独标注「暂不分析」。
9. **系统注入过滤**：闹钟、日程、时间块、心情快照这类不是人说的话，不再被当成「对方」参与判定。
10. **指代**：私聊里称「主人」（默认称呼，可在 `lib/judge.js` 的提示词里改）；群里看「昵称: 」前缀用名字，不写「他 / 对方」。

## 安装

需要 DSH 0.2.1-rc.5 或 0.2.2-rc.x，Node ≥ 22。

```bash
# 直接从 Release 装（把版本号换成你要的）
dsh plugin --profile web add https://github.com/endlessstary/dsh-emotion-recognition/releases/download/v0.1.5/dsh-emotion-recognition-0.1.5.tgz
```

或者把 tgz 下到本地、填绝对路径：

```bash
dsh plugin --profile web add D:/path/to/dsh-emotion-recognition-0.1.5.tgz
```

装完重启 DSH。设置页左列会出现「情绪记忆」。

> `dsh plugin add` 最后可能报 `ERR_PNPM_IGNORED_BUILDS`（onnxruntime / protobufjs 的构建脚本被忽略）——
> 这是假报错，包已经装好了。但 dsh 可能没自动登记，要把 `dsh-emotion-recognition` 手动加进
> profile 里 `package.json` 的 `dsh.profile.bundles`。

## 可选依赖（向量检索）

`onnxruntime-node` 和 `@huggingface/transformers` 是**可选依赖**（合计约 200 MB）：

- 不装：记忆检索退回字面匹配，其余功能一切正常。
- 装了：多一路本地向量召回，和字面结果做 RRF 融合。设置页「设置」里有「装依赖 + 下模型」的一键按钮。

## 数据在哪

- 情绪状态与记录：`~/.dsh/emotion-memory/state.json`（目录名沿用上游的 `emotion-memory`，不是笔误）
- 配置：`~/.dsh/emotion-memory/config.json`
- 记忆条目：沿用 `~/.dsh/fish-memory/session-<会话>.json`

## 已知局限

- 情绪状态按**会话**存，不按人分：一个群里多人说话，PAD 是整群共用一份。
- 「派生情绪」（心疼、吃醋、释然……）需要评估变量，主观评分这边算不出来。
- 14 项情绪是「读出用的标签集」，不是心理学公认的 14 种基本情绪（主流是 Ekman 6 / Plutchik 8）。
- 设置页前端是手写 React（`client.js`），没有构建链；改样式直接改这个文件。

## 想请人测评什么

1. 判定准不准：同一轮对话，「客观」判的情绪和你自己的感受差多少（看「记录」页签的流水）。
2. 主观 vs 客观：两栏摆在一起，哪边更贴近当事人。
3. 折算表：她用的词有没有没覆盖的、折算系数合不合理。
4. 安装体验：可选依赖不装时能不能正常跑。

## License

MIT，见 [LICENSE](./LICENSE)。上游版权归 xiaoshiyan；本 fork 的改动同样以 MIT 发布。
