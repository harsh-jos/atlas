# Flat Article Fixture

This fixture is a single flat document with no subsection headings at all, the shape a plain
blog post or a short article tends to take. The whole thing should become exactly one entry,
with no PART_OF children and no SEE_ALSO edges, and a clean lead-paragraph summary.

It keeps going for several paragraphs to make sure the body is substantial. The segmenter
should not invent structure that is not present in the source, and the enricher should pull
its summary from this opening prose rather than from anything further down.

A second paragraph continues the discussion with additional detail so that the total body
comfortably exceeds the minimum entry size and the single-entry expectation is unambiguous
when this fixture is compared across pipeline versions.
