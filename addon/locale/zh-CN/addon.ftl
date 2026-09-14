# ---------------------------------------------------------------- general ----
get-ccf-info = 识别分区信息
paper-info-update = 正在识别分区信息…
requesting-citations-multiple = 正在识别 { $count } 篇论文的分区信息…
requesting-citation-single = 正在识别分区信息…
reidentify-selected = 重新识别分区信息（忽略缓存）

# ---------------------------------------------------------------- columns ----
column-summary = 分区汇总
column-ccf = CCF 分区
column-cas = 中科院分区
column-citation = 引用次数
item-row-label = 分区汇总
item-row-empty = 尚未识别

type-journal = 期刊
type-conference = 会议
type-preprint = 预印本
type-other = 其它

# ------------------------------------------------------------- scan / jobs ----
scan-progress-title = CCF 分区助手
scan-progress-line = 正在扫描文献库：{ $done }/{ $total }
scan-finished = 扫描完成，更新了 { $updated } 条（共 { $total } 条）
scan-cancelled = 扫描已取消
scan-started = 已开始全库扫描…
scan-already-running = 扫描正在进行中
scan-need-selection = 请先在文献库中选中条目
cas-refresh-title = 更新中科院分区数据
cas-refresh-line = 正在查询期刊分区：{ $done }/{ $total }
cas-refresh-finished = 分区数据更新完成，刷新了 { $count } 条记录
cas-clear-done = 已清空 { $count } 条本地区分区缓存
cas-import-done = 已导入 { $imported } 条分区数据（跳过 { $skipped } 条）
cas-import-failed = 导入失败：文件格式无法识别
cas-export-done = 已导出到 { $path }
cas-export-empty = 本地分区缓存为空，无需导出
cas-warm-done = 已为文献库中的 { $count } 个期刊补充分区数据
cas-rebuild-done = 已重建 { $count } 条分区数据
cas-store-empty = 本地暂无分区缓存
alias-saved = 别名映射已保存

# -------------------------------------------------------------- preferences ----
pref-pane-title = CCF 分区助手
progress-scan = 扫描文献库
progress-identify = 识别条目
progress-cas = 更新中科院分区
progress-done = 已完成
pref-basic-title = 自动识别
pref-enable = 启用插件
pref-auto-new = 新加入的文献自动识别分区
pref-skip-identified = 跳过已经识别过的条目
pref-new-delay = 新条目等待时间
pref-new-delay-unit = 毫秒
pref-button-scan = 扫描全库并补齐
pref-button-scan-force = 强制重新识别全库
pref-button-update-selected = 识别选中条目
pref-button-cancel = 停止

pref-format-title = 分区汇总格式
pref-template = 格式模板
pref-template-hint = 在下面点一下任意一项，就能把它插到模板里光标所在的位置。旧版模板里没有 {top}，想显示 CNS 顶刊属性把它点进去即可。
pref-template-legend = 可用占位符（点一下插入）
tmpl-insert-hint = 插入到模板光标处
tmpl-ccf = 最终的 CCF 分区文字，例如「CCF-A」；未识别到时显示「无分区」，预印本显示「arXiv预印本」
tmpl-cas = 最终的中科院分区文字，例如「中科院1区」；会议、预印本等没有中科院分区时自动留空
tmpl-top = CNS 顶刊属性：正刊显示「Nature」「Science」「Cell」，大子刊显示「Nature子刊 NC」这样的形式；其它期刊留空
tmpl-venue = 期刊名或会议简称，例如「TPAMI」；arXiv 条目显示「arXiv」
tmpl-venue-abbr = 同上，但不会做任何替换，始终是原始名称
tmpl-ccf-abbr = 只有等级字母，例如「A」（不含「CCF-」前缀）
tmpl-cas-abbr = 只有分区数字，例如「1区」（不含「中科院」前缀）
tmpl-type = 条目类型代码：journal / conference / preprint / other
tmpl-type-label = 条目类型的中文名：期刊 / 会议 / 预印本
tmpl-year = 出版年份，例如「2024」
tmpl-updated = 上次识别分区的日期，例如「2026-09-12」
tmpl-citation = 引用次数，例如「128」
pref-separator = 分隔符
pref-ccf-prefix = 显示为 CCF-A（否则只显示 A）
pref-no-ccf = CCF 无分区时
pref-preprint = 预印本时
pref-no-cas = 无中科院分区时

pref-columns-title = 列与条目面板
pref-show-summary = 显示「分区汇总」列
pref-summary-label = 汇总列标题
pref-show-ccf = 显示「CCF 分区」列
pref-ccf-label = CCF 列标题
pref-show-cas = 显示「中科院分区」列
pref-cas-label = 中科院分区列标题
pref-show-citation = 显示「引用次数」列
pref-citation-label = 引用次数列标题
pref-show-item-pane = 在条目信息面板中显示分区汇总

pref-sources-title = 数据来源与缓存
pref-dblp = 通过 DBLP 查询 CCF 分区
pref-dblp-endpoint = DBLP 查询接口
pref-cas = 通过 LetPub 查询中科院分区
pref-cas-ttl = 本地分区数据有效期
pref-cas-ttl-unit = 天（0 表示不自动刷新）
pref-cas-interval = LetPub 请求间隔
pref-cas-interval-unit = 毫秒（建议不低于 2000）
pref-button-cas-refresh = 更新过期缓存
pref-button-cas-rebuild = 重建全部分区数据
pref-button-cas-warm = 预取文献库期刊
pref-button-cas-import = 导入分区文件
pref-button-cas-export = 导出分区数据
pref-button-cas-clear = 清空缓存

pref-alias-title = 自定义别名映射
pref-alias-hint = 当某个期刊/会议无法被自动识别时，在这里补充「Zotero 中出现的名称 → 缩写 / 全称 / CCF 等级 / 中科院分区」。匹配名称支持全称或缩写，忽略大小写、届次、年份与地点。
pref-alias-add = 新增一条
pref-alias-save = 保存别名映射

pref-extra-title = 写入与迁移
pref-delete-notes = 迁移成功后删除旧笔记

pref-about = { $name } { $version } · 构建于 { $time }

alias-column-match = 匹配名称
alias-column-abbr = 缩写
alias-column-full = 全称
alias-column-ccf = CCF
alias-column-cas = 中科院分区
alias-none = CCF：不设置

# ---------------------------------------------------------------- menus ----
menu-scan-library = 扫描全库并补齐分区信息
menu-self-check = 自检：为什么列是空的（含重建列）
self-check-title = CCF 分区助手 自检
menu-refresh-column = 刷新分区汇总列（识别完不显示时点这里）
menu-refresh-column-done = 已刷新 { $count } 个分区列
