"""Domain enumerations shared by the ORM models and the ingestion pipeline."""

from enum import StrEnum


class Role(StrEnum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"


class ArtifactFormat(StrEnum):
    MD = "MD"
    HTML = "HTML"
    PDF = "PDF"


class Origin(StrEnum):
    """Who authored a row, so AI-made ones stay distinguishable and bulk-prunable."""

    HUMAN = "HUMAN"
    AI = "AI"


class SourceType(StrEnum):
    BOOK = "BOOK"
    PAPER = "PAPER"
    DOCS = "DOCS"
    TUTORIAL = "TUTORIAL"
    COURSE = "COURSE"
    WEBSITE = "WEBSITE"


class RelationType(StrEnum):
    PART_OF = "PART_OF"
    USES = "USES"
    PREREQUISITE = "PREREQUISITE"
    CONTRASTS = "CONTRASTS"
    SEE_ALSO = "SEE_ALSO"
