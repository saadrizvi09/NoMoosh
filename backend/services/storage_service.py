"""Storage service — upload files to Supabase Storage.

Bucket expected: ``restaurant-media`` (created via Supabase Dashboard, public read).
"""

from __future__ import annotations

import uuid
from supabase_client import get_supabase
from config import STORAGE_BUCKET


async def upload_to_storage(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    folder: str = "uploads",
) -> str:
    """
    Upload a file to Supabase Storage and return the public URL.

    :param file_bytes:   raw bytes of the file
    :param filename:     original filename (used for extension)
    :param content_type: MIME type
    :param folder:       sub-folder inside the bucket
    :return: public URL
    """
    sb = get_supabase()

    # Deterministic unique path: <folder>/<uuid>.<ext>
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    path = f"{folder}/{uuid.uuid4()}.{ext}"

    sb.storage.from_(STORAGE_BUCKET).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type},
    )

    public_url: str = sb.storage.from_(STORAGE_BUCKET).get_public_url(path)
    return public_url
