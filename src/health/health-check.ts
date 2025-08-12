#!/usr/bin/env node

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

// CLI execution when run directly
if (require.main === module) {
  performHealthCheck()
    .then(result => {
      // Output for Docker health check (simple)
      if (process.argv.includes('--simple')) {
        console.log(result.status === 'healthy' ? 'HEALTHY' : 'UNHEALTHY');
        process.exit(result.status === 'healthy' ? 0 : 1);
      }
      
      // Detailed output for debugging
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === 'healthy' ? 0 : 1);
    })
    .catch(error => {
      console.error('Health check failed:', error.message);
      process.exit(1);
    });
}

export { performHealthCheck };
