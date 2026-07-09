# M2+M3 实施计划：Tracing 完整版 + 评估闭环

> **目标：** Trace 详情可视化（树形 + waterfall）+ 数据集/评估打分闭环
>
> **架构：** 后端扩展 Repository + Fastify 路由；前端新增详情页和 dataset 页面；DB 新增 3 张表

---

## 文件结构

### 新建文件
- `apps/server/src/db/schema.ts` — 新增 scores/datasets/dataset_items 表定义（修改）
- `apps/server/drizzle/0001_eval_tables.sql` — 新增迁移 SQL
- `apps/server/src/repositories/score-repository.ts` — Score 仓储
- `apps/server/src/repositories/dataset-repository.ts` — Dataset 仓储
- `apps/server/src/routes/trace-detail.ts` — GET /api/traces/:id 路由
- `apps/server/src/routes/scores.ts` — Score 路由
- `apps/server/src/routes/datasets.ts` — Dataset CRUD 路由
- `apps/web/src/app/traces/[id]/page.tsx` — Trace 详情页（树形+瀑布图）
- `apps/web/src/app/datasets/page.tsx` — Dataset 列表页
- `apps/web/src/app/datasets/[id]/page.tsx` — Dataset 详情页
- `apps/web/src/lib/api.ts` — 扩展 API 客户端（修改）

### 修改文件
- `apps/server/src/app.ts` — 注册新路由
- `apps/server/src/repositories/trace-repository.ts` — 新增 getTraceDetail
- `apps/server/src/repositories/index.ts` — 导出新仓储
- `apps/web/src/app/page.tsx` — trace 列表加链接

---

## Task 1: DB 迁移 — scores / datasets / dataset_items 表

**修改** `schema.ts` 新增 3 张表 + 1 个 enum，写迁移 SQL。

## Task 2: Trace 详情 Repository + API

Repository 新增 `getTraceDetail(traceId)` 返回 trace + 所有 observations。新增路由 `GET /api/traces/:id`。

## Task 3: 前端 Trace 详情页（树形 + waterfall）

`/traces/[id]` 页面：用 observations 的 parentId 构建树，渲染缩进列表 + 横向时间条。

## Task 4: Score/Dataset Repository + API

Score：POST 打分、GET 查 trace 的分数。Dataset：CRUD。

## Task 5: 前端 Dataset 页面 + Score 展示

Dataset 列表 + 详情页，trace 详情页底部展示 scores。

## Task 6: 端到端验证

种子数据 + curl 测试 + 前端验证 + 提交推送。
