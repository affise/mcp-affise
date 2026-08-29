#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { createAffiseStatusTool } from '../tools/affise_status.js';

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  checks: {
    configuration: boolean;
    affiseApi: boolean;
    process: boolean;
  };
  details: {
    affiseResponse?: any;
    configError?: string;
    uptime: number;
    memory: NodeJS.MemoryUsage;
  };
  timestamp: string;
}

async function performHealthCheck(): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    status: 'healthy',
    checks: {
      configuration: false,
      affiseApi: false,
      process: false
    },
    details: {
      uptime: process.uptime(),
      memory: process.memoryUsage()
    },
    timestamp: new Date().toISOString()
  };

  // Check 1: Process is running (if we're here, it's true)
  result.checks.process = true;

  try {
    // Check 2: Configuration loads successfully
    const config = await loadConfig();
    result.checks.configuration = !!(config?.baseUrl && config?.apiKey);
    
    if (!result.checks.configuration) {
      result.details.configError = 'Missing baseUrl or apiKey';
    }

    // Check 3: Affise API connectivity using existing tool
    if (result.checks.configuration && config) {
      const affiseStatus = await createAffiseStatusTool(config);
      result.checks.affiseApi = affiseStatus.status === 'ok';
      result.details.affiseResponse = affiseStatus;
    }

  } catch (error) {
    result.checks.configuration = false;
    result.details.configError = (error as Error).message;
  }

  // Determine overall health status
  const allChecksPass = Object.values(result.checks).every(Boolean);
  result.status = allChecksPass ? 'healthy' : 'unhealthy';

  return result;
}

// CLI execution when run directly. This package is ESM, so `require.main` is
// not defined here — comparing this module's URL to argv[1] is the ESM
// equivalent, and the previous `require.main === module` guard threw a
// ReferenceError instead of running the check.
//
// `import.meta.url` is realpath-resolved by Node's module loader, but
// `process.argv[1]` is the path as invoked. Whenever that path crosses a
// symlink — macOS's /tmp -> /private/tmp, a Capistrano-style `current ->
// releases/<id>` deploy symlink, an `npm link`ed install — the two URLs
// disagree even though it is the same file, `invokedDirectly` comes out
// false, and the process exits 0 having done nothing: a worse failure mode
// than the ReferenceError it replaced, because a 0 exit and empty stdout
// reads as a passing health check. `realpathSync` on argv[1] before
// converting it is Node's own documented pattern for this comparison.
const invokedDirectly =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (invokedDirectly) {
  performHealthCheck()
    .then(result => {
      // Exit status alone for container health probes.
      if (!process.argv.includes('--simple')) {
        console.log(JSON.stringify(result, null, 2));
      }
      process.exit(result.status === 'healthy' ? 0 : 1);
    })
    .catch(error => {
      console.error('Health check failed:', error.message);
      process.exit(1);
    });
}

export { performHealthCheck };
