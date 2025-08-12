import axios from 'axios';

interface AffiseStatusResult {
  status: 'ok' | 'error';
  message: string;
  statusCode?: number;
  timestamp: string;
}

export async function createAffiseStatusTool(config: { baseUrl: string; apiKey: string }): Promise<AffiseStatusResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      status: 'error',
      message: 'baseUrl or apiKey not provided',
      timestamp: new Date().toISOString()
    };
  }

  try {
    const testUrl = `${baseUrl}/healthz`;
    
    await axios.options(testUrl, {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      status: 'ok',
      message: `Connection to Affise API (${testUrl}) successful`,
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    let errorMessage = 'Unknown error';
    let statusCode: number | undefined;

    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to server (connection refused)';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timeout exceeded';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Server not found (DNS error)';
    } else if (error.response) {
      errorMessage = error.response.data?.message || error.message;
      statusCode = error.response.status;
    } else {
      errorMessage = error.message;
    }

    return {
      status: 'error',
      message: `Error connecting to Affise API: ${errorMessage}`,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }
}
