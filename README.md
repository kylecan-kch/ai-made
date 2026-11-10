# 阚哥不求人转换器

**VCF Contacts Hub** · VCF 联系人 ⇄ 表格互转

> 网页版版本 **1.0.1**（根目录 `package.json`）。仓库当前发布分支为 `ready-for-everything`。
>
> 同仓库还包含微信小程序版 **「不求人VCF工具」**，版本 **1.0.5**（见 [`miniprogram-vcf/package.json`](./miniprogram-vcf/package.json)）。两端版本号独立维护，请勿混用。小程序说明见 [`miniprogram-vcf/README.md`](./miniprogram-vcf/README.md)，更新记录见 [`miniprogram-vcf/CHANGELOG.md`](./miniprogram-vcf/CHANGELOG.md)。将小程序放在 `miniprogram-vcf/` 子目录的决策见 [docs/decisions/0001-miniprogram-in-subdirectory.md](docs/decisions/0001-miniprogram-in-subdirectory.md)。

一个纯前端的通讯录转换工具：把 `.vcf / .vcard` 联系人文件解析成表格（“格式1”），也可以把 Excel / CSV 表格转回 `.vcf`。所有解析、编辑、导出都在浏览器本地完成，不上传任何数据。另外可以下载一个**单文件离线 HTML**，双击即可离线使用。

- 项目名称（网页版）：阚哥不求人转换器，英文名 VCF Contacts Hub（与 `metadata.json` 一致）
- 小程序产品名：「不求人VCF工具」
- 详细的操作教程见 [docs/使用说明.md](docs/使用说明.md)

## 功能一览

**导入**
- 上传 `.vcf` / `.vcard` 文件（点击选择或拖拽，一次一个文件），自动识别文件编码：UTF-8（有无 BOM 均可）、UTF-16（带 BOM）、GBK/GB2312（按 GB18030 解码）
- 直接粘贴 `BEGIN:VCARD … END:VCARD` 文本解析；提供“填入测试 vCard 代码”示例
- 上传 `.xlsx` / `.csv` 表格（首行为表头），按列名自动映射到联系人字段；会依次尝试各个工作表，使用第一个能识别出联系人的工作表（例如跳过“说明”封面页）
- 不支持旧版 Excel `.xls`：选择 `.xls` 文件（或改了扩展名的 `.xls`）会提示先用 Excel / WPS“另存为” `.xlsx` 或 CSV
- 两种导入模式：**覆盖现有数据**（默认）或 **追加合并到现有**（追加时不自动去重）

**表格（格式1）视图**
- 列：姓名、主要电话、备用电话、电子邮箱、公司/部门、职位、详细地址、分组标签、备注信息、操作
- 搜索：输入关键词后按回车或点「搜索」生效；匹配姓名、电话、邮箱、公司/部门/职位、备注、分组标签、地址；电话搜索忽略空格和连字符；匹配内容高亮
- 按分组标签筛选；按姓名 / 主要电话 / 公司名称排序，可切换正序 / 倒序
- 勾选（支持全选当前可见行）、批量删除（需二次确认）、“导出选中为 .vcf”
- 一键复制电话 / 邮箱；查看、编辑、删除单个联系人；新建联系人
- 顶部统计：总联系人、含电话、含邮箱、含公司的数量

**联系人详情 / 编辑抽屉**
- 编辑姓名（可“根据全名自动拆分姓/名”，支持常见中文复姓与英文名）、多个电话（手机/工作/住宅/主要/其他）、多个邮箱（工作/个人/其他）、公司/部门/职位、地址（街道、城市、省份/地区、邮编、国家）、分组标签、生日、网址、备注
- 查看并复制该联系人的 vCard 3.0 源码
- 按 `Esc` 关闭

**查重合并**
- 判定重复：电话号码只保留数字后完全相同（至少 7 位；11 位手机号前的 `+86` / `0086` / `86` 会被去掉，所以 `+86 138-0013-8000` 与 `13800138000` 算同一个号码），或姓名（去首尾空格、连续空格视为一个、不区分大小写）完全相同
- 分组可传递：A 与 B 电话相同、A 与 C 同名时，A、B、C 归为同一组，每个联系人只会出现在一个组里
- “一键合并全部重复项”：以组内第一条为基础，合并电话（按上面的规则归一化后去重）、邮箱（不区分大小写）、分组标签（并集）、备注（不同备注用 `；` 连接）；姓/名、公司、部门、职位、地址、生日、网址、头像为空时从其他条目补齐；合并后的记录留在该组第一条原来的位置，其余联系人顺序不变

**导出**
- `.vcf`：可选 vCard **3.0**（默认）/ **2.1** / **4.0**；2.1 可选 UTF-8 纯文本或 Quoted-Printable；导出范围可选“全部”或“已选中”；可自定义文件名（默认 `contacts_export_YYYYMMDD.vcf`）；右侧实时预览源码并可复制
- Excel（`联系人数据_格式1.xlsx`，工作表名 `格式1_联系人表`，所有单元格写为文本）/ CSV（`联系人数据_格式1.csv`，UTF-8 带 BOM，Excel 打开中文不乱码）
- 每个联系人的全部电话都会导出：第 1 个写入“主要电话”，第 2 个及以后全部写入“备用电话”，用英文分号 `;` 分隔
- CSV 防 Excel 误转换（仅 CSV，xlsx 不做此处理）：任意列中“像电话号码”的值（只含数字、空格、`-`、`(`、`)`，可带前导 `+`，并且以 `+` 或 `0` 开头、或至少 11 位数字）写成 `="…"`，Excel / WPS 打开时按原样显示，不会变成 `1.38E+10`，也不会丢掉前导 `0` 或 `+`；以 `=`、`@`、制表符、回车开头的值，以及以 `+` / `-` 开头但不是数字的值，会在前面加 `'`，防止被当成公式执行。“备用电话”含多个号码（有 `;`）时不属于“像电话号码”，不加 `="…"`。重新导入本工具时会自动还原这两种写法
- 下载格式1模板：`联系人信息标准表格_格式1.xlsx`（内容是 5 条演示联系人）

**其他**
- 数据自动保存在浏览器 `localStorage`（键名 `vcf_hub_contacts_v1`），刷新不丢失
- 首次打开（或本地没有数据时）自动载入 5 条演示联系人；也可随时点「载入演示数据」（会替换当前数据）
- 「清空」全部联系人（需确认）
- 「打包离线网页」：下载单文件离线版 `阚哥不求人转换器_离线版.html`

## 技术栈

- React 19 + TypeScript，Vite 8 构建，Tailwind CSS 4（`@tailwindcss/vite`）
- [SheetJS `xlsx`](https://cdn.sheetjs.com/) 0.20.3（从 cdn.sheetjs.com 安装，npm 上的 xlsx 停在 0.18.5）：读写 Excel / CSV
- `lucide-react`：图标
- esbuild：离线单文件版打包
- Node 内置 `node:test` + `tsx`：单元测试

## 快速开始

仓库中同时有 `bun.lock`（没有 `package-lock.json`），推荐用 Bun 安装依赖；npm 也可以。

```bash
# 安装依赖
bun install          # 或 npm install

# 本地开发（端口 3000，监听 0.0.0.0）
npm run dev          # = vite --port=3000 --host=0.0.0.0

# 生产构建，输出到 dist/
npm run build

# 本地预览构建结果
npm run preview

# 构建单文件离线版（见下文）
npm run build:standalone

# 类型检查
npm run lint         # = tsc --noEmit

# 删除 dist/
npm run clean
```

```bash
# 单元测试（= tsx --test src/utils/*.test.ts）
npm test

# 性能基准（= tsx scripts/bench-contacts.ts）
npm run bench
```

## 环境变量

`.env.example` 中有两个变量，来自 Google AI Studio 项目模板：

| 变量 | 用途（按 `.env.example` 注释） |
| --- | --- |
| `GEMINI_API_KEY` | 调用 Gemini API 的密钥，AI Studio 运行时自动注入 |
| `APP_URL` | 应用部署地址，AI Studio 运行时自动注入 |

> 注意：当前源码**没有任何地方使用这两个变量**，本地运行不需要配置 `.env`。

`vite.config.ts` 还会读取 `DISABLE_HMR`：设为 `true` 时关闭热更新和文件监听（AI Studio 环境使用）。

## 项目结构

```
.
├── index.html                    # Vite 入口页面
├── package.json / bun.lock       # 依赖与脚本
├── vite.config.ts                # Vite 配置（React、Tailwind、@ 别名、HMR 开关）
├── tsconfig.json                 # TypeScript 配置
├── metadata.json                 # AI Studio 应用元数据（名称、描述）
├── .env.example                  # 环境变量示例（AI Studio 模板）
├── scripts/
│   ├── build-offline-html.js     # 生成单文件离线 HTML 的脚本
│   └── bench-contacts.ts         # 解析/转换性能基准（npm run bench）
├── public/
│   ├── standalone.html           # 预构建的离线单文件版（供网页内“打包离线网页”下载）
│   └── assets/aistudio/…png      # 图片资源
├── src/
│   ├── main.tsx                  # React 挂载入口
│   ├── App.tsx                   # 主界面：三个标签页、全局状态、localStorage 持久化
│   ├── index.css                 # Tailwind 样式入口
│   ├── types/contact.ts          # 联系人、格式1行、vCard 导出选项的类型定义
│   ├── components/
│   │   ├── Navbar.tsx            # 顶栏：统计、打包离线网页、下载模板、载入演示、清空
│   │   ├── ImportPanel.tsx       # 导入页：VCF 上传/粘贴、表格上传、覆盖/追加模式
│   │   ├── ContactsTable.tsx     # 表格页：搜索高亮、筛选、排序、勾选、批量删除、导出入口
│   │   ├── ContactDrawer.tsx     # 联系人详情 / 编辑侧边抽屉，含 vCard 源码预览
│   │   ├── DeduplicateModal.tsx  # 查重合并弹窗
│   │   ├── ExportPanel.tsx       # 导出页：vCard 版本、编码、范围、文件名、实时预览
│   │   └── OfflineDownloadModal.tsx # 离线单文件版下载弹窗
│   └── utils/
│       ├── vcard.ts              # vCard 解析与生成、Quoted-Printable 编解码、姓名拆分
│       ├── tableFormat.ts        # 格式1 列定义、表格⇄联系人转换、Excel/CSV 导出（含 CSV 防误转换）、演示数据
│       ├── dedupe.ts             # 查重分组与合并
│       ├── encoding.ts           # 导入文件编码识别（UTF-8 / UTF-16 / GB18030）
│       ├── offlinePackager.ts    # 下载离线单文件 HTML
│       ├── vcard.test.ts         # 单元测试（node:test）
│       └── review.test.ts        # 单元测试（node:test）
├── miniprogram-vcf/              # 微信小程序「不求人VCF工具」（版本 1.0.5，说明见其中的 README.md / CHANGELOG.md）
├── docs/
│   ├── 使用说明.md                # 网页版用户教程
│   └── decisions/                # 决策记录
├── VCF表格互转离线封包版.html      # 早期提交的离线版（旧名称 “VCF Contacts Hub”；文件名保持不动）
├── r12-search-phone-highlight.png # 截图：电话搜索高亮
└── r13-standalone-html-working.png # 截图：离线版运行效果
```

## 离线单文件版是怎么构建的

`npm run build:standalone` 执行 `scripts/build-offline-html.js`：

1. 运行 `vite build`，从 `dist/assets/` 取出生成的 CSS；
2. 用 esbuild 把 `src/main.tsx` 打包成**经典 IIFE 脚本**（非 ES Module，避免 `file://` 下的跨域限制），图片以 data URL 内联；
3. 把 JS 中的 `<script`、`</script`、`<!--`、`<head`、`<body`、`<style`、`<title` 等转义为 `\x3C…`，防止破坏 HTML 结构；
4. 把 CSS 和 JS 内联进一个 HTML，写入 `public/standalone.html` 和 `dist/阚哥不求人转换器_离线版.html`。

网页里的「打包离线网页」按钮会请求 `/standalone.html` 并以 `阚哥不求人转换器_离线版.html` 下载；如果请求失败，则退而把当前页面的 DOM 序列化后下载。

> 提示：脚本先执行 `vite build`（会把**旧的** `public/standalone.html` 复制到 `dist/`），然后才写入新的 `public/standalone.html`。所以部署用的 `dist/standalone.html` 会落后一个版本，需要再执行一次 `npm run build` 或 `build:standalone` 才能同步。

## vCard 支持说明

**读取**（`parseVCard`）
- 支持 vCard 2.1 / 3.0 / 4.0 文本，自动处理折行（换行后跟空格/制表符）以及 Quoted-Printable 的 `=` 软换行
- 支持带分组前缀的属性（如 `item1.TEL`）；`EMAIL` 值前的 `mailto:` 会被去掉；转义的 `\;`、`\,` 不会被当作分隔符
- 识别的属性：`FN`、`N`（只取姓、名）、`TEL`、`EMAIL`、`ORG`（第一段为公司，其余段用 ` / ` 连接为部门）、`TITLE`、`ROLE`（部门为空时当作部门）、`ADR`、`NOTE`、`BDAY`、`URL`、`CATEGORIES` / `X-CATEGORIES` / `X-GROUP-MEMBERSHIP`、`PHOTO`（Base64 或 URL，仅用于头像显示）
- 电话类型：`WORK`→工作，`HOME`→住宅，`MAIN`→主要，`OTHER`→其他，其余默认手机；`tel:` 前缀会被去掉
- 支持 `ENCODING=QUOTED-PRINTABLE`；`CHARSET` 为 `GB2312` / `GBK` / `CP936` / `GB18030` 时按 GB18030 解码，其他字符集交给浏览器解码（不认识时按 UTF-8），未声明时按 UTF-8
- 只有 FN 没有 N 时自动拆分姓/名；姓名、电话、邮箱、公司全为空的卡片会被跳过；没有姓名的显示为“未命名联系人”
- 其他属性（如昵称 `NICKNAME`、各类 `X-` 扩展字段）会被忽略

**写出**（`generateVCard`）
- 每张卡片包含 `VERSION`、`PRODID:-//VCF Contacts Hub//CN`、`N`、`FN`，以及有值的 `ORG`、`TITLE`、`TEL`、`EMAIL`、`ADR`、`BDAY`、`URL`、`NOTE`、`CATEGORIES`；换行符为 CRLF
- 3.0：`TEL;TYPE=CELL,VOICE:…`、`EMAIL;TYPE=INTERNET,WORK:…`
- 2.1：`TEL;CELL;VOICE:…`；选择 Quoted-Printable 时，`N`、`FN`、`ORG`、`TITLE`、`NOTE` 以 `CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE` 写出
- 4.0：`TEL;TYPE="cell,voice";VALUE=uri:tel:…`、`EMAIL;TYPE=work:…`
- 电话号码导出时去掉空格和 `-`；生日中的 `/` 替换为 `-`；地址统一写成 `ADR;TYPE=WORK`
- 下载的 `.vcf` 文件编码为 UTF-8

## 格式1 表格

20 列，顺序固定：

`姓名`、`姓氏`、`名字`、`主要电话`、`电话类型1`、`备用电话`、`电话类型2`、`电子邮箱`、`公司/组织`、`部门`、`职位`、`详细地址`、`城市`、`省份/地区`、`邮编`、`国家`、`备注信息`、`生日`、`网址`、`分组标签`

导入时列名不区分大小写，并忽略空格、`_`、`-`、`/`、`\`、括号，还能识别常见别名，例如：

| 字段 | 可识别的列名（节选） |
| --- | --- |
| 姓名 | 姓名、联系人、名称、name、fullname |
| 主要电话 | 主要电话、手机、手机号、电话、移动电话、phone、mobile、tel |
| 备用电话 | 备用电话、电话2、座机、工作电话、phone2、telephone |
| 电子邮箱 | 电子邮箱、邮箱、email、mail |
| 公司/组织 | 公司、组织、企业、单位、company、organization |
| 详细地址 | 详细地址、地址、街道、address |
| 备注信息 | 备注、说明、note、remark、comment |
| 分组标签 | 分组、标签、群组、category、tags、group |

完整别名列表见 `src/utils/tableFormat.ts` 中的 `format1RowsToContacts`。

导入时的其他处理：
- 同一字段有多个别名列时，取第一个**非空**的列（例如“手机”列为空、“电话”列有值时用“电话”列）
- CSV 按 UTF-8（有无 BOM）/ UTF-16 / GB18030 自动识别编码，单元格按原文读取（前导 `0`、`+86` 不会被转成数字）
- `.xlsx` 中设为日期格式的单元格（如“生日”）会转成 `yyyy-mm-dd` 文本
- 本工具导出 CSV 时写入的 `="…"` 和前导 `'` 会被还原

## 已知限制

- 每个联系人只保留**一个地址**（多个 `ADR` 时取最后一个）；`N` 中的中间名、前缀、后缀会被丢弃
- 头像 `PHOTO` 只用于显示，**不会**导出到 vCard 或表格
- 表格中第 2 个及以后的电话都放在“备用电话”一格（`;` 分隔），但“电话类型2”只记录第 2 个电话的类型；重新导入时这些号码会按分隔符拆回多个电话，但都使用“电话类型2”的类型（默认工作）
- 所有邮箱合并在“电子邮箱”一列，用 `; ` 分隔
- 表格导入时所有邮箱类型都记为“工作”；`电话类型1` 只区分工作/住宅/手机，`电话类型2` 默认是“工作”（含“家/宅”时为住宅），所以“主要”“其他”等类型往返转换后会变化
- 表格导入时电话号码会去掉空格和 `-`；VCF 导入保留原样
- 同一次只处理一个文件（多选/拖入多个时只取第一个）；表格只使用一个工作表（第一个能识别出联系人的）
- 不支持 `.xls`，需要先另存为 `.xlsx` 或 CSV
- 追加导入不会自动去重，需要手动点「查重合并」
- 数据只保存在当前浏览器的 `localStorage`，换浏览器/清缓存后丢失

## 微信小程序「不求人VCF工具」

小程序版与网页版在同一仓库中维护，目录为 [`miniprogram-vcf/`](./miniprogram-vcf/)（原生微信小程序，纯 JS，无需 npm 构建）。

- 产品名：「不求人VCF工具」
- 当前版本：**1.0.5**（与网页版 **1.0.1** 不是同一个版本号）
- 导入微信开发者工具时，请选择 `miniprogram-vcf/` 这一层（含 `app.json`），而不是仓库根目录

详见 [miniprogram-vcf/README.md](./miniprogram-vcf/README.md)。

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源，版权所有 © 2026 kylecan-kch。
