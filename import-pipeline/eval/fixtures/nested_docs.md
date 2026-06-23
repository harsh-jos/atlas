---
title: Nested Docs Fixture
description: frontmatter the parser should consume
---

# Nested Docs Fixture

This is the document lead paragraph. It is intentionally long enough to survive the
enricher's summary minimum and to give the root entry a real body of its own before any
subsection headings begin to break the content into a hierarchy.

## Getting Started

Getting started covers installation and a first run. This section has enough prose to stand
on its own as a distinct entry rather than being merged upward into the document root, which
is exactly the granularity the segmenter aims for.

### Installation

Install the package with your package manager of choice. This leaf has enough content to be
its own entry and should become a PART_OF child of Getting Started in the resulting graph.

```bash
# This heading-looking line is inside a code fence and must NOT be parsed as a heading.
# Another fake heading
pip install example
```

### First Run

A short leaf.

## Core Concepts

Core concepts explains the mental model behind the system. See [Installation](#installation)
for setup and [Advanced](#advanced) for deeper material; these internal links should resolve
to SEE_ALSO relations because they point at known heading anchors within this same document.

| Concept   | Purpose                         |
|-----------|---------------------------------|
| Entry     | A single node of knowledge      |
| Relation  | A typed edge between two entries |

### Advanced

Advanced material goes here. It references [Core Concepts](#core-concepts) which forms a
back-link, and contains enough words to be retained as its own standalone subsection entry
in the segmented output rather than merging upward.
