import { Check, CircleMinus, LoaderCircle, X } from 'lucide-react';
import { toolCallsFromEvents, type ToolEvent } from '@/lib/chat-activity';

/** Describe the agent's work in the reader's language. */
const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: 'Finding saved explanations',
  researcher: 'Checking sources',
  generate_image: 'Creating and checking an illustration',
  read_source_page: 'Reading source evidence',
  calculate: 'Checking the calculation',
  create_artifact: 'Building your artifact',
  update_artifact: 'Revising your artifact',
  inspect_concept_graph: 'Looking at connected ideas',
  remember_concept: 'Keeping this idea',
  connect_concepts: 'Connecting ideas',
  read_saved_explanation: 'Reading a saved explanation',
  save_explanation: 'Saving your explanation',
  revise_saved_explanation: 'Updating your explanation',
};

export function ChatActivity({ events, pending }: { events: ToolEvent[]; pending: boolean }) {
  const calls = toolCallsFromEvents(events);
  if (!pending && calls.length === 0) return null;

  return (
    <div className="space-y-2" aria-label="Agent activity">
      {calls.length > 0 && (
        <details className="rounded-lg border border-black/5 px-3 py-2 text-xs text-muted" open={pending}>
          <summary className="cursor-pointer">Tool activity</summary>
          <ol className="mt-2 space-y-1.5" aria-live="polite">
            {calls.map((call) => {
              const status = call.status === 'running' && !pending ? 'stopped' : call.status;
              const Icon = status === 'running' ? LoaderCircle
                : status === 'completed' ? Check : status === 'failed' ? X : CircleMinus;
              return (
                <li key={call.key} className={`flex items-start gap-2 ${status === 'failed' ? 'text-danger' : ''}`}>
                  <Icon
                    className={`mt-px size-3.5 shrink-0 ${status === 'running' ? 'motion-safe:animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="sr-only">{status === 'running' ? 'In progress' : status === 'completed' ? 'Completed' : status === 'failed' ? 'Failed' : 'Stopped'}: </span>
                    {TOOL_LABELS[call.name] ?? call.name}
                    {call.message ? ` — ${call.message}` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
      {pending && (
        <p role="status" className="thinking-heartbeat text-xs text-faint">Thinking…</p>
      )}
    </div>
  );
}
