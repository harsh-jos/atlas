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

    def test_rendered_settings_merge_urls_and_preserve_private_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            backend = yaml.safe_load((ROOT / 'deploy/backend.env.example.yaml').read_text())
            web = yaml.safe_load((ROOT / 'deploy/web.env.example.yaml').read_text())
            backend['SUPABASE_SERVICE_KEY'] = 'test:$literal\nwith a second line'
            files = {}
            originals = {}
            for name, config in [('BACKEND_ENV_FILE', backend), ('WEB_ENV_FILE', web)]:
                path = root / f'{name}.yaml'
                path.write_text(yaml.safe_dump(config))
                files[name] = str(path)
                originals[path] = path.read_bytes()
            environment = {**files, 'PROJECT_ID': 'test-project', 'REGION': 'asia-northeast1',
                'RUNTIME_SERVICE_ACCOUNT': 'runtime@test-project.iam.gserviceaccount.com',
                'ATLAS_RESOLVED_API_URL': 'https://api.example.run.app',
                'ATLAS_RESOLVED_WEB_URL': 'https://web.example.run.app',
                'PUBLIC_APP_URL': 'https://app.example.com', 'GITHUB_ACTIONS': 'false'}
            target = root / 'rendered'
            with patch.dict(os.environ, environment):
                runtime_config.render_deployment(target)
            prepared_backend = yaml.safe_load((target / 'backend.yaml').read_text())
            prepared_web = yaml.safe_load((target / 'web.yaml').read_text())
            self.assertEqual(prepared_backend['SUPABASE_SERVICE_KEY'], backend['SUPABASE_SERVICE_KEY'])
            self.assertEqual(prepared_backend['AGENT_TASKS_API_URL'], 'https://api.example.run.app')
            self.assertEqual(prepared_backend['AGENT_EXECUTION_BACKEND'], 'cloud_tasks')
            self.assertEqual(prepared_backend['AGENT_TASKS_SERVICE_ACCOUNT'], environment['RUNTIME_SERVICE_ACCOUNT'])
            self.assertEqual(prepared_web['ATLAS_API_URL'], 'https://api.example.run.app')
            self.assertEqual(prepared_web['APP_URL'], 'https://app.example.com')
            self.assertNotIn('SUPABASE_SERVICE_KEY', prepared_web)
            self.assertNotIn('DATABASE_URL', prepared_web)
            for path, before in originals.items():
                self.assertEqual(path.read_bytes(), before)
            for name in ('backend.yaml', 'web.yaml'):
                self.assertEqual((target / name).stat().st_mode & 0o777, 0o600)

    def test_rejects_rendered_secrets_inside_the_build_context(self):
        with self.assertRaisesRegex(ValueError, 'outside'):
            runtime_config.render_deployment(ROOT / 'deploy/rendered')

    def test_images_build_in_parallel_with_separate_caches_and_deploy_waits_for_both(self):
        workflow = yaml.safe_load((ROOT / '.github/workflows/database.yml').read_text())
        jobs = workflow['jobs']
        images = jobs['images']
        self.assertNotIn('needs', images)
        self.assertEqual({item['image'] for item in images['strategy']['matrix']['include']}, {'api', 'web'})
        build = next(step for step in images['steps'] if step.get('uses', '').startswith('docker/build-push-action@'))
        self.assertIn('matrix.image', build['with']['cache-from'])
        self.assertIn('matrix.image', build['with']['cache-to'])
        self.assertIn('images', jobs['deploy']['needs'])
        self.assertIn('github.run_id', jobs['deploy']['env']['API_IMAGE'])
        for step in images['steps']:
            if step.get('uses', '').startswith(('google-github-actions/auth@', 'docker/login-action@')):
                self.assertEqual(step['if'], "env.PUBLISH_IMAGES == 'true'")


class RolloutTests(unittest.TestCase):
    def rollout(self, *, migration_status=0, backend_status=0, build_status=0, prebuilt=True, queue_status=0, existing_services=True, require_parallel=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / 'calls'
            log.touch()
            programs = {
                'python': f'''#!/bin/sh
if [ "$2" = "--validate" ]; then exit 0; fi
if [ "$2" = "--render-dir" ]; then
  printf 'render %s %s\\n' "$ATLAS_RESOLVED_API_URL" "$ATLAS_RESOLVED_WEB_URL" >> "$DEPLOY_TEST_LOG"
  printf 'prepared backend' > "$3/backend.yaml"
  printf 'prepared web' > "$3/web.yaml"
  exit 0
fi
printf 'migrate\\n' >> "$DEPLOY_TEST_LOG"
exit {migration_status}
''',
                'docker': f'''#!/bin/sh
printf 'docker %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
if [ "$1" = "build" ] && [ "{require_parallel}" = "True" ]; then
  for argument in "$@"; do context="$argument"; done
  if [ "$context" = "backend" ]; then kind=api; else kind=web; fi
  touch "$DEPLOY_TEST_DIR/build.$kind"
  tries=0
  while [ ! -f "$DEPLOY_TEST_DIR/build.api" ] || [ ! -f "$DEPLOY_TEST_DIR/build.web" ]; do
    tries=$((tries+1))
    if [ "$tries" -gt 50 ]; then exit 99; fi
    sleep 0.02
  done
fi
exit {build_status}
''',
                'gcloud': f'''#!/bin/sh
printf 'gcloud %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
if [ "$1 $2 $3 $4" = "run deploy atlas-api --project" ]; then exit {backend_status}; fi
if [ "$1 $2" = "tasks queues" ]; then exit {queue_status}; fi
if [ "$1 $2 $3 $4" = "run services describe atlas-api" ]; then
  if [ "{existing_services}" = "False" ]; then exit 1; fi
  echo https://api.example.run.app
fi
if [ "$1 $2 $3 $4" = "run services describe atlas-web" ]; then
  if [ "{existing_services}" = "False" ]; then exit 1; fi
  echo https://web.example.run.app
fi
if [ "$1 $2" = "projects describe" ]; then echo 123456789; fi
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
                   'ATLAS_DEPLOY_PYTHON': str(root / 'python'), 'DEPLOY_TEST_LOG': str(log), 'DEPLOY_TEST_DIR': str(root)}
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
        self.assertIn("migrate", calls)
        self.assertFalse(any("run deploy " in call for call in calls))

    def test_missing_queue_permissions_prevent_live_migration(self):
        result, calls = self.rollout(queue_status=13)
        self.assertEqual(result.returncode, 13)
        self.assertNotIn('migrate', calls)
        self.assertFalse(any('run deploy ' in call for call in calls))

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
        self.assertIn('render https://api.example.run.app https://web.example.run.app', calls)
        self.assertFalse(any('run services update' in call for call in calls))
        deploys = [call for call in calls if 'run deploy ' in call]
        self.assertEqual(len(deploys), 2)
        self.assertTrue(all('--env-vars-file ' in call and 'atlas-deploy.' in call for call in deploys))
        self.assertFalse(any('--set-secrets' in call or 'run jobs' in call for call in calls))
        self.assertLess(next(i for i, call in enumerate(calls) if "tasks queues describe" in call), calls.index("migrate"))

    def test_initial_services_also_receive_urls_in_the_first_revision(self):
        result, calls = self.rollout(existing_services=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('render https://atlas-api-123456789.asia-northeast1.run.app https://atlas-web-123456789.asia-northeast1.run.app', calls)
        self.assertFalse(any('run services update' in call for call in calls))

    def test_manual_builds_start_in_parallel_before_publishing_or_migration(self):
        result, calls = self.rollout(prebuilt=False, require_parallel=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        builds = [i for i, call in enumerate(calls) if call.startswith('docker build ')]
        pushes = [i for i, call in enumerate(calls) if call.startswith('docker push ')]
        self.assertEqual(len(builds), 2)
        self.assertEqual(len(pushes), 2)
        self.assertLess(max(builds), min(pushes))
        self.assertLess(max(pushes), calls.index('migrate'))


if __name__ == '__main__':
    unittest.main()
