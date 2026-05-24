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
      tags: ['language-models', 'paper', 'scale'],
      status: 'PUBLISHED',
      collectionId: llmCollection.id,
      metadata: { parameters: '175B', year: 2020 },
    },
  });

  await prisma.entry.create({
    data: {
      title: 'Vision Transformer (ViT)',
      slug: 'vision-transformer',
      summary: 'An adaptation of the Transformer architecture to computer vision tasks, processing image patches as token sequences.',
      body: `### Draft Note
This entry is currently under draft. We need to add detailed comparisons between CNNs and Transformers in vision tasks.`,
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
      fromId: entryAttention.id,
      toId: entryTransformer.id,
      relationType: 'SEE_ALSO',
      note: 'Both are core attention innovations.',
    },
  });

  console.log('✔ Created relations.');
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
