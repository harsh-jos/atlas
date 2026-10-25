"""Validate private runtime YAML and run migrations without shell-evaluating credentials."""

import argparse
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

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


def https_origin(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("Deployment URLs must be HTTPS origins")
    return value.rstrip("/")


def render_deployment(directory: Path) -> None:
    """Merge discovered URLs into private copies; never print or mutate runtime secrets."""
    directory = directory.resolve()
    if directory.is_relative_to(ROOT):
        raise ValueError("Rendered runtime configuration must be outside the build context")
    backend = configuration()
    web = load_config("WEB_ENV_FILE", {"AUTH_PROVIDER", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"})
    api_url = https_origin(os.environ["ATLAS_RESOLVED_API_URL"])
    web_url = https_origin(os.environ.get("PUBLIC_APP_URL") or os.environ["ATLAS_RESOLVED_WEB_URL"])
    backend.update({
        "AGENT_EXECUTION_BACKEND": "cloud_tasks",
        "AGENT_TASKS_PROJECT": os.environ["PROJECT_ID"],
        "AGENT_TASKS_LOCATION": os.environ["REGION"],
        "AGENT_TASKS_QUEUE": "atlas-agent",
        "AGENT_TASKS_API_URL": api_url,
        "AGENT_TASKS_SERVICE_ACCOUNT": os.environ["RUNTIME_SERVICE_ACCOUNT"],
    })
    web.update({"ATLAS_API_URL": api_url, "APP_URL": web_url})
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory.chmod(0o700)
    for name, config in (("backend.yaml", backend), ("web.yaml", web)):
        # Exclusive creation and owner-only permissions also protect manual deployment use.
        with os.fdopen(os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as file:
            yaml.safe_dump(config, file, sort_keys=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--validate", action="store_true")
    mode.add_argument("--render-dir", type=Path)
    args = parser.parse_args()
    try:
        if args.render_dir:
            render_deployment(args.render_dir)
            return 0
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
