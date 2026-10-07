import OpenAI from 'openai';
import * as taskboard from './taskboard';

export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_teams',
      description: "List the user's Taskboard teams (id, key, name).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_issues',
      description: 'List issues, optionally filtered by team key.',
      parameters: {
        type: 'object',
        properties: {
          teamKey: { type: 'string', description: 'Team key, e.g. "ENG". Omit to list across all teams.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_issue',
      description: 'Create a new issue in a given team.',
      parameters: {
        type: 'object',
        properties: {
          teamId: { type: 'string', description: 'Team id (get it from list_teams).' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['teamId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_workflow_states',
      description: 'List the workflow states (e.g. Todo, In Progress, Done) available for a team.',
      parameters: {
        type: 'object',
        properties: { teamKey: { type: 'string' } },
        required: ['teamKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_issue_state',
      description: 'Move an issue to a different workflow state (e.g. mark it Done).',
      parameters: {
        type: 'object',
        properties: {
          issueId: { type: 'string', description: 'Issue id (get it from list_issues).' },
          stateId: { type: 'string', description: 'Target workflow state id (get it from list_workflow_states).' },
        },
        required: ['issueId', 'stateId'],
      },
    },
  },
];

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  resourceAccessToken: string
): Promise<unknown> {
  switch (name) {
    case 'list_teams':
      return taskboard.listTeams(resourceAccessToken);
    case 'list_issues':
      return taskboard.listIssues(resourceAccessToken, args.teamKey as string | undefined);
    case 'create_issue':
      return taskboard.createIssue(resourceAccessToken, {
        teamId: args.teamId as string,
        title: args.title as string,
        description: args.description as string | undefined,
      });
    case 'list_workflow_states':
      return taskboard.listWorkflowStates(resourceAccessToken, args.teamKey as string);
    case 'update_issue_state':
      return taskboard.updateIssueState(resourceAccessToken, args.issueId as string, args.stateId as string);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
