import { describe, it, expect } from 'vitest';
import { deriveAction, deriveResourceType, extractResourceId } from '../src/modules/derive-action.js';

describe('deriveAction', () => {
  it('POST /api/auth/login 200 → auth.login.success', () => {
    expect(deriveAction('POST', '/api/auth/login', 200)).toBe('auth.login.success');
  });
  it('POST /api/auth/login 401 → auth.login.failed', () => {
    expect(deriveAction('POST', '/api/auth/login', 401)).toBe('auth.login.failed');
  });
  it('POST /api/auth/login 429 → auth.login.rate_limited', () => {
    expect(deriveAction('POST', '/api/auth/login', 429)).toBe('auth.login.rate_limited');
  });
  it('POST /api/auth/logout 200 → auth.logout', () => {
    expect(deriveAction('POST', '/api/auth/logout', 200)).toBe('auth.logout');
  });
  it('POST /api/public/ingestion 200 → ingestion', () => {
    expect(deriveAction('POST', '/api/public/ingestion', 200)).toBe('ingestion');
  });
  it('POST /api/public/ingestion 401 → ingestion.auth_failed', () => {
    expect(deriveAction('POST', '/api/public/ingestion', 401)).toBe('ingestion.auth_failed');
  });
  it('POST /api/datasets 201 → dataset.create', () => {
    expect(deriveAction('POST', '/api/datasets', 201)).toBe('dataset.create');
  });
  it('PUT /api/datasets/abc 200 → dataset.update', () => {
    expect(deriveAction('PUT', '/api/datasets/abc', 200)).toBe('dataset.update');
  });
  it('DELETE /api/datasets/abc 200 → dataset.delete', () => {
    expect(deriveAction('DELETE', '/api/datasets/abc', 200)).toBe('dataset.delete');
  });
  it('POST /api/prompts 201 → prompt.create', () => {
    expect(deriveAction('POST', '/api/prompts', 201)).toBe('prompt.create');
  });
  it('POST /api/alerts/rules 201 → alert_rule.create', () => {
    expect(deriveAction('POST', '/api/alerts/rules', 201)).toBe('alert_rule.create');
  });
  it('PUT /api/alerts/rules/abc 200 → alert_rule.update', () => {
    expect(deriveAction('PUT', '/api/alerts/rules/abc', 200)).toBe('alert_rule.update');
  });
  it('DELETE /api/alerts/rules/abc 204 → alert_rule.delete', () => {
    expect(deriveAction('DELETE', '/api/alerts/rules/abc', 204)).toBe('alert_rule.delete');
  });
  it('GET /api/traces 404 → idor.blocked', () => {
    expect(deriveAction('GET', '/api/traces', 404)).toBe('idor.blocked');
  });
  it('未知路由 fallback', () => {
    expect(deriveAction('POST', '/api/unknown', 200)).toBe('api.unknown');
  });

  it('POST /api/eval/providers 201 → eval_provider.create', () => {
    expect(deriveAction('POST', '/api/eval/providers', 201)).toBe('eval_provider.create');
  });
  it('DELETE /api/eval/providers/abc 204 → eval_provider.delete', () => {
    expect(deriveAction('DELETE', '/api/eval/providers/abc', 204)).toBe('eval_provider.delete');
  });
  it('POST /api/eval/evaluators 201 → evaluator.create', () => {
    expect(deriveAction('POST', '/api/eval/evaluators', 201)).toBe('evaluator.create');
  });
  it('POST /api/eval/jobs 201 → eval_job.create', () => {
    expect(deriveAction('POST', '/api/eval/jobs', 201)).toBe('eval_job.create');
  });
  it('POST /api/eval/jobs/abc/cancel 200 → eval_job.cancel', () => {
    expect(deriveAction('POST', '/api/eval/jobs/abc/cancel', 200)).toBe('eval_job.cancel');
  });
});

describe('deriveResourceType', () => {
  it('/api/datasets → dataset', () => {
    expect(deriveResourceType('/api/datasets')).toBe('dataset');
  });
  it('/api/prompts → prompt', () => {
    expect(deriveResourceType('/api/prompts')).toBe('prompt');
  });
  it('/api/alerts/rules → alert_rule', () => {
    expect(deriveResourceType('/api/alerts/rules')).toBe('alert_rule');
  });
  it('/api/auth/login → null', () => {
    expect(deriveResourceType('/api/auth/login')).toBeNull();
  });
});

describe('extractResourceId', () => {
  it('/api/datasets/abc-123 → abc-123', () => {
    expect(extractResourceId('/api/datasets/abc-123')).toBe('abc-123');
  });
  it('/api/alerts/rules/abc/test → abc（取第一段 path param）', () => {
    expect(extractResourceId('/api/alerts/rules/abc/test')).toBe('abc');
  });
  it('/api/datasets（无 id）→ null', () => {
    expect(extractResourceId('/api/datasets')).toBeNull();
  });
});
