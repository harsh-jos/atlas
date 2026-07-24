"""Assets: upload an image once, serve it back to its owner by id."""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.api.library import Payload
from app.auth.deps import CurrentUser, SessionDep
from app.core.config import ALLOWED_ASSET_TYPES, get_settings
from app.db.models import Asset
from app.db.repository import OwnedRepository
from app.storage.quota import QuotaExceeded, QuotaService

router = APIRouter(tags=["assets"])


class AssetRepository(OwnedRepository[Asset]):
    model = Asset


class AssetOut(Payload):
    id: UUID
    url: str
    mime_type: str
    size: int


def _asset_path(asset_id: UUID) -> Path:
    """Named by the generated id: the client's filename never reaches the filesystem."""
    directory = Path(get_settings().assets_dir)
    directory.mkdir(parents=True, exist_ok=True)
    return directory / str(asset_id)


def _owned(assets: AssetRepository, asset_id: UUID) -> Asset:
    """Another user's asset reads as missing, so ids cannot be probed."""
    asset = assets.get(asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "asset not found")
    return asset


@router.post("/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def upload_asset(
    session: SessionDep, user: CurrentUser, file: UploadFile = File(...)
) -> AssetOut:
    """Store one image, charged against the caller's quota before anything touches the disk."""
    mime_type = file.content_type or "unknown"
    if mime_type not in ALLOWED_ASSET_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"unsupported asset type: {mime_type}"
        )
    data = await file.read()
    limit = get_settings().max_asset_bytes
    if len(data) > limit:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"asset is {len(data)} bytes; the limit is {limit}",
        )
    try:
        QuotaService(session, user).reserve(len(data))
    except QuotaExceeded as error:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, str(error)) from None

    asset = AssetRepository(session, user.id).add(
        Asset(
            file_name=Path(file.filename or "upload").name,
            mime_type=mime_type,
            size=len(data),
        )
    )
    _asset_path(asset.id).write_bytes(data)
    return AssetOut(
        id=asset.id, url=f"/assets/{asset.id}", mime_type=asset.mime_type, size=asset.size
    )


@router.get("/assets/{asset_id}", response_class=FileResponse)
def get_asset(asset_id: UUID, session: SessionDep, user: CurrentUser) -> FileResponse:
    """Streamed off disk by FileResponse, so the bytes never sit in memory."""
    asset = _owned(AssetRepository(session, user.id), asset_id)
    return FileResponse(_asset_path(asset.id), media_type=asset.mime_type)


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: UUID, session: SessionDep, user: CurrentUser) -> None:
    """Drops the row, gives the bytes back to the quota, and removes the file."""
    assets = AssetRepository(session, user.id)
    asset = _owned(assets, asset_id)
    path, size = _asset_path(asset.id), asset.size
    assets.delete(asset)
    QuotaService(session, user).release(size)
    path.unlink(missing_ok=True)
