"""File cleanup follows the database transaction. A small CLI reconciles crash leftovers."""

import argparse
import logging
from pathlib import Path
from time import time
from uuid import UUID

from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import report
from app.db.base import get_session_scope
from app.db.models import Asset

log = logging.getLogger(__name__)


def remove(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError as error:
        report(log, error, "asset_cleanup_failed")


@event.listens_for(Session, "after_commit")
def committed(session: Session) -> None:
    session.info.pop("asset_rollback", None)
    for path in session.info.pop("asset_delete", []):
        remove(path)


@event.listens_for(Session, "after_rollback")
def rolled_back(session: Session) -> None:
    session.info.pop("asset_delete", None)
    for path in session.info.pop("asset_rollback", []):
        remove(path)


def write(session: Session, path: Path, data: bytes) -> None:
    session.connection()  # Ensure rollback hooks run even before the first row is written.
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".part")
    session.info.setdefault("asset_rollback", []).extend([temporary, path])
    try:
        with temporary.open("xb") as file:
            file.write(data)
        temporary.replace(path)
    except BaseException:
        remove(temporary)
        remove(path)
        raise


def delete_after_commit(session: Session, path: Path) -> None:
    session.info.setdefault("asset_delete", []).append(path)


def reconcile(*, apply: bool = False) -> dict:
    """Only remove unreferenced UUID files older than a day. Default is a dry run."""
    with get_session_scope()() as session:
        referenced = {str(id) for id in session.scalars(select(Asset.id))}
    directory = Path(get_settings().assets_dir)
    orphans = []
    if directory.exists():
        for path in directory.iterdir():
            try:
                id = str(UUID(path.stem if path.suffix == ".part" else path.name))
            except ValueError:
                continue
            if id not in referenced and path.is_file() and path.stat().st_mtime < time() - 86400:
                orphans.append(path.name)
                if apply:
                    remove(path)
    missing = sum(not (directory / id).is_file() for id in referenced)
    return {"orphanFiles": orphans, "missingFiles": missing, "applied": apply}


if __name__ == "__main__":
    import json

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Remove old unreferenced files")
    print(json.dumps(reconcile(apply=parser.parse_args().apply)))
