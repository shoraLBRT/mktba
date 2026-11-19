// Regenerates the FE<->BE contract: builds Mktba.Api, writes its OpenAPI document to
// src/shared/api/openapi.json (Swashbuckle CLI, no database needed) and generates
// src/shared/api/schema.d.ts from it with openapi-typescript.
// Usage: npm run gen:api
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(frontendDir, '..');
const apiDir = resolve(repoRoot, 'Mktba.Api');
const specPath = resolve(frontendDir, 'src/shared/api/openapi.json');
const typesPath = resolve(frontendDir, 'src/shared/api/schema.d.ts');

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('dotnet', ['tool', 'restore'], { cwd: repoRoot });
run('dotnet', ['build', 'Mktba.Api.csproj', '--configuration', 'Release', '--nologo', '--verbosity', 'quiet'], { cwd: apiDir });
// The OpenApi environment makes Program.cs skip database migrations and seeding.
run('dotnet', ['swagger', 'tofile', '--output', specPath, 'bin/Release/net8.0/Mktba.Api.dll', 'v1'], {
  cwd: apiDir,
  env: { ...process.env, ASPNETCORE_ENVIRONMENT: 'OpenApi' },
});
run('npx', ['openapi-typescript', specPath, '--output', typesPath], { cwd: frontendDir });
