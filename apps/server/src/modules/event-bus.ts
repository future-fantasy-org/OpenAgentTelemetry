import { EventEmitter } from 'node:events';
import type { TraceListItem } from '../repositories/trace-repository.js';
import type { AlertEvent } from '../repositories/alert-repository.js';
import type { AuditLog } from '../repositories/audit-repository.js';

// M12: 进程级事件总线，用于 SSE 实时推送
// 三类事件：trace:created（ingestion 后）、alert:triggered（规则命中后）、audit:logged（写操作记录后）
// 限制：单实例生效；多实例部署需替换为 Redis pub/sub
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(200);

export type TraceCreatedEvent = { projectId: string; trace: TraceListItem };
export type AlertTriggeredEvent = { projectId: string; event: AlertEvent };
export type AuditLoggedEvent = { log: AuditLog };
