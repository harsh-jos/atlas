import { ChatPanel } from '@/components/chat/ChatPanel';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-[46rem] px-5 py-12 sm:px-8">
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">
            Learn something
          </span>
        </div>
        <h1 className="font-title text-[38px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">
          What are you curious about?
        </h1>
      </header>
      <ChatPanel />
    </div>
  );
}
