import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from app.core.config import settings
from app.core.exceptions import AnnotationConflictError, AnnotationNotFoundError
from app.schemas.annotations import (
    Annotation,
    AnnotationBatchRequest,
    AnnotationCreate,
    AnnotationMutation,
    AnnotationUpdate,
)

_SCHEMA_LOCK = threading.Lock()
_INITIALIZED_DATABASES: set[str] = set()
_SCHEMA_INITIALIZATION_TIMEOUT_SECONDS = 30
_SCHEMA_RETRY_INTERVAL_SECONDS = 0.01


def _database_path() -> Path:
    configured = settings.annotation_db
    if configured:
        return Path(configured)
    return Path(settings.annotation_dir) / "annotations.db"


def _legacy_annotation_file(slide_id: str) -> Path | None:
    if Path(slide_id).name != slide_id:
        return None
    return Path(settings.annotation_dir) / f"{slide_id}.json"


def _enable_wal_mode(connection: sqlite3.Connection) -> None:
    deadline = time.monotonic() + _SCHEMA_INITIALIZATION_TIMEOUT_SECONDS
    while True:
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            return
        except sqlite3.OperationalError as exc:
            error_code = getattr(exc, "sqlite_errorcode", None)
            primary_code = (
                error_code & 0xFF
                if isinstance(error_code, int)
                else None
            )
            if (
                primary_code not in {sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED}
                or time.monotonic() >= deadline
            ):
                raise
            time.sleep(_SCHEMA_RETRY_INTERVAL_SECONDS)


def _initialize_schema(connection: sqlite3.Connection, path: Path) -> None:
    key = str(path.resolve())
    if key in _INITIALIZED_DATABASES:
        return
    with _SCHEMA_LOCK:
        if key in _INITIALIZED_DATABASES:
            return
        _enable_wal_mode(connection)
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS annotations (
                slide_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                revision INTEGER NOT NULL,
                created TEXT NOT NULL,
                modified TEXT NOT NULL,
                PRIMARY KEY (slide_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_annotations_slide_created
                ON annotations (slide_id, created, id);
            CREATE TABLE IF NOT EXISTS annotation_migrations (
                slide_id TEXT PRIMARY KEY,
                migrated_at TEXT NOT NULL
            );
            """
        )
        _INITIALIZED_DATABASES.add(key)


def _connect() -> sqlite3.Connection:
    path = _database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(
        path,
        timeout=30,
        isolation_level=None,
        check_same_thread=False,
    )
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=30000")
        _initialize_schema(connection, path)
        connection.execute("PRAGMA foreign_keys=ON")
    except Exception:
        connection.close()
        raise
    return connection


@contextmanager
def _transaction(connection: sqlite3.Connection) -> Iterator[None]:
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield
    except Exception:
        connection.rollback()
        raise
    else:
        connection.commit()


def _annotation_dict(annotation: Annotation) -> dict:
    return annotation.model_dump(mode="json")


def _save_row(connection: sqlite3.Connection, slide_id: str, annotation: Annotation) -> None:
    data = _annotation_dict(annotation)
    connection.execute(
        """
        INSERT INTO annotations (slide_id, id, data, revision, created, modified)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            slide_id,
            annotation.id,
            json.dumps(data, separators=(",", ":")),
            annotation.revision,
            data["created"],
            data["modified"],
        ),
    )


def _update_row(connection: sqlite3.Connection, slide_id: str, annotation: Annotation) -> None:
    data = _annotation_dict(annotation)
    connection.execute(
        """
        UPDATE annotations
        SET data = ?, revision = ?, modified = ?
        WHERE slide_id = ? AND id = ?
        """,
        (
            json.dumps(data, separators=(",", ":")),
            annotation.revision,
            data["modified"],
            slide_id,
            annotation.id,
        ),
    )


def _get_row(
    connection: sqlite3.Connection,
    slide_id: str,
    annotation_id: str,
) -> sqlite3.Row:
    row = connection.execute(
        "SELECT data, revision FROM annotations WHERE slide_id = ? AND id = ?",
        (slide_id, annotation_id),
    ).fetchone()
    if row is None:
        raise AnnotationNotFoundError(annotation_id)
    return row


def _check_revision(annotation_id: str, expected: int | None, actual: int) -> None:
    if expected is not None and expected != actual:
        raise AnnotationConflictError(annotation_id, expected, actual)


def _migrate_legacy_slide(connection: sqlite3.Connection, slide_id: str) -> None:
    already_migrated = connection.execute(
        "SELECT 1 FROM annotation_migrations WHERE slide_id = ?",
        (slide_id,),
    ).fetchone()
    if already_migrated:
        return

    with _transaction(connection):
        # Recheck after acquiring the write lock: another request may have
        # completed this slide's migration after the optimistic read above.
        _migrate_legacy_slide_if_needed_in_transaction(connection, slide_id)


def get_annotations(slide_id: str) -> list[dict]:
    with _connect() as connection:
        _migrate_legacy_slide(connection, slide_id)
        rows = connection.execute(
            "SELECT data FROM annotations WHERE slide_id = ? ORDER BY created, id",
            (slide_id,),
        ).fetchall()
        return [json.loads(row["data"]) for row in rows]


def get_annotation(slide_id: str, annotation_id: str) -> dict:
    with _connect() as connection:
        _migrate_legacy_slide(connection, slide_id)
        row = _get_row(connection, slide_id, annotation_id)
        return json.loads(row["data"])


def create_annotation(slide_id: str, data: AnnotationCreate) -> Annotation:
    annotation = Annotation(body=data.body, target=data.target)
    with _connect() as connection, _transaction(connection):
        _migrate_legacy_slide_if_needed_in_transaction(connection, slide_id)
        _save_row(connection, slide_id, annotation)
    return annotation


def _updated_annotation(row: sqlite3.Row, annotation_id: str, data: AnnotationUpdate) -> Annotation:
    current = Annotation.model_validate(json.loads(row["data"]))
    _check_revision(annotation_id, data.revision, row["revision"])
    values = current.model_dump()
    if data.body is not None:
        values["body"] = data.body
    if data.target is not None:
        values["target"] = data.target
    values["modified"] = datetime.now(timezone.utc)
    values["revision"] = row["revision"] + 1
    return Annotation.model_validate(values)


def update_annotation(
    slide_id: str,
    annotation_id: str,
    data: AnnotationUpdate,
) -> dict:
    with _connect() as connection, _transaction(connection):
        _migrate_legacy_slide_if_needed_in_transaction(connection, slide_id)
        row = _get_row(connection, slide_id, annotation_id)
        annotation = _updated_annotation(row, annotation_id, data)
        _update_row(connection, slide_id, annotation)
    return _annotation_dict(annotation)


def delete_annotation(
    slide_id: str,
    annotation_id: str,
    revision: int | None = None,
) -> None:
    with _connect() as connection, _transaction(connection):
        _migrate_legacy_slide_if_needed_in_transaction(connection, slide_id)
        row = _get_row(connection, slide_id, annotation_id)
        _check_revision(annotation_id, revision, row["revision"])
        connection.execute(
            "DELETE FROM annotations WHERE slide_id = ? AND id = ?",
            (slide_id, annotation_id),
        )


def _migrate_legacy_slide_if_needed_in_transaction(
    connection: sqlite3.Connection,
    slide_id: str,
) -> None:
    migrated = connection.execute(
        "SELECT 1 FROM annotation_migrations WHERE slide_id = ?",
        (slide_id,),
    ).fetchone()
    if migrated:
        return
    legacy_file = _legacy_annotation_file(slide_id)
    if legacy_file and legacy_file.exists():
        with legacy_file.open("r", encoding="utf-8") as file:
            records = json.load(file)
        if not isinstance(records, list):
            raise ValueError(f"Legacy annotation file must contain a list: {legacy_file}")
        for record in records:
            annotation = Annotation.model_validate({**record, "revision": record.get("revision", 1)})
            exists = connection.execute(
                "SELECT 1 FROM annotations WHERE slide_id = ? AND id = ?",
                (slide_id, annotation.id),
            ).fetchone()
            if not exists:
                _save_row(connection, slide_id, annotation)
    connection.execute(
        "INSERT INTO annotation_migrations (slide_id, migrated_at) VALUES (?, ?)",
        (slide_id, datetime.now(timezone.utc).isoformat()),
    )


def _apply_mutation(
    connection: sqlite3.Connection,
    slide_id: str,
    mutation: AnnotationMutation,
    response: dict[str, list],
) -> None:
    if mutation.action == "create":
        data = AnnotationCreate(body=mutation.body or [], target=mutation.target)
        annotation = Annotation(body=data.body, target=data.target)
        _save_row(connection, slide_id, annotation)
        response["created"].append(_annotation_dict(annotation))
        return

    annotation_id = mutation.annotation_id or ""
    row = _get_row(connection, slide_id, annotation_id)
    _check_revision(annotation_id, mutation.revision, row["revision"])
    if mutation.action == "delete":
        connection.execute(
            "DELETE FROM annotations WHERE slide_id = ? AND id = ?",
            (slide_id, annotation_id),
        )
        response["deleted"].append(annotation_id)
        return

    update = AnnotationUpdate(
        body=mutation.body,
        target=mutation.target,
        revision=mutation.revision,
    )
    annotation = _updated_annotation(row, annotation_id, update)
    _update_row(connection, slide_id, annotation)
    response["updated"].append(_annotation_dict(annotation))


def apply_batch(slide_id: str, request: AnnotationBatchRequest) -> dict:
    response: dict[str, list] = {"created": [], "updated": [], "deleted": []}
    with _connect() as connection, _transaction(connection):
        _migrate_legacy_slide_if_needed_in_transaction(connection, slide_id)
        for mutation in request.operations:
            _apply_mutation(connection, slide_id, mutation, response)
    return response
