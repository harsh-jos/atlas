import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function NewChatPage({searchParams}:{searchParams:Promise<{question?:string}>}) {
  const {question}=await searchParams;
  redirect(`/chat/${randomUUID()}${question?`?question=${encodeURIComponent(question.slice(0,7000))}`:""}`);
}
