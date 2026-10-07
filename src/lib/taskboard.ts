// Client for the self-hosted Taskboard0 demo resource app (a tiny
// Linear-style issue tracker), used instead of the real Linear API because
// Linear's own XAA support is gated behind a SAML SSO plan tier.
const TASKBOARD_API_URL = process.env.TASKBOARD_API_URL ?? 'http://localhost:3000';

export class TaskboardApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Taskboard API error (${status}): ${JSON.stringify(body)}`);
    this.name = 'TaskboardApiError';
  }
}

async function taskboardFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${TASKBOARD_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : null),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new TaskboardApiError(response.status, json);
  }

  return json as T;
}

export type Team = { id: string; key: string; name: string };
export type WorkflowState = { id: string; name: string; teamId: string; order: number };
export type Issue = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  teamId: string;
  stateId: string;
  updatedAt: string;
};

export async function listTeams(accessToken: string): Promise<Team[]> {
  const data = await taskboardFetch<{ teams: Team[] }>(accessToken, '/api/v1/teams');
  return data.teams;
}

export async function listIssues(accessToken: string, teamKey?: string): Promise<Issue[]> {
  const query = teamKey ? `?team=${encodeURIComponent(teamKey)}` : '';
  const data = await taskboardFetch<{ issues: Issue[] }>(accessToken, `/api/v1/issues${query}`);
  return data.issues;
}

export async function createIssue(
  accessToken: string,
  input: { teamId: string; title: string; description?: string }
): Promise<Issue> {
  const data = await taskboardFetch<{ issue: Issue }>(accessToken, '/api/v1/issues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.issue;
}

export async function updateIssueState(
  accessToken: string,
  issueId: string,
  stateId: string
): Promise<Issue> {
  const data = await taskboardFetch<{ issue: Issue }>(accessToken, `/api/v1/issues/${issueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ stateId }),
  });
  return data.issue;
}

export async function listWorkflowStates(
  accessToken: string,
  teamKey: string
): Promise<WorkflowState[]> {
  const data = await taskboardFetch<{ workflowStates: WorkflowState[] }>(
    accessToken,
    `/api/v1/workflow-states?team=${encodeURIComponent(teamKey)}`
  );
  return data.workflowStates;
}
