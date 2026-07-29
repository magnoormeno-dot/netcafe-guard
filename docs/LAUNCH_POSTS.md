# Day 4 发帖包(launch posts)

GROWTH_PLAN Day 4 的全部材料。每一篇都写成**你的第一人称**,因为每一篇都必须
从你自己的账号发出去:帖子的承重句——"我在为电竞场地做安全,这是我希望早就
存在的免费工具"——写在你的 GitHub bio 里,是你的真话;从任何别的身份嘴里说
出来都是水军行为。r/netsec 和 r/sysadmin 恰好是全网最擅长识破水军、且从不给
第二次机会的两个社区。GROWTH_PLAN 里那句话对发帖同样成立:假信号正是审核者
要筛掉的东西。

另外,发帖只是开局:发出后前 3–4 小时的评论区问答决定帖子的生死,只有真的做
过场地安全的人接得住那些问题。所以下面把"点发布"之前的所有活都干完了。

---

## 0. 发帖前必须清掉的硬伤(按顺序做)

1. **npm 还没发布。** registry 现在对 `netcafe-guard` 返回 404,而 README 的
   第一条安装命令是 `npx netcafe-guard scan`。发帖当天这是灭顶之灾:置顶评论
   一定是 "the install command 404s"。跑 `npm publish`(包名当前无人占用),
   或至少先把 README 安装行改成 `npx github:magnoormeno-dot/netcafe-guard scan`。
2. **README 顶部还没有演示 GIF**(Day 2)。从帖子点进来的人 10 秒内决定去留,
   录一段 asciinema / terminalizer 的 `scan` 输出放最上面。
3. **还没有任何 good first issue**(Day 3)。帖子带来的潜在贡献者需要一扇门,
   先开出 8–12 个再发帖。
4. 仓库 description 目前是一串关键词(`security ai-security multi-tenant …`)。
   关键词应该放进 **topics**;description 换成一句人话:
   *"Read-only security baseline scanner for shared, AI-equipped PCs."*
   顺手把 **Discussions 打开**(Day 1 计划项,现在还是关的)。Settings 里两分钟。
5. 发帖当天重读目标社区的版规(会变);r/netsec 记得选 flair。

## 通用纪律

- 首行披露"这是我做的"。只用一个账号;不拉人点赞;绝不用小号回帖。
- 草稿是底稿:凡是不像你口气的句子,改成你的话。你要能为帖子里每一句话答辩。
- 别一天全发。建议节奏:**中文运营者社群 →(修掉他们发现的丢人 bug)→
  r/sysadmin → r/msp → Show HN → r/netsec**(最技术的版本收尾)。
  Reddit / HN 黄金时段:周二至周四,UTC 14:00–16:00。
- 可以主张的事实(已核实):17 条规则(多租户 3 + AI 面 4 + 会话 3 + 经典基线 7)、
  零依赖、只读、无遥测、MIT、Node ≥ 18、31 个测试全过、v0.1.0、本周开源。
- **不可主张**:任何用户数、场地数、"经过实战检验"——除非发帖时它是真的。

---

## 1. r/netsec(flair: Tool)

**Title:**

> netcafe-guard — read-only baseline scanner for shared PCs that treats
> endpoint AI features (screen recall, clipboard sync, leftover agent
> credentials) as multi-tenant attack surface

**Body:**

Disclosure: my project. MIT, zero dependencies, no telemetry. I do security
work for internet cafés and gaming venues, and this is the tool I kept wishing
existed. 【可选:一句你自己的真实背景——做了多久、大概什么规模。只写真的。】

**The problem.** A gaming café hands the same Windows box to a stranger every
few hours — the most mature form of "leased computing" that exists, and rising
hardware costs are making leased seats more common, not less. The security
tooling for that model is roughly nothing: no baseline, no drift detection, no
way to answer "is this machine clean for the next person?"

**What endpoint AI changes.** These features assume a single long-term owner.
On a shared machine each one is a tenant-to-tenant leak:

- Screen recall / periodic AI screenshotting (`DisableAIDataAnalysis` not set
  under `HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsAI`): the next tenant
  pages back through the previous tenant's banking session.
- Clipboard history and cross-device clipboard sync: one user's password
  surfaces in the next user's session.
- Leftover agent credentials — `~/.ssh/id_rsa`, `~/.aws/credentials`,
  assistant API keys and tool configs: a free identity for whoever sits down
  next, billed to someone else.
- Agent tool configuration written by user A, executing later for user B.

None of this is speculative: every item is a registry value or a file-existence
check you can read today. That's the project's scope rule — if it can't be
checked read-only on a real machine now, it stays in the vision doc, not in the
ruleset.

**What it is.** A small zero-dependency Node CLI: probes read facts (registry
values, file existence — never file contents), and a JSON rule engine evaluates
17 rules in three priority groups: multi-tenant hygiene first (is session
restore / write protection actually active? leftover credentials? browser
password saving?), AI surface second, and the unglamorous classical baseline
third (auto-logon, cleartext registry password, Guest account, RDP, autorun,
firewall, Defender, screen lock) — because that layer is still failing in the
field.

Design choices that may interest this sub:

- **Read-only, always.** A scanner that reconfigures leased machines is itself
  the multi-tenant risk.
- **Unknown ≠ pass.** Anything a probe can't read is reported as "check this by
  hand", never assumed safe.
- **Rules are plain JSON** (`{"fact":"recallDisabled","operator":"isTrue"}`), so
  an operator can encode local policy with no code, and you can evaluate a
  ruleset against a canned facts file on any OS:
  `netcafe-guard scan --facts facts.json --platform win32`.
- **Credential probes check existence only** and never read contents — a
  scanner that slurps secrets is the leak.

**Honest limits:** v0.1.0, Windows-first, 17 rules, single maintainer,
published this week. The score is a triage aid, not a compliance certificate.

What I'd genuinely like from r/netsec: (1) leftover agent state you'd check
that I'm missing — local MCP server configs, tool manifests, model caches?
(2) if you've touched the café/venue world: management suites and write-filter
agents worth detecting (Deep Freeze-style software, hardware restore cards —
they expose different signals per region). (3) holes in the threat model:
https://github.com/magnoormeno-dot/netcafe-guard/blob/main/docs/VISION.md

Repo: https://github.com/magnoormeno-dot/netcafe-guard

---

## 2. r/sysadmin

**Title:**

> If strangers share your Windows boxes (kiosks, cafés, training rooms, loaner
> laptops): the new AI features leak data between users. I built a free
> read-only checker.

**Body:**

Disclosure up front: I built this, it's MIT/free/no telemetry, and I do
security for gaming venues, so shared machines are my whole day.

Things I keep finding on machines that different people use back-to-back:

- Recall-style AI screenshotting enabled — next user can browse the previous
  user's banking session frame by frame
- Clipboard history on (Win+V) and syncing across devices — last user's
  password one keystroke away
- The previous user's `~/.ssh` keys and cloud/AI API credentials still in the
  profile
- The write filter / session-restore product everyone *assumes* is active…
  isn't (expired license, wrong partition, someone disabled it to "install one
  thing")
- And the eternal classics: auto-logon with the password in cleartext in the
  registry, Guest enabled, RDP open, autorun on, screen lock never.

`netcafe-guard` is a one-command, read-only audit for exactly that:
`npx netcafe-guard scan`. 17 checks, severity-weighted score, plain-language
remediation for each finding, and `unknown ≠ pass` — anything it can't read it
tells you to verify by hand instead of quietly passing it.

Ops-friendly bits: `--json` for your dashboard, `--fail-under 80` exits
non-zero so Task Scheduler / your RMM can flag drift, `--rules your.json` for
site policy (rules are plain JSON, no code). Zero dependencies, Node 18+,
nothing phones home. It never changes the machine — it reports, you decide.

v0.1, Windows-first (Linux/macOS baselines on the roadmap), released this week.

Question for the sub, honestly the main reason I'm posting: **what do you check
between users on shared machines that I should add?** Rule requests are
cheap — most rules are ~10 lines of JSON.

https://github.com/magnoormeno-dot/netcafe-guard

---

## 3. r/msp

**Title:**

> Free read-only baseline scanner for clients' shared/kiosk PCs (lobbies,
> cafés, training rooms) — JSON output your RMM can ingest

**Body:**

Disclosure: my tool, MIT, free, no agent, no telemetry. I do security for
gaming venues — the most brutal shared-PC environment there is — and built the
audit I needed.

If you manage clients with kiosk or shared seats, the risk isn't just the
classic misconfigs (auto-logon, Guest, RDP, autorun — it checks those too).
It's the new endpoint-AI features that assume one owner per machine: Recall
screenshotting the previous user's session, clipboard history/sync carrying
credentials between users, leftover cloud/AI API keys in profiles, and
write-filter products that everyone assumes are running but aren't.

Fits an MSP workflow without ceremony:

- `npx netcafe-guard scan --json` → parse score + findings into your RMM;
  `--fail-under 80` gives you a non-zero exit code for alerting
- Run post-imaging as an acceptance gate, then scheduled for drift
- Per-finding remediation text you can paste into a ticket
- Site-specific policy is a JSON file (`--rules client-x.json`), no code

Read-only by design — it never modifies the endpoint, so it's safe to run on
machines you don't own. v0.1, Windows-first, this week's release.

What checks do your techs run on shared endpoints that this should cover?
Regional write-filter/management suites you deploy are especially useful — 
detection rules for them are the current roadmap item.

https://github.com/magnoormeno-dot/netcafe-guard

---

## 4. Hacker News(Show HN)

**Title:**(80 字符内,不要句号)

> Show HN: Netcafe-guard – read-only security baseline for shared, AI-equipped PCs

**Text:**

I do security for gaming venues. A café hands the same Windows machine to a
stranger every few hours — the most mature form of "leased computing" there is,
and rising hardware costs are pushing more computing toward that model.

The new endpoint AI features all assume a single owner. On a shared machine:
screen recall photographs the previous tenant's banking session for the next
tenant to browse; clipboard history and cross-device sync carry passwords
between users; leftover assistant/agent API keys and SSH keys are a free
identity that bills someone else.

netcafe-guard is a zero-dependency Node CLI that audits a machine against a
17-rule baseline in three priority groups: multi-tenant hygiene (is the write
filter actually on? leftover credentials?), AI surface (recall, clipboard,
assistant policy), then the classical Windows checks that are still failing in
the field. Read-only by design — a scanner that reconfigures leased machines
would itself be the multi-tenant risk. Unknown ≠ pass: anything it can't read
is flagged for manual review, never assumed safe.

Rules are plain JSON, so venue operators can add checks without code, and you
can test rulesets offline with a canned facts file (`--facts`).

v0.1.0, Windows-first, Linux/macOS baselines planned. Single maintainer;
released this week. I'd value critique of the thesis (docs/VISION.md — why I
think leased, multi-tenant, AI-equipped endpoints become the default) as much
as of the code.

https://github.com/magnoormeno-dot/netcafe-guard

---

## 5. 中文运营者社群(网吧/电竞馆行业群、QQ 群、微信群、贴吧)

**先做:** 有群规先看群规;拿不准就私聊群主一句"想分享一个自己写的免费开源
工具,给机器做安全体检的,方便发吗?"——报备过的帖不会被当广告踢。别同一天
多群刷屏。

### 长版(行业群 / 贴吧)

各位老板、网管,分享一个我自己写的免费开源小工具:**netcafe-guard**,给共享
电脑做"安全体检"的。

问题就一句话:上一位顾客走了,下一位坐下之前,这台机器到底干不干净?

- 还原(还原卡/还原软件)**真的在生效吗**?许可过期、漏了分区、被人临时关掉
  装东西忘了开——还原失效,后面所有防护都白搭
- Windows 的"回忆 / Recall"AI 截屏开着没?开着的话,下一位顾客能一帧一帧翻
  到上一位的网银、支付页面
- 剪贴板历史(Win+V)和跨设备剪贴板同步——上一位复制过的密码,下一位一个
  快捷键就能看到
- 顾客残留的密钥文件(.ssh、云服务、AI 助手的 API key)——相当于把身份证落
  在机器上,而且账单还挂在别人名下
- 老几样:来宾账户、自动登录、注册表明文密码、RDP、U 盘自启、防火墙、
  Defender、屏幕锁

一条命令出报告:`npx netcafe-guard scan`(需要 Node.js 18+)。按严重程度打
分,每一条都带"怎么修"。**只读检测,绝对不改机器**,开源免费(MIT),没有
广告、不上传任何数据,代码很短,不放心可以自己看。

检测规则是纯 JSON,想加"检测某某计费系统 / 某某还原软件是否在跑"这类本地
规则,不用会写代码。你们店里在用什么还原卡/管理套件,回帖告诉我,我来写
检测规则。

GitHub:https://github.com/magnoormeno-dot/netcafe-guard
本周刚开源,提意见就是帮忙。

### 短版(微信群一段话)

写了个免费开源工具 netcafe-guard,一条命令给网吧/电竞馆的机器做安全体检:
还原是否真的生效、Windows AI 截屏和剪贴板历史会不会把上一位顾客的东西漏给
下一位、有没有残留密钥文件、来宾/自动登录/RDP 这些老问题。只读不改机,报告
带修复方法,无广告无上报。GitHub 搜 netcafe-guard。刚发布,求拍砖。

---

## 6. 评论区弹药(高频问题 → 诚实答案)

**"有 Deep Freeze / 还原卡就够了。"**
第一优先级的第一条规则,恰恰就是"验证还原真的在生效"。还原不是装了就完事:
许可过期、漏配分区、被临时关掉,都是真实事故。这个工具是"信任但要核查"里
核查的那一步。另外还原解决的是"重启之后干净",不解决"还原本身没生效"和
云端同步(剪贴板跨设备同步不随本机重启消失)。

**"和 CIS-CAT / HardeningKitty / Wazuh 有什么区别?"**
那些是单一所有者的企业基线,威胁模型里没有"上一位使用者就是攻击者"。多租户
卫生 + AI 面这两组检查是这个工具存在的理由;经典基线只是顺带也查。另外重量级
完全不同——场馆老板不会部署 Wazuh,但会跑一条 npx 命令。

**"AI 角度是不是蹭热度?"**
可能!所以经典基线永远保留。但 AI 面的每一条都不是想象:每条对应今天真实
存在的注册表键或文件。规矩写在 repo 里:凡是只能"描述"不能"读取"的威胁,
只能进 VISION.md,不能进 rules/。欢迎去拆论点。

**"只读,那谁来修?"**
每条失败项都带确切的修复命令/路径,操作员自己决定。会改动租赁机器的扫描器,
本身就是多租户风险——这是设计红线,不会变。

**"为什么用 Node 写 Windows 安全工具?"**
跨平台(Linux/macOS 基线在路线图上)、规则引擎可离线单测(`--facts`)、
npx 零安装分发。PowerShell 生态里有很好的单机加固工具,但没有对准多租户/
AI 面这个角度的。

**"零 star,刚建的仓库?"**
对,本周刚发布——所以才来发帖。单人维护,issue 保证每天回。

**"会不会偷数据?"**
零依赖、零网络调用、凭据探针只查文件存在性从不读内容。代码总量很小,直接
读源码比信我的话快。

**有人报 bug →** 公开感谢,当场开 issue 并 @ 他,快修(Day 6 纪律)。发帖
链接记进 Settings → Insights → Traffic 对照引流效果。
