"""Versioned, bounded learning blocks embedded in the assistant's normal response."""
import json
import math
import re
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Visual(Model):
    title: str = Field(min_length=1, max_length=200)
    fallback: str = Field(min_length=1, max_length=4000)


class Node(Model):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,40}$")
    label: str = Field(min_length=1, max_length=100)
    detail: str = Field(default="", max_length=1500)


class Edge(Model):
    source: str
    target: str
    label: str = Field(default="", max_length=100)


class Diagram(Visual):
    type: Literal["diagram"]
    nodes: list[Node] = Field(min_length=1, max_length=16)
    edges: list[Edge] = Field(default_factory=list, max_length=32)

    @model_validator(mode="after")
    def endpoints(self):
        ids = {n.id for n in self.nodes}
        if len(ids) != len(self.nodes) or any(e.source not in ids or e.target not in ids or e.source == e.target for e in self.edges):
            raise ValueError("Diagram IDs must be unique and edges must join distinct known nodes.")
        return self


class Step(Model):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=3000)
    code: str = Field(default="", max_length=3000)


class Stepper(Visual):
    type: Literal["stepper", "worked-example"]
    steps: list[Step] = Field(min_length=1, max_length=12)


class ComparisonRow(Model):
    label: str = Field(min_length=1, max_length=200)
    cells: list[str] = Field(min_length=2, max_length=4)


class Compare(Visual):
    type: Literal["compare"]
    columns: list[str] = Field(min_length=2, max_length=4)
    rows: list[ComparisonRow] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def dimensions(self):
        if any(len(r.cells) != len(self.columns) or any(len(c) > 2000 for c in r.cells) for r in self.rows):
            raise ValueError("Each comparison row needs one bounded cell per column.")
        return self


class Plot(Visual):
    type: Literal["plot"]
    coefficients: list[float] = Field(min_length=1, max_length=7)
    xMin: float = Field(ge=-10000, le=10000)
    xMax: float = Field(ge=-10000, le=10000)
    initialX: float = 0
    xLabel: str = Field(default="x", max_length=100)
    yLabel: str = Field(default="y", max_length=100)

    @model_validator(mode="after")
    def domain(self):
        if self.xMin >= self.xMax or any(abs(c) > 1e8 for c in self.coefficients):
            raise ValueError("Supply a finite, increasing plot domain.")
        if not all(math.isfinite(sum(c * x ** i for i, c in enumerate(self.coefficients))) for x in (self.xMin, self.xMax)):
            raise ValueError("Plot overflows.")
        return self


class ImageFigure(Visual):
    type: Literal["image"]
    assetId: UUID
    alt: str = Field(min_length=1, max_length=2000)
    caption: str = Field(default="", max_length=2000)


class Details(Visual):
    type: Literal["details"]
    body: str = Field(min_length=1, max_length=12000)


Component = Annotated[Diagram | Stepper | Compare | Plot | ImageFigure | Details, Field(discriminator="type")]
component_adapter = TypeAdapter(Component)
FENCE = re.compile(r"^```atlas[^\n]*\n(.*?)^```\s*$", re.M | re.S)


def document(text: str) -> dict:
    blocks = []
    cursor = 0
    for match in FENCE.finditer(text):
        if match.start() > cursor:
            blocks.append({"type": "markdown", "text": text[cursor:match.start()]})
        raw = match.group(1)
        try:
            if len(raw) > 24000 or len(blocks) > 40:
                raise ValueError("Visual too large")
            visual = component_adapter.validate_json(raw)
            blocks.append({"type": "component", "component": visual.model_dump(mode="json")})
        except (ValueError, TypeError):
            try:
                fallback = json.loads(raw).get("fallback", "")
            except (ValueError, AttributeError):
                fallback = ""
            blocks.append({"type": "markdown", "text": fallback[:4000] if isinstance(fallback, str) and fallback else "This visual could not be displayed."})
        cursor = match.end()
    if cursor < len(text):
        # Never expose unfinished component syntax to the reader.
        tail = re.split(r"^```atlas[^\n]*(?:\n|$)", text[cursor:], maxsplit=1, flags=re.M)[0]
        if tail.strip():
            blocks.append({"type": "markdown", "text": tail})
    for index, block in enumerate(blocks):
        block["id"] = f"b{index}"
    return {"schemaVersion": 1, "blocks": blocks, "fallbackText": "\n\n".join(b.get("text", b.get("component", {}).get("fallback", "")) for b in blocks)}


COMPONENT_INSTRUCTION = r'''
INLINE LEARNING COMPONENTS
Respond in normal Markdown. At the precise place a visual helps, insert a fenced `atlas`
block containing ONE JSON object, then continue the same answer below it. These are native
components, not code for the reader to copy. Choose them only when they explain something.
Every component requires `type`, `title`, and `fallback` (a useful text explanation).
Available shapes (all extra fields are rejected):
- diagram: nodes [{id,label,detail}], edges [{source,target,label}]. 1-16 nodes; valid IDs.
- stepper or worked-example: steps [{title,body,code}]. 1-12 meaningful steps; code optional.
- compare: columns [name,name], rows [{label,cells:[text,text]}]. 2-4 columns, matching cells.
- plot: coefficients [c0,c1,...] for y=c0+c1*x+c2*x^2..., xMin, xMax, initialX,
  optional xLabel/yLabel. Up to degree six. Calculations are local and exact for that formula.
- image: assetId (returned by image tool), alt, caption. Never invent asset IDs.
- details: body (Markdown). Optional background, implementation detail, or history.
Example:
```atlas
{"type":"diagram","title":"One expression, three operations","fallback":"x is multiplied by 3, then increased by 2, then squared.","nodes":[{"id":"x","label":"x = 1","detail":"Input"},{"id":"u","label":"u = 3x + 2 = 5","detail":"Local derivative du/dx = 3"},{"id":"y","label":"y = u² = 25","detail":"dy/du = 10. Chain rule: dy/dx = 10 × 3 = 30."}],"edges":[{"source":"x","target":"u","label":"×3, +2"},{"source":"u","target":"y","label":"square"}]}
```
Use a concrete example consistently across prose and components. Prefer diagrams over
ASCII sketches; exact graphs and plots over generated bitmaps. Do not render every paragraph
as a card. Do not output arbitrary HTML, scripts, external asset URLs, or unsupported widgets.
'''
