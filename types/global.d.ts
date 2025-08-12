// Global type declarations for test environment

declare global {
  interface TestConfig {
    baseUrl: string;
    apiKey: string;
    timeout: number;
  }

  // Extend NodeJS global to include testConfig
  var testConfig: TestConfig;
}

// This file needs to be a module to extend global scope
export {};
