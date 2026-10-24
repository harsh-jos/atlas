export type ToolEvent = {
  type: 'agent.tool' | 'agent.tool_result' | 'agent.tool_error';
  name: string;
  callId?: string | null;
  message?: string;
};

export type ToolCall = {
  key: string;
  name: string;
  callId?: string | null;
  status: 'running' | 'completed' | 'failed';
  message?: string;
  settled: boolean;
};

/** Fold the event stream into one row per invocation, including replayed events. */
export function toolCallsFromEvents(events: ToolEvent[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const event of events) {
    const existing = event.callId
      ? calls.find((call) => call.callId === event.callId)
      : undefined;
    const call = existing ?? (event.type !== 'agent.tool'
      ? calls.find((candidate) => candidate.name === event.name && !candidate.settled
        && (!event.callId || !candidate.callId))
      : undefined);

    if (call) {
      if (event.type === 'agent.tool_error') {
        call.status = 'failed';
        call.message = event.message;
      } else if (event.type === 'agent.tool_result') {
        // A failed tool can still emit a function response carrying its error.
        if (call.status !== 'failed') call.status = 'completed';
        call.settled = true;
      }
      call.callId ??= event.callId;
    } else {
      calls.push({
        key: event.callId || `tool-${calls.length}`,
        name: event.name,
        callId: event.callId,
        status: event.type === 'agent.tool' ? 'running'
          : event.type === 'agent.tool_error' ? 'failed' : 'completed',
        message: event.message,
        settled: event.type === 'agent.tool_result',
      });
    }
  }
  return calls;
}
