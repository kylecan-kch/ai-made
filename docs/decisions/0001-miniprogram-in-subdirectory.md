# ADR 0001：微信小程序放在本仓库 `miniprogram-vcf/` 子目录

- 状态：已采纳
- 日期：2026-11-02
- 决策人：大力
- 目录统一：2026-11-10，目录名确定为 `miniprogram-vcf/`（曾考虑过 `miniprogram/`）
- 产品名：「不求人VCF工具」；当前版本 1.0.5（与网页版 1.0.1 的版本号独立）

## 背景

- 网页版（本仓库根目录，React + TypeScript + Vite，「阚哥不求人转换器」，版本 1.0.1）提供 VCF ↔ 表格互转。
- 另有一个由网页版移植的原生微信小程序（纯 JS，无需 npm 构建），把核心转换逻辑逐函数移植成了 JS。
- 两端的核心转换逻辑需要同步维护：一端修复解析问题，另一端通常也要跟着改。

## 决策

小程序代码放在本仓库的 `miniprogram-vcf/` 子目录，与网页版共用一个仓库，不单独建库。

2026-11-02 决定放入本仓库子目录；2026-11-10 将目录名统一为 `miniprogram-vcf/`（与当时已合并进发布分支 `ready-for-everything` 的实际路径一致）。

## 理由

- 网页版和小程序的修改可以放在同一个提交或 PR 里，便于对照和审查转换逻辑的移植。
- 决策记录与网页版 README 可互相引用；小程序的版本与更新记录单独维护在 `miniprogram-vcf/package.json` 与 `miniprogram-vcf/CHANGELOG.md`，以免与网页版版本号混用。
- 小程序不依赖 npm 构建，放在子目录不会干扰网页版的 Vite 构建与依赖。

## 影响

- 在微信开发者工具中导入项目时，目录应选择 `miniprogram-vcf/`（含 `app.json` 的那一层），而不是仓库根目录。
- 小程序的测试（`node --test`）在 `miniprogram-vcf/` 目录下单独运行，与网页版测试分开。
- 根目录 `.gitignore` 已忽略 `node_modules/`、`dist/` 等常见生成目录。

## 已解决的事项

- 代码已迁入 `miniprogram-vcf/`。
- 小程序变更记录写在 `miniprogram-vcf/CHANGELOG.md`，不在仓库根目录另建 CHANGELOG。
