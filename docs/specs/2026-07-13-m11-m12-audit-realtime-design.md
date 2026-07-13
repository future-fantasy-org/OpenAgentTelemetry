# M11 审计日志 + M12 实时刷新与分页 Design Spec

> 关联：M10 spec `docs/specs/2026-07-13-m10-security-hardening-design.md` 第 24 行将"审计日志"留入 M11+。M9 spec 第 29-30 行将"实时刷新/SSE""Traces 列表分页"留入 M12。本规格同时落实两个里程碑。

## 1. 背景与动机

M1-M10 完成了 OAT 的核心可观测能力（Trace/Scores/Datasets/Prompts/Alerts/Stats）、鉴权链路（M6/M9）和安全加固（API Key 哈希化、IDOR 校验、限流，M10）。但仍有两个运维级短板：

1. **无审计日志** — 谁在什么时候做了什么操作（登录、创建/删除资源、上报数据、触发限流/鉴权失败），系统完全没有记录。安全事件回溯、合规审查、问题诊断均缺乏数据基础。M10 引入了限流和 IDOR 校验，但 429/404 事件只是"拒绝"了请求，没有留痕。
2. **无实时刷新与分页** — Traces 列表是"加载一次，手动 F5"的静态页；Alert Events、Audit 日志同理。数据量增大后（单项目轻松过万 trace），一次性全量加载既慢又无意义，需要分页。实时性上，告警触发后用户看不到，要刷新才知道，体验差。

M11 和 M12 一起补齐这两个短板，形成"可审计、可追踪、可扩展"的闭环。

## 2. 目标与非目标

### M11 审计日志

**目标：**
- 全量记录所有写操作（POST/PUT/PATCH/DELETE）+ 安全/异常事件（4xx/5xx）。
- 每次 ingestion 调用记一条（含 accepted 数、来源 IP、耗时）。
- 提供 `GET /api/audit/logs` 带筛选 + cursor 分页的查询 API。
- 前端 `/audit` 页面表格展示 + 行为/项目/时间范围筛选。

**非目标：**
- 审计日志的保留期管理（TTL、自动清理）— 自托管单 admin，当前不做。
- 日志导出（CSV / 外部 SIEM 对接）— 留后续。
- before/after 字段级 diff — onResponse 钩子无法获取原始数据，metadata 仅记录关键聚合值（accepted 数等）。

### M12 实时刷新与分页

**目标：**
- Cursor 分页：Traces 列表、Audit 日志列表支持 cursor 分页（默认 20 条/页）。
- SSE 实时推送：Traces 列表、Alert Events 时间线、Audit 日志页三处新增 Server-Sent Events 流。
- 新数据到达自动插入列表顶部，"加载更多"按钮用 cursor 追加历史。

**非目标：**
- Dashboard 页面的 SSE — 本期不做（用户未选）。
- WebSocket 双向通信 — 单向推送场景 SSE 足够，EventSource 原生支持。
- 多实例 Redis pub/sub — 当前单实例 EventEmitter 够用；文档标注为已知限制。
- 前端虚拟滚动 — 数据量未到需要虚拟列表的程度。

## 3. 决策与选型

### 3.1 审计日志捕获 — onResponse 钩子（M11）

**选型：Fastify `onResponse` 全局钩子，从 method+URL 派生 action。**

| 方案 | 取舍 |
|------|------|
| **A onResponse 钩子（选）** | 零侵入，不改动现有路由；自动覆盖所有接口；URL 模式派生 action 简单可测。缺点：无法获取 before/after diff（但 ingestion 的 accepted 数等可从 reply body 提取） |
| B 显式调用 | 每个路由手动 `auditLog({...})`。语义精确、可记 diff，但大量样板代码，新增路由易遗漏，长期维护成本高 |
| C 混合 | 钩子捕获 HTTP 级 + 关键路由显式补 diff。实现复杂度高，两套机制并行增加理解成本 |

**选 A 的理由**：审计的核心需求是"全覆盖、不遗漏"。onResponse 钩子在框架层兜底，新增路由自动纳入审计，零维护成本。before/after diff 是"锦上添花"，当前 YAGNI。

### 3.2 审计日志存储 — Postgres audit_logs 表

**选型：新建 `audit_logs` 表，JSONB metadata 字段存灵活数据。**

ingestion 高频调用（每秒可能几十次），单 admin 自托管场景下日增量可控（粗估 < 10 万/天）。PostgreSQL 单表千万级无压力。未来量级真上来再考虑分区表或独立存储。

### 3.3 SSE 推送感知 — EventEmitter 单例（M12）

**选型：进程内 `EventEmitter` 单例，插入数据后 emit 事件，SSE 端订阅。**

| 方案 | 取舍 |
|------|------|
| **A EventEmitter（选）** | 真正实时（毫秒级）；无 DB 轮询开销；实现简单。缺点：多实例部署需引入 Redis pub/sub（当前单实例 OK） |
| B Postgres LISTEN/NOTIFY | DB 级可靠性，多实例天然支持。但连接管理复杂，NOTIFY payload 限 8KB，需额外配置 |
| C 轮询 | SSE 端每 3-5s 查 DB。实现最简，但不是真正实时，且 DB 负担高 |

**选 A 的理由**：与现有 closure factory + DI 架构一致，EventEmitter 作为 module 单例注入各 Service。SSE 端点订阅后按 projectId 过滤。单实例部署完全够用；多实例扩展在文档中标注为已知限制。

### 3.4 分页 — Cursor（基于 created_at）（M12）

**选型：Cursor 分页，游标 = 最后一条记录的 `createdAt`。**

| 方案 | 取舍 |
|------|------|
| **A Cursor（选）** | `WHERE created_at < cursor ORDER BY created_at DESC LIMIT N`。性能稳定（索引扫描），数据量大时不会随页数变慢。不支持跳页（只能"下一页"），但 trace 场景跳页需求弱 |
| B Offset | `LIMIT N OFFSET M`。支持跳页，但深翻页（offset 大）性能差，且数据变化时 offset 会漂移 |
| C Keyset | 基于唯一键（如 id）。与 Cursor 类似但实现稍复杂，created_at 已够用 |

**选 A 的理由**：Trace 数据按时间倒序浏览，用户行为模式是"往下翻更老的数据"，cursor 完美匹配。offset 的跳页能力在 trace 场景几乎不用。

## 4. 数据模型变更（M11）

### 4.1 新表 `audit_logs`

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT,          -- JWT 中的 email；null = 未认证/系统
  actor_ip TEXT,             -- 来源 IP（X-Forwarded-For 或 req.ip）
  action TEXT NOT NULL,      -- 派生的动作标识（见 §4.2）
  method TEXT NOT NULL,      -- HTTP method
  path TEXT NOT NULL,        -- 请求路径（不含 query）
  resource_type TEXT,        -- 'project' / 'dataset' / 'prompt' / 'alert_rule' / 'trace' / null
  resource_id TEXT,          -- 目标资源 ID（URL 中提取）
  project_id UUID,           -- 关联项目（query/body 提取；全局事件为 null）
  status_code INT NOT NULL,  -- HTTP 状态码
  duration_ms INT,           -- 请求耗时（onResponse 时计算）
  metadata JSONB DEFAULT '{}'::jsonb  -- 灵活字段：accepted 数、user-agent、错误信息等
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_project_id ON audit_logs (project_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
```

### 4.2 Action 派生规则

| URL 模式 | method | status | action | resource_type |
|----------|--------|--------|--------|---------------|
| `/api/auth/login` | POST | 200 | `auth.login.success` | null |
| `/api/auth/login` | POST | 401 | `auth.login.failed` | null |
| `/api/auth/login` | POST | 429 | `auth.login.rate_limited` | null |
| `/api/auth/logout` | POST | 200 | `auth.logout` | null |
| `/api/public/ingestion` | POST | 200 | `ingestion` | null |
| `/api/public/ingestion` | POST | 401 | `ingestion.auth_failed` | null |
| `/api/datasets` | POST | 201 | `dataset.create` | dataset |
| `/api/datasets/:id` | PUT | 200 | `dataset.update` | dataset |
| `/api/datasets/:id` | DELETE | 200 | `dataset.delete` | dataset |
| `/api/prompts` | POST | 201 | `prompt.create` | prompt |
| `/api/alerts/rules` | POST | 201 | `alert_rule.create` | alert_rule |
| `/api/alerts/rules/:id` | PUT | 200 | `alert_rule.update` | alert_rule |
| `/api/alerts/rules/:id` | DELETE | 200 | `alert_rule.delete` | alert_rule |
| `/api/*` | GET | 404 | `idor.blocked` | null |

派生逻辑封装在 `deriveAction(method, path, statusCode)` 纯函数中，可单元测试。

### 4.3 过滤规则（onResponse 钩子）

```
跳过：url === '/health'
跳过：method ∈ {GET, HEAD, OPTIONS} 且 statusCode < 400  （成功的读操作）
记录：method ∈ {POST, PUT, PATCH, DELETE}                 （所有写操作）
记录：url.startsWith('/api/') 且 statusCode >= 400         （安全/异常事件）
```

### 4.4 迁移 SQL

```sql
-- 0006_audit_logs.sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT,
  actor_ip TEXT,
  action TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  project_id UUID,
  status_code INT NOT NULL,
  duration_ms INT,
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_project_id ON audit_logs (project_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
```

同步更新 `schema.ts` 和 `_journal.json`（idx 6）。

## 5. 审计日志实现（M11）

### 5.1 模块结构

```
src/modules/
├── event-bus.ts           # EventEmitter 单例（M12 复用）
src/modules/audit/
├── audit-logger.ts        # 派生 action + 写库 + emit 事件
├── derive-action.ts       # 纯函数：method+path+status → action
src/repositories/
├── audit-repository.ts    # log() + list(cursor) 
src/auth/
├── register-audit-hook.ts # onRequest 记 startTime + onResponse 记日志
src/routes/
├── audit.ts               # GET /api/audit/logs
```

### 5.2 AuditRepository 接口

```typescript
export interface IAuditRepository {
  log(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void>;
  list(params: {
    projectId?: string;
    action?: string;
    actorEmail?: string;
    from?: Date;
    to?: Date;
    cursor?: string;  // ISO timestamp
    limit?: number;   // default 50
  }): Promise<{ logs: AuditLog[]; nextCursor: string | null }>;
}
```

`log()` 内部：写入 DB 后 `eventBus.emit('audit:logged', { log })`（联动 M12 SSE）。

### 5.3 onResponse 钩子伪代码

```typescript
export function registerAuditHook(app: FastifyInstance, auditRepo: IAuditRepository) {
  app.addHook('onRequest', async (req) => {
    (req as any).__startTime = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const path = req.url.split('?')[0];
    const method = req.method;
    const status = reply.statusCode;

    if (path === '/health') return;
    if (!path.startsWith('/api/')) return;
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isError = status >= 400;
    if (!isMutation && !isError) return;

    const action = deriveAction(method, path, status);
    const actorEmail = (req as any).user?.email ?? null;
    const projectId = extractProjectId(req) ?? null;
    const duration = Date.now() - (req as any).__startTime;

    await auditRepo.log({
      actorEmail,
      actorIp: req.ip,
      action,
      method,
      path,
      resourceType: deriveResourceType(path),
      resourceId: extractResourceId(path),
      projectId,
      statusCode: status,
      durationMs: duration,
      metadata: extractMetadata(req, reply),
    });
  });
}
```

### 5.4 GET /api/audit/logs

```
GET /api/audit/logs?projectId=...&action=ingestion&actor=admin@...&from=2026-07-13&to=...&cursor=...&limit=50
→ 200 { logs: [{ id, createdAt, actorEmail, action, resourceType, resourceId, statusCode, durationMs, metadata }], nextCursor: "..." | null }
→ 400 { error: { code: 'INVALID_CURSOR', message: '...' } }
```

### 5.5 前端 `/audit` 页面

```
app/audit/
├── page.tsx          # 服务端首屏：读 cookie → 调 /api/audit/logs → 渲染表格
├── audit-filters.tsx # 客户端组件：项目选择 + action 下拉 + actor 搜索 + 日期范围
├── audit-table.tsx   # 客户端组件：表格 + 行展开 metadata + "加载更多"cursor 分页
└── audit-stream.tsx  # 客户端组件：EventSource 订阅新日志，顶部插入（M12 实现）
```

Nav 组件新增 `/audit` 链接。

## 6. SSE 实时刷新实现（M12）

### 6.1 EventBus 单例

```typescript
// src/modules/event-bus.ts
import { EventEmitter } from 'node:events';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(200); // 支持 200 个并发 SSE 连接

export type TraceCreatedEvent = { projectId: string; trace: TraceListItem };
export type AlertTriggeredEvent = { projectId: string; event: AlertEvent };
export type AuditLoggedEvent = { log: AuditLog };
```

### 6.2 事件触发点

| 触发位置 | 事件 | payload |
|----------|------|---------|
| `IngestionService.createTraceWithObservations` 之后 | `trace:created` | `{ projectId, trace }` |
| `AlertEvaluator.evaluate` 触发告警后 | `alert:triggered` | `{ projectId, event }` |
| `AuditRepository.log` 写入后 | `audit:logged` | `{ log }` |

### 6.3 SSE 端点

```
GET /api/stream/traces?projectId=...        → text/event-stream
GET /api/stream/alert-events?projectId=...  → text/event-stream
GET /api/stream/audit-logs                  → text/event-stream
```

均挂载在 `routes/stream.ts`，认证走 `registerAuthHook`（cookie JWT）。

SSE handler 模式：

```typescript
app.get('/api/stream/traces', { config: { rateLimit: false } }, async (req, reply) => {
  const projectId = (req.query as any).projectId;
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const handler = (event: TraceCreatedEvent) => {
    if (event.projectId !== projectId) return;
    reply.raw.write('data: ' + JSON.stringify(event.trace) + '\n\n');
  };
  eventBus.on('trace:created', handler);

  const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 30000);

  req.raw.on('close', () => {
    eventBus.off('trace:created', handler);
    clearInterval(heartbeat);
  });
});
```

关键点：
- `config: { rateLimit: false }` 豁免全局限流（长连接）。
- 心跳 30s 防 nginx/代理超时。
- `req.raw.on('close')` 清理 listener + interval，防内存泄漏。

### 6.4 Cursor 分页改造

`GET /api/traces` 和 `GET /api/audit/logs` 均改为 cursor 分页：

```
GET /api/traces?projectId=...&cursor=2026-07-13T12:00:00Z&limit=20
→ 200 { traces: [...], nextCursor: "2026-07-13T11:30:00Z" | null }
```

向后兼容：不传 cursor 返回最新 N 条 + nextCursor。旧前端不传 cursor 时自动取第一页，不破坏。

`trace-repository.ts` 的 `listTraces` 签名新增 `cursor?: string` 参数：

```sql
WHERE project_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
ORDER BY created_at DESC
LIMIT $3
```

`nextCursor` = 最后一条 trace 的 `createdAt`（若结果数 < limit 则为 null）。

### 6.5 前端 SSE 集成

```typescript
// traces 列表页
useEffect(() => {
  const es = new EventSource(`/api/stream/traces?projectId=${projectId}`);
  es.onmessage = (e) => {
    const trace = JSON.parse(e.data);
    setTraces(prev => [trace, ...prev].slice(0, 100)); // 顶部插入，最多保留 100 条
  };
  // 不在 onerror 中 close — EventSource 浏览器内置自动重连（指数退避）
  return () => es.close(); // 组件卸载时显式关闭
}, [projectId]);
```

三个页面（`/traces`、`/alerts`、`/audit`）统一模式：EventSource + 顶部插入 + cursor "加载更多"。

## 7. 测试策略

### 7.1 M11 单元测试

- `derive-action.test.ts`：覆盖所有 action 派生规则（§4.2 表）。
- `audit-repository.test.ts`：mock DB，测 `log()` 写入 + emit 事件、`list()` cursor 分页。
- `register-audit-hook.test.ts`：注入 mock auditRepo，测过滤规则（GET 跳过、4xx 记录、mutation 记录）。

### 7.2 M12 单元测试

- `event-bus.test.ts`：emit/on/off 基础功能。
- `stream-routes.test.ts`：app.inject 触发 SSE，验证 headers + data 格式（用 mock eventBus emit）。
- `trace-repository.test.ts`：cursor 分页查询。

### 7.3 集成验证脚本

`scripts/verify-m11-m12.sh`：
1. 登录 → 触发审计日志 → `/api/audit/logs` 能查到 `auth.login.success`。
2. 上报 ingestion → `/api/audit/logs?action=ingestion` 能查到新日志。
3. 错误密码登录 11 次 → 审计日志记录 `auth.login.failed` × N + `auth.login.rate_limited`。
4. `curl` 挂 SSE 流 → 触发 ingestion → SSE 收到 trace 推送。
5. Traces cursor 分页：取第一页 → nextCursor 不为 null → 用 cursor 取第二页 → 数据不重叠。

## 8. 已知限制

1. **单实例 SSE** — EventEmitter 是进程内单例。多实例部署时 SSE 只能收到本实例的事件，需引入 Redis pub/sub 作为消息总线。文档标注，后续扩展。
2. **审计日志无 TTL** — 自托管单 admin 假设增量可控。日增量过万后可加按月分区或定期 `DELETE WHERE created_at < now() - interval '90 days'`。
3. **EventSource 无自定义 header** — 浏览器 EventSource 不支持设置 Authorization header。依赖同域 cookie 鉴权（M9 已实现 SSR cookie 转发，同源场景无问题）。跨域 SSE 需额外处理。
4. **before/after diff 不记录** — onResponse 钩子无法获取 mutation 前的原始数据。如未来需要，改用显式调用方案（§3.1 方案 B）补充。
5. **无 OTLP 兼容** — OAT 不考虑与 OpenTelemetry/OTLP 的兼容，专注自家 SDK 生态。

## 9. 实现顺序

M11 先于 M12（M12 的 audit SSE 依赖 M11 的 audit_logs 表和 eventBus）。

1. M11 Task 1：schema + 迁移 + AuditRepository + derive-action
2. M11 Task 2：onResponse 钩子注册 + 注入 app.ts
3. M11 Task 3：GET /api/audit/logs 路由
4. M11 Task 4：前端 /audit 页面（无 SSE，先静态）
5. M11 Task 5：verify-m11 脚本 + 测试
6. M12 Task 1：EventBus 单例 + 三处 emit 触发点
7. M12 Task 2：SSE 路由 + 限流豁免
8. M12 Task 3：Traces cursor 分页改造（API + 前端）
9. M12 Task 4：前端 SSE 集成（三页面）
10. M12 Task 5：verify-m12 脚本 + 测试 + README 更新
