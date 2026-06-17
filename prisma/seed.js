import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding and configuration...');

  // 1. Create the GIN index on the tags column if it doesn't exist
  try {
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS entry_tags_gin ON "Entry" USING GIN (tags);');
    console.log('✔ GIN index on entry tags checked/created.');
  } catch (error) {
    console.error('⚠ Failed to create GIN index on tags:', error);
  }

  // Clear existing data (in reverse order of dependencies)
  await prisma.relation.deleteMany({});
  await prisma.source.deleteMany({});
  await prisma.entry.deleteMany({});
  await prisma.collection.deleteMany({});
  console.log('✔ Cleared existing database records.');

  // 2. Create Collections
  const dlCollection = await prisma.collection.create({
    data: {
      name: 'Deep Learning',
      slug: 'deep-learning',
      description: 'Foundational concepts, architectures, and mathematical formulations of deep neural networks.',
      color: '#0066cc',
    },
  });

  const llmCollection = await prisma.collection.create({
    data: {
      name: 'Language Models',
      slug: 'language-models',
      description: 'Autoregressive transformers, pre-training objectives, fine-tuning, and alignment techniques.',
      color: '#50e3c2',
    },
  });

  const cvCollection = await prisma.collection.create({
    data: {
      name: 'Computer Vision',
      slug: 'computer-vision',
      description: 'Convolutional networks, vision transformers, image generation, and object detection.',
      color: '#7928ca',
    },
  });

  const pythonCollection = await prisma.collection.create({
    data: {
      name: 'Python',
      slug: 'python',
      description: 'Language fundamentals, standard library references, and practical patterns.',
      color: '#2563eb',
    },
  });

  const adkCollection = await prisma.collection.create({
    data: {
      name: 'Google ADK',
      slug: 'google-adk',
      description: 'Agent Development Kit concepts, workflows, and implementation notes.',
      color: '#16a34a',
    },
  });

  const philosophyCollection = await prisma.collection.create({
    data: {
      name: 'Marcus Aurelius',
      slug: 'marcus-aurelius',
      description: 'Meditations and Stoic reflections captured for slow, repeated reading.',
      color: '#a16207',
    },
  });

  console.log('✔ Created collections.');

  // 3. Create Entries
  const entryAttention = await prisma.entry.create({
    data: {
      title: 'Attention Mechanism',
      slug: 'attention-mechanism',
      summary: 'An input processing technique that allows neural networks to focus on specific parts of the input sequence when predicting each output element.',
      body: `### Background

Introduced by Bahdanau et al. (2014) and later refined in Vaswani et al. (2017), the **attention mechanism** has revolutionized natural language processing and deep learning. It addresses the information bottleneck of traditional encoder-decoder architectures, where a sequence is compressed into a single fixed-length vector.

### Mathematical Formulation

Given Query $Q$, Key $K$, and Value $V$ vectors, the scaled dot-product attention is defined as:

$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$

Where $d_k$ is the dimensionality of the key vectors. The scaling factor $1/\\sqrt{d_k}$ is critical for preventing the dot products from growing large in magnitude at high dimensions, which would push the softmax function into regions with extremely small gradients.

### Key Types of Attention

- **Self-Attention:** Relates different positions of a single sequence to compute a representation of the same sequence.
- **Cross-Attention:** Connects an encoder output (keys/values) to a decoder input (queries).
- **Causal Attention:** Masks subsequent tokens to prevent looking ahead during autoregressive generation.`,
      originalBody: `Introduced by Bahdanau et al. and later refined in the Transformer work, attention lets a model focus on relevant input positions while producing each output token. The scaled dot-product form computes softmax((QK^T)/sqrt(d_k))V and powers self-attention, cross-attention, and causal attention variants used in modern language models.`,
      tags: ['deep-learning', 'concept', 'foundational'],
      status: 'PUBLISHED',
      collectionId: dlCollection.id,
      metadata: { year: 2014, field: 'NLP' },
    },
  });

  const entryTransformer = await prisma.entry.create({
    data: {
      title: 'Transformer Architecture',
      slug: 'transformer-architecture',
      summary: 'A sequence transduction model architecture based entirely on self-attention mechanisms, dispensing with recurrence and convolutions.',
      body: `### Overview

The **Transformer** architecture replaces recurrent neural networks (RNNs) and convolutional networks with self-attention layers. This allows for significantly more parallelization during training and handles long-range dependencies more effectively.

### Key Components

1. **Multi-Head Attention (MHA):** Runs scaled dot-product attention multiple times in parallel with different linear projections.
2. **Feed-Forward Networks (FFN):** A position-wise fully connected feed-forward network applied to each position identically.
3. **Positional Encoding:** Adds sinusoidal coordinates to input embeddings to preserve token order information.

$$\\text{PE}_{(pos, 2i)} = \\sin\\left(\\frac{pos}{10000^{2i/d_{model}}}\\right)$$`,
      originalBody: `The Transformer architecture replaces recurrence and convolutions with stacked self-attention and feed-forward blocks. Multi-head attention lets the model attend from multiple representation subspaces, while positional encoding injects sequence order information.`,
      tags: ['deep-learning', 'concept', 'architecture'],
      status: 'PUBLISHED',
      collectionId: dlCollection.id,
      metadata: { year: 2017, venue: 'NeurIPS' },
    },
  });

  const entryGPT3 = await prisma.entry.create({
    data: {
      title: 'GPT-3 Model',
      slug: 'gpt-3-model',
      summary: 'An autoregressive language model with 175 billion parameters, demonstrating that massive scaling leads to strong few-shot learning capabilities.',
      body: `### Overview

**GPT-3** (Generative Pre-trained Transformer 3) is a large autoregressive language model trained by OpenAI. It contains 175 billion parameters, which was a record-breaking scale at its release.

### Core Findings

- **Emergent Few-Shot Learning:** Without fine-tuning parameters, GPT-3 can perform diverse text-based tasks when prompted with just a few demonstrations (few-shot context learning).
- **Scaling Laws:** General validation loss scales as a power-law with the number of parameters, dataset size, and compute budget.`,
      originalBody: `GPT-3 is a 175B-parameter autoregressive Transformer that demonstrated strong in-context few-shot behavior and revived interest in scaling laws for language model performance.`,
      tags: ['language-models', 'paper', 'scale'],
      status: 'PUBLISHED',
      collectionId: llmCollection.id,
      metadata: { parameters: '175B', year: 2020 },
    },
  });

  const entryPythonFunctions = await prisma.entry.create({
    data: {
      title: 'Python Functions and Scope',
      slug: 'python-functions-and-scope',
      summary: 'How function definitions, local/global scope, and closures work in Python, with practical habits for writing readable code.',
      body: `### Why this matters

Functions are the primary unit of structure in Python. Scope rules determine where names are resolved and can explain many bugs that look mysterious at first.

### LEGB rule

Python resolves names in this order:

1. **Local**
2. **Enclosing**
3. **Global**
4. **Built-in**

### Practical habits

- Keep function responsibilities narrow.
- Prefer explicit parameters over hidden global state.
- Use closures intentionally and document captured variables.`,
      originalBody: `A function statement defines a function object and binds it to a name. Name resolution follows local, enclosing, global, built-in scopes. Closures capture references from enclosing scopes, which can surprise when variables mutate later.`,
      tags: ['python', 'fundamentals', 'language'],
      status: 'PUBLISHED',
      collectionId: pythonCollection.id,
      metadata: { sourceKind: 'docs', difficulty: 'beginner' },
    },
  });

  const entryAdkOverview = await prisma.entry.create({
    data: {
      title: 'Google ADK: Core Concepts',
      slug: 'google-adk-core-concepts',
      summary: 'A compact overview of the ADK mental model: agents, tools, orchestration flow, and execution boundaries.',
      body: `### ADK mental model

Think in terms of:

- **Agent**: the decision-making unit.
- **Tools**: capabilities the agent can call.
- **Runtime flow**: how input, tool calls, and output are orchestrated.

### Early learning focus

Before optimization, focus on correctness:

1. Tool contract clarity
2. Deterministic testing paths
3. Observability of each step`,
      originalBody: `ADK content is often scattered across docs, repositories, and examples. Preserve original snippets and references while keeping a cleaned, high-readability summary for repeated study.`,
      tags: ['adk', 'agents', 'platform'],
      status: 'PUBLISHED',
      collectionId: adkCollection.id,
      metadata: { sourceKind: 'docs+tutorials' },
    },
  });

  const entryMeditationsBook1 = await prisma.entry.create({
    data: {
      title: 'Meditations: Book 1 Themes',
      slug: 'meditations-book-1-themes',
      summary: 'Book 1 can be read as gratitude-in-practice: naming who shaped your character and why that matters for daily conduct.',
      body: `### Reading stance

Book 1 is less argument and more remembrance.

It models a reflective practice:

- Name influences precisely
- Extract one actionable trait
- Rehearse it in ordinary life

### Why keep this in Atlas

This is philosophical prose, but it functions as a behavioral operating system when revisited slowly.`,
      originalBody: `Marcus Aurelius opens with acknowledgements to teachers, family, and exemplars. The tone is practical gratitude rather than abstract philosophy.`,
      tags: ['philosophy', 'stoicism', 'reflection'],
      status: 'PUBLISHED',
      collectionId: philosophyCollection.id,
      metadata: { sourceKind: 'book', section: 'Book 1' },
    },
  });

  await prisma.entry.create({
    data: {
      title: 'Vision Transformer (ViT)',
      slug: 'vision-transformer',
      summary: 'An adaptation of the Transformer architecture to computer vision tasks, processing image patches as token sequences.',
      body: `### Draft Note
This entry is currently under draft. We need to add detailed comparisons between CNNs and Transformers in vision tasks.`,
      originalBody: `Vision Transformer adapts the Transformer design to image patches and often benefits from larger pretraining corpora compared with classic CNN regimes.`,
      tags: ['computer-vision', 'architecture', 'draft'],
      status: 'DRAFT',
      collectionId: cvCollection.id,
    },
  });

  console.log('✔ Created entries (including drafts).');

  // 4. Create Sources
  await prisma.source.create({
    data: {
      entryId: entryAttention.id,
      sourceType: 'PAPER',
      title: 'Neural Machine Translation by Jointly Learning to Align and Translate',
      author: 'Dzmitry Bahdanau, Kyunghyun Cho, Yoshua Bengio',
      url: 'https://arxiv.org/abs/1409.0473',
      ref: 'Section 3: Learning to Align and Translate',
    },
  });

  await prisma.source.create({
    data: {
      entryId: entryTransformer.id,
      sourceType: 'PAPER',
      title: 'Attention Is All You Need',
      author: 'Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin',
      url: 'https://arxiv.org/abs/1706.03762',
      ref: 'Section 3: Model Architecture',
    },
  });

  await prisma.source.create({
    data: {
      entryId: entryGPT3.id,
      sourceType: 'PAPER',
      title: 'Language Models are Few-Shot Learners',
      author: 'Tom B. Brown et al. (OpenAI)',
      url: 'https://arxiv.org/abs/2005.14165',
      ref: 'Section 2: Approach',
    },
  });

  await prisma.source.create({
    data: {
      entryId: entryPythonFunctions.id,
      sourceType: 'DOCS',
      title: 'Python Tutorial - Defining Functions',
      author: 'Python Software Foundation',
      url: 'https://docs.python.org/3/tutorial/controlflow.html#defining-functions',
      ref: 'Tutorial section',
    },
  });

  await prisma.source.create({
    data: {
      entryId: entryAdkOverview.id,
      sourceType: 'DOCS',
      title: 'Google ADK Documentation',
      author: 'Google',
      url: 'https://google.github.io/adk-docs/',
      ref: 'Overview',
    },
  });

  await prisma.source.create({
    data: {
      entryId: entryMeditationsBook1.id,
      sourceType: 'BOOK',
      title: 'Meditations',
      author: 'Marcus Aurelius',
      ref: 'Book 1',
    },
  });

  console.log('✔ Created sources.');

  // 5. Create Relations
  // Relation 1: Transformer USES Attention
  await prisma.relation.create({
    data: {
      fromId: entryTransformer.id,
      toId: entryAttention.id,
      relationType: 'USES',
      note: 'The Transformer architecture uses scaled dot-product attention as its core building block.',
    },
  });

  // Relation 2: GPT-3 USES Transformer
  await prisma.relation.create({
    data: {
      fromId: entryGPT3.id,
      toId: entryTransformer.id,
      relationType: 'USES',
      note: 'GPT-3 is a decoder-only autoregressive Transformer.',
    },
  });

  // Relation 3: Transformer SEE_ALSO Attention (and vice versa for bidirectional)
  await prisma.relation.create({
    data: {
      fromId: entryTransformer.id,
      toId: entryAttention.id,
      relationType: 'SEE_ALSO',
      note: 'Both are core attention innovations.',
    },
  });

  await prisma.relation.create({
    data: {
      fromId: entryAdkOverview.id,
      toId: entryPythonFunctions.id,
      relationType: 'PREREQUISITE',
      note: 'Python fundamentals make ADK implementation work easier.',
    },
  });
  await prisma.relation.create({
    data: {
      fromId: entryAttention.id,
      toId: entryTransformer.id,
      relationType: 'SEE_ALSO',
      note: 'Both are core attention innovations.',
    },
  });

  console.log('✔ Created relations.');

  // 6. Create Personal Notes (separate module, link-only references to KB)
  const noteAttention = await prisma.note.create({
    data: {
      title: 'Thinking aloud: why attention clicked for me',
      slug: 'thinking-aloud-why-attention-clicked-for-me',
      body: `Attention made sense once I stopped seeing it as magic and started seeing it as weighted retrieval.

If each token can ask "who matters for me right now?", then the whole mechanism feels natural.
I should revisit this after reading more implementation details.`,
      knowledgeLinksEnabled: true,
    },
  });

  await prisma.noteLink.create({
    data: {
      noteId: noteAttention.id,
      entryId: entryAttention.id,
      context: 'Personal reflection linked to foundational concept entry.',
    },
  });

  console.log('✔ Created personal notes and KB note links.');
  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
