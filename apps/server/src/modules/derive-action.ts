export function deriveAction(method: string, path: string, statusCode: number): string {
  if (path === '/api/auth/login') {
    if (statusCode === 429) return 'auth.login.rate_limited';
    if (statusCode >= 400) return 'auth.login.failed';
    return 'auth.login.success';
  }
  if (path === '/api/auth/logout') return 'auth.logout';
  if (path === '/api/public/ingestion') {
    if (statusCode >= 400) return 'ingestion.auth_failed';
    return 'ingestion';
  }

  if (statusCode === 404 && method === 'GET' && path.startsWith('/api/')) {
    return 'idor.blocked';
  }

  const resource = deriveResourceType(path);
  if (resource) {
    const hasId = extractResourceId(path) !== null;
    let verb: string;
    if (method === 'POST') verb = 'create';
    else if (method === 'PUT' || method === 'PATCH') verb = hasId ? 'update' : 'create';
    else if (method === 'DELETE') verb = 'delete';
    else verb = 'access';
    return `${resource}.${verb}`;
  }

  return 'api.unknown';
}

export function deriveResourceType(path: string): string | null {
  if (path.startsWith('/api/datasets')) return 'dataset';
  if (path.startsWith('/api/prompts')) return 'prompt';
  if (path.startsWith('/api/alerts/rules')) return 'alert_rule';
  if (path.startsWith('/api/alerts')) return 'alert_event';
  if (path.startsWith('/api/traces')) return 'trace';
  if (path.startsWith('/api/projects')) return 'project';
  return null;
}

export function extractResourceId(path: string): string | null {
  const resourceTypes = ['datasets', 'prompts', 'rules', 'traces', 'projects'];
  for (const rt of resourceTypes) {
    const regex = new RegExp(`/${rt}/([^/]+)`);
    const match = path.match(regex);
    if (match) return match[1];
  }
  return null;
}
