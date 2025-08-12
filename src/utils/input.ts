import inquirer from 'inquirer';

export async function promptForConfig(): Promise<{ baseUrl: string; apiKey: string }> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Enter Affise API base URL (e.g. https://api.affise.com):',
      validate: (input: string) => {
        if (!input.trim()) return 'Base URL is required';
        if (!input.startsWith('http')) return 'Must be a valid URL starting with http:// or https://';
        return true;
      }
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'Enter Affise API key:',
      validate: (input: string) => {
        if (!input.trim()) return 'API key is required';
        if (input.length < 10) return 'API key seems too short';
        return true;
      }
    }
  ]);

  return {
    baseUrl: answers.baseUrl.trim().replace(/\/$/, ''), // Remove trailing slash
    apiKey: answers.apiKey.trim()
  };
}