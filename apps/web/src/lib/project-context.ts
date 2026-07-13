import 'server-only';
import { listProjects } from './api.server';
import type { ProjectListItem } from './api.shared';

export async function getCurrentProjectId(
  sp: URLSearchParams,
): Promise<{ projectId: string; projects: ProjectListItem[] }> {
  const { projects } = await listProjects();
  if (projects.length === 0) {
    throw new Error('当前没有可访问的项目，请先创建项目。');
  }
  const fromUrl = sp.get('projectId') ?? '';
  const matched = projects.find((p) => p.id === fromUrl);
  return {
    projectId: matched ? matched.id : projects[0].id,
    projects,
  };
}
