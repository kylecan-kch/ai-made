# 不求人VCF工具

微信小程序 · VCF 通讯录 ↔ 表格互转 · 版本 **1.0.5**

由 [kylecan-kch/ai-made](https://github.com/kylecan-kch/ai-made) 网页版（「阚哥不求人转换器」，网页版版本 1.0.1）移植而来的**原生微信小程序**（纯 JS，无需 npm 构建）。产品名为「不求人VCF工具」。小程序与网页版的版本号独立维护，当前小程序版本见 [`package.json`](./package.json)，更新记录见 [CHANGELOG.md](./CHANGELOG.md)。

核心转换逻辑（`src/utils/vcard.ts`、`src/utils/tableFormat.ts`、`src/utils/dedupe.ts` / `DeduplicateModal.tsx` 中的查重合并）已逐函数移植到 `utils/`，并去掉了全部浏览器依赖（DOM / FileReader / Blob / TextDecoder）。

## 一、导入微信开发者工具

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版即可）。
2. 获取本目录：
   - 已克隆本仓库：直接使用仓库中的 `miniprogram-vcf/` 文件夹（含 `app.json` 的那一层，不要选仓库根目录）；
   - 若拿到的是单独打包的 `miniprogram-vcf.zip`：解压后同样选择里面带 `app.json` 的那一层。
3. 打开开发者工具 → **小程序** → 左上 **“+” / 导入项目**。
4. **目录**：选择上一步的 `miniprogram-vcf` 文件夹。
5. **AppID**：
   - 只想本地体验：选择 **“测试号”**（或保持 `touristappid` 游客模式）；
   - 要真机预览/上传发布：填写你自己在 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册的小程序 AppID（也可以之后在 `project.config.json` 里改 `appid`）。
6. 后端服务选 **“不使用云服务”**，点击 **导入**，即可在模拟器中看到页面。
7. 首次打开如果提示“基础库版本”，选择一个 ≥ 2.16.0 的版本即可（右上角“详情 → 本地设置 → 调试基础库”）。

> 无需 `npm install`、无需“构建 npm”。Excel 解析库已内置在 `utils/xlsx.mini.min.js`。

## 二、功能

| 功能 | 说明 |
| --- | --- |
| 选择文件导入 | `wx.chooseMessageFile` 从聊天记录选择 `.vcf / .vcard / .csv / .xlsx / .txt`（**不支持旧版 `.xls`**：选到时会提示用 Excel/WPS“另存为 .xlsx”后再导入） |
| 编码自动识别 | UTF-8、UTF-8 BOM、UTF-16、**GBK**（老安卓/老 Excel 导出的中文 CSV 也不乱码） |
| vCard 解析 | 2.1 / 3.0 / 4.0；Quoted-Printable（含跨行软换行）；`CHARSET=UTF-8/GBK`；多个 TEL/EMAIL；ORG;部门；ADR；NOTE；BDAY；URL；CATEGORIES；PHOTO；iOS `item1.TEL` 分组前缀 |
| 中文姓名 | 只有全名时自动拆分姓/名，支持 40 个复姓（欧阳、诸葛、司马…） |
| 表格识别 | 标准“格式1” 20 列，且兼容各种中英文表头别名（姓名/联系人/name、手机/电话/mobile、公司/单位/company…） |
| 粘贴导入 | 直接粘贴 VCF 文本或 CSV 文本，也可一键读取剪贴板 |
| 导入方式 | 替换现有 / 追加到现有 |
| 预览 | 列表视图（点开看详情、点号码拨号）与“格式1”表格视图（横向滚动）；搜索姓名/号码/公司/邮箱/标签；超过 100 条分页加载 |
| 整理 | 勾选 / 全选、删除、清空、**查重合并**（号码或姓名相同 → 合并号码、邮箱、标签、备注） |
| 单个联系人 | **存入手机通讯录**（`wx.addPhoneContact`）、复制 vCard |
| 导出 VCF | vCard 3.0 / 2.1 / 4.0，UTF-8 或 Quoted-Printable（2.1） |
| 导出表格 | CSV（带 UTF-8 BOM，Excel 打开不乱码；号码/邮编不会变成科学计数法或丢前导 0、`+`；防公式注入，见下文）、Excel `.xlsx`（与原版相同的列宽与工作表名） |
| 导出范围 | 全部 / 仅已勾选 |
| 发送与打开 | `wx.shareFileMessage` 发给好友或“文件传输助手”；xlsx 可 `wx.openDocument` 预览；VCF/CSV 可复制文本 |
| 标准模板 | 一键生成带示例数据的“格式1”标准 Excel 模板 |
| 本地缓存 | 联系人分片保存在小程序本地存储，下次打开仍在（典型联系人可存约 7 万多条，见“限制与说明”）；数据不上传任何服务器 |

## 三、目录结构

```
miniprogram-vcf/
├── app.js / app.json / app.wxss
├── project.config.json      # appid: touristappid，tests/ 与 README 已在 packOptions 中排除
├── sitemap.json
├── pages/index/             # 主页面：导入 → 预览整理 → 导出
│   ├── index.js / index.json / index.wxml / index.wxss
├── utils/
│   ├── vcard.js             # ← vcard.ts：parseVCard / generateVCard / QP 编解码 / 拆分姓名
│   ├── table.js             # ← tableFormat.ts：格式1 列、行↔联系人、CSV 读写、xlsx 读写、演示数据
│   ├── dedupe.js            # ← DeduplicateModal.tsx 的查重/合并逻辑
│   ├── storage.js           # 本地缓存：精简格式 + 按 ~700KB 分片存储（突破单 key 1MB 限制）、旧缓存迁移、损坏回退
│   ├── encoding.js          # 纯 JS 的 UTF-8 编解码、GBK 解码、编码自动识别（替代 TextDecoder）
│   ├── cp936.js             # GBK 码表（codepage，Apache-2.0）
│   ├── xlsx.mini.min.js     # SheetJS 0.20.3 精简版（Apache-2.0，官方 cdn.sheetjs.com 发布；已修复 CVE-2023-30533 / CVE-2024-22363）
│   └── xlsx.LICENSE.txt
└── tests/                   # Node 测试（不会被打包进小程序）
    ├── utils.test.js        # 工具函数测试（在“无 Buffer/TextDecoder/DOM”的沙箱中运行）
    ├── vcard.edge.test.js   # vCard 2.1/3.0/4.0 边界（转义、折行、QP、嵌套、PHOTO、大文件、GB18030 四字节）
    ├── storage.test.js      # 分片缓存（模拟 1MB/key、10MB 总量限制）：3k/2万/5万往返、照片、迁移、损坏、缩减
    ├── csv.excel.test.js    # CSV 的 Excel 兼容（="..." 号码、公式注入转义、RFC 4180）与导入往返
    ├── table.encoding.edge.test.js # CSV/xlsx/编码边界
    ├── xlsx.vendor.test.js  # 内置 SheetJS 版本、沙箱加载、xlsx 往返、CVE-2023-30533 回归（fixtures/ 下为恶意样本）
    ├── page.smoke.test.js   # 用模拟 wx 跑通页面完整流程
    ├── validate.test.js     # JSON、页面文件、WXML 闭合、事件函数、禁用 API、包体积校验
    └── sandbox.js
```

运行测试（需要 Node 18+）：

```bash
cd miniprogram-vcf
node --test tests/*.test.js
```

## 四、在手机上把 VCF 导入通讯录

小程序无法直接批量写入系统通讯录（微信只开放了单个联系人的 `wx.addPhoneContact`）。批量导入的做法：

1. 导出格式选 **VCF**，点“生成文件” → “发送给好友 / 文件传输助手”；
2. 在手机微信里打开该文件 → 右上角 **“用其他应用打开”** → 选择“通讯录 / 联系人”即可批量导入；
3. 安卓老机型若中文乱码，导出时选 **vCard 2.1 + Quoted-Printable**。

## 五、限制与说明

- **`wx.chooseMessageFile` 只能从微信聊天记录中选文件**，不能直接浏览手机文件管理器。请先把文件发到“文件传输助手”。
- **`wx.shareFileMessage`（发送文件）需要基础库 ≥ 2.16.0**，在开发者工具模拟器里可能无法真正弹出会话选择，请用 **“预览”扫码或“真机调试”** 测试；`wx.chooseMessageFile` 在模拟器中会弹出电脑的文件选择框，可以正常测试导入。
- `wx.addPhoneContact` 在模拟器中只会打印调用，需真机测试；一次只能添加一个联系人。
- `wx.openDocument` 只支持 doc/xls/xlsx/ppt/pdf 等，所以只有 xlsx 显示“打开预览”；VCF/CSV 请发送或复制。
- 导出文件写在 `wx.env.USER_DATA_PATH`（小程序本地用户目录，上限约 200MB）；每次导出会自动清理上一次的导出文件。
- 本地缓存：微信限制单个 key 1MB、总量 10MB。联系人以精简格式（字段名缩写、空字段不存）按约 700KB 分片保存，元数据记在 `vcf_contacts_v2_meta`。实测典型联系人（姓名+1~2 个号码+部分邮箱/公司）约 130 字节/人：3000 条 0.37MB、2 万条 2.5MB、5 万条 6.3MB，按此推算上限约 7.8 万条；字段很全的联系人（多号码、地址、备注）约 1.9 万条。超过 10MB 时会提示“联系人过多”，不影响当次使用，但下次打开看到的是上一次成功保存的数据（不会被写成半份）；照片过多时会自动去掉照片再保存并提示。旧版本的单 key 缓存首次打开会自动迁移并删除。
- CSV 导出与 Excel：长数字号码（≥11 位）、以 0 或 `+` 开头的号码/邮编写成 `="13800138000"`，Excel 会按文本原样显示（不会变成 1.38E+10、不丢前导 0/`+`）；本小程序导入时会自动去掉这层包装。其余以 `= + - @`、Tab、回车开头的单元格会加前导 `'` 防止被当成公式执行（导入时去掉）。Excel 再“另存为 CSV”后包装会消失，仍可正常导入。
- 导出的文件编码均为 UTF-8；不提供 GBK 编码导出（GBK 仅用于读取）。
- 联系人照片（PHOTO）：解析阶段仍能读出，但**导入时会被丢弃**（避免撑爆小程序本地缓存：单 key 1MB、总量 10MB）。列表中不显示，也不写入导出的 VCF/表格。网页版则会保留头像用于显示，同样不导出。
- 与网页版相比**未移植**：联系人编辑抽屉（逐字段编辑/新建）、离线 HTML 打包下载、分组标签筛选面板。这些不属于核心转换功能，可后续按需加。网页版 `package.json` 中的 AI(Gemini) 相关依赖在源码中并未使用，小程序也未引入。
- 正式发布到微信时，“联系人/通讯录”类小程序可能需要在后台补充用户隐私保护指引（涉及 `addPhoneContact`、剪贴板、选择文件等接口）。

## 六、与网页版的差异说明

以下能力在小程序移植时已实现；**网页版 1.0.1**（当前 `ready-for-everything` 中的网页代码）也已具备对应实现，不宜再写成“原版仍有这些缺陷”：

- Quoted-Printable 的跨行软换行（行尾 `=`）能正确拼接；
- 支持 iOS 导出的 `item1.TEL`、`item2.EMAIL` 分组前缀；
- `TYPE=CELL;TYPE=VOICE` 这类重复参数会合并而不是覆盖；
- 超过 2 个电话号码时，表格“备用电话”列保留第 3 个及以后的号码；
- 查重合并按连通分量合并，避免同一联系人同时“号码重复”和“姓名重复”时被合并出两份；
- 读取文件时自动识别 GBK/UTF-16 编码。

仍与网页版不同的主要之处见上一节（未移植的编辑抽屉 / 离线 HTML / 分组筛选，以及 PHOTO 在导入时丢弃）。
