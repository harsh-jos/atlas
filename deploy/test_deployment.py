"""Offline deployment checks: no Google API calls or real database connections."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import yaml

import runtime_config

ROOT = Path(__file__).resolve().parents[1]


class ConfigurationTests(unittest.TestCase):
    def test_rejects_runtime_secrets_inside_build_context(self):
        with patch.dict(os.environ, {"BACKEND_ENV_FILE": str(ROOT / 'deploy/backend.env.example.yaml')}):
            with self.assertRaisesRegex(ValueError, 'outside'):
                runtime_config.load_config('BACKEND_ENV_FILE', set())

    def test_rejects_unquoted_yaml_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.yaml'
            path.write_text('AUTH_PROVIDER: supabase\nDB_POOL_SIZE: 2\n')
            with patch.dict(os.environ, {'BACKEND_ENV_FILE': str(path)}):
                with self.assertRaisesRegex(ValueError, 'Quote'):
                    runtime_config.load_config('BACKEND_ENV_FILE', set())

    def test_rejects_backend_credentials_in_web_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = yaml.safe_load((ROOT / 'deploy/backend.env.example.yaml').read_text())
            web = yaml.safe_load((ROOT / 'deploy/web.env.example.yaml').read_text())
            web['DATABASE_URL'] = backend['DATABASE_URL']
            files = {}
            for name, data in [('BACKEND_ENV_FILE', backend), ('WEB_ENV_FILE', web)]:
                path = Path(directory) / f'{name}.yaml'
                path.write_text(yaml.safe_dump(data))
                files[name] = str(path)
            with patch.dict(os.environ, files):
                with self.assertRaisesRegex(ValueError, 'frontend'):
                    runtime_config.configuration()


class RolloutTests(unittest.TestCase):
    def rollout(self, *, migration_status=0, backend_status=0, build_status=0, prebuilt=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / 'calls'
            log.touch()
            programs = {
                'python': f'''#!/bin/sh
if [ "$2" = "--validate" ]; then exit 0; fi
printf 'migrate\\n' >> "$DEPLOY_TEST_LOG"
exit {migration_status}
''',
                'docker': f'''#!/bin/sh
printf 'docker %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
exit {build_status}
''',
                'gcloud': f'''#!/bin/sh
printf 'gcloud %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
if [ "$1 $2 $3 $4" = "run deploy atlas-api --project" ]; then exit {backend_status}; fi
if [ "$1 $2 $3 $4" = "run services describe atlas-api" ]; then echo https://api.example.run.app; fi
if [ "$1 $2 $3 $4" = "run services describe atlas-web" ]; then echo https://web.example.run.app; fi
''',
            }
            for name, source in programs.items():
                path = root / name
                path.write_text(source)
                path.chmod(0o755)
            env = {**os.environ, 'PATH': f'{root}:{os.environ["PATH"]}',
                   'PROJECT_ID': 'test-project', 'REGION': 'asia-northeast1',
                   'RUNTIME_SERVICE_ACCOUNT': 'runtime@test-project.iam.gserviceaccount.com',
                   'BACKEND_ENV_FILE': str(root / 'backend.yaml'),
                   'WEB_ENV_FILE': str(root / 'web.yaml'),
                   'ATLAS_DEPLOY_PYTHON': str(root / 'python'), 'DEPLOY_TEST_LOG': str(log)}
            env.pop('API_IMAGE', None)
            env.pop('WEB_IMAGE', None)
            if prebuilt:
                env.update(API_IMAGE='example/api:test', WEB_IMAGE='example/web:test')
            result = subprocess.run(['bash', str(ROOT / 'deploy/cloud-run.sh')], env=env,
                                    capture_output=True, text=True, check=False)
            return result, log.read_text().splitlines()

    def test_migration_failure_prevents_any_cloud_rollout(self):
        result, calls = self.rollout(migration_status=7)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(calls, ['migrate'])

    def test_failed_backend_prevents_frontend_rollout(self):
        result, calls = self.rollout(backend_status=11)
        self.assertEqual(result.returncode, 11)
        self.assertFalse(any('run deploy atlas-web' in call for call in calls))

    def test_build_failure_prevents_migration(self):
        result, calls = self.rollout(build_status=9, prebuilt=False)
        self.assertEqual(result.returncode, 9)
        self.assertFalse(any('migrate' == call for call in calls))

    def test_success_migrates_then_deploys_api_and_web_with_discovered_urls(self):
        result, calls = self.rollout()
        self.assertEqual(result.returncode, 0, result.stderr)
        actions = [call.split(' --project')[0] for call in calls
                   if call == 'migrate' or 'run deploy ' in call]
        self.assertEqual(actions, ['migrate', 'gcloud run deploy atlas-api', 'gcloud run deploy atlas-web'])
        self.assertIn('ATLAS_API_URL=https://api.example.run.app,APP_URL=https://web.example.run.app', calls[-1])
        self.assertFalse(any('--set-secrets' in call or 'run jobs' in call for call in calls))


if __name__ == '__main__':
    unittest.main()
