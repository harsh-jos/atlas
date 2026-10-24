"""Validate private runtime YAML and run migrations without shell-evaluating credentials."""

import argparse
import os
from pathlib import Path
import subprocess
import sys

import yaml

ROOT = Path(__file__).resolve().parents[1]


def load_config(variable: str, required: set[str]) -> dict[str, str]:
    path = Path(os.environ[variable]).resolve()
    if path.is_relative_to(ROOT):
        raise ValueError(f"{variable} must be outside the repository/build context")
    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict) or not all(isinstance(key, str) for key in data):
        raise ValueError(f"{variable} must contain a YAML mapping")
    if not all(isinstance(value, str) for value in data.values()):
        raise ValueError(f"Quote all values in {variable} as strings")
    missing = sorted(key for key in required if not data.get(key))
    if missing:
        raise ValueError(f"{variable} is missing: {', '.join(missing)}")
    if data.get("AUTH_PROVIDER") != "supabase":
        raise ValueError(f"{variable} must select Supabase auth")
    return data


def configuration() -> dict[str, str]:
    backend = load_config("BACKEND_ENV_FILE", {
        "AUTH_PROVIDER", "SUPABASE_URL", "DATABASE_URL", "SUPABASE_SERVICE_KEY",
        "STORAGE_BACKEND", "SUPABASE_STORAGE_BUCKET", "VERTEX_PROJECT",
    })
    web = load_config("WEB_ENV_FILE", {
        "AUTH_PROVIDER", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY",
    })
    if backend["STORAGE_BACKEND"] != "supabase":
        raise ValueError("Cloud Run uploads must use Supabase storage")
    if backend["SUPABASE_URL"].rstrip("/") != web["SUPABASE_URL"].rstrip("/"):
        raise ValueError("Frontend and backend must use the same Supabase project")
    if {"DATABASE_URL", "SUPABASE_SERVICE_KEY", "GOOGLE_APPLICATION_CREDENTIALS"} & web.keys():
        raise ValueError("Remove backend credentials from the frontend configuration")
    if "GOOGLE_APPLICATION_CREDENTIALS" in backend:
        raise ValueError("Cloud Run must use its service account, not a credential file")
    # GitHub masks the whole multiline secret; also mask individual sensitive values.
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for key in ("DATABASE_URL", "SUPABASE_SERVICE_KEY"):
            value = backend[key].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::add-mask::{value}", flush=True)
    return backend


def migrate(backend: dict[str, str]) -> int:
    # The migration subprocess receives only runtime values, not a shell source file.
    return subprocess.run(
        [sys.executable, "-c", "\n".join([
            "from app.db.bootstrap import bootstrap",
            "try:",
            "    bootstrap()",
            "except Exception as error:",
            "    print('Migration failed:', type(error).__name__)",
            "    raise SystemExit(1) from None",
        ])],
        cwd=ROOT / "backend", env={**os.environ, **backend}, check=False,
    ).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true")
    args = parser.parse_args()
    try:
        backend = configuration()
    except (KeyError, ValueError, OSError, yaml.YAMLError) as error:
        # YAML parser errors may contain source snippets, so never print their contents.
        print(f"Invalid runtime configuration ({type(error).__name__}). Check required variables and YAML formatting.", file=sys.stderr)
        return 1
    if args.validate:
        print("Runtime configuration validated; secret values were not displayed.")
        return 0
    return migrate(backend)


if __name__ == "__main__":
    raise SystemExit(main())
