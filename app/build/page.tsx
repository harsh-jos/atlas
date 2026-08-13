import { PageContainer, PageHeader } from '@/components/layout/PageHeader';
import { BuildForm } from '@/components/build/BuildForm';
import { apiGet } from '@/lib/api';
import type { LlmProvider } from '@/lib/api-types';

export const dynamic = 'force-dynamic';

export default async function BuildPage() {
  const providers = await apiGet<LlmProvider[]>('/llm/providers');

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Build"
        title="Build a knowledge base"
        description="Point Atlas at a topic's official documentation. It reads the docs against your goal and writes a set of articles you can actually learn from."
      />
      <BuildForm providers={providers} />
    </PageContainer>
  );
}
