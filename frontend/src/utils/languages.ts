export interface LanguageConfig {
  key: string;
  name: string;
  extensions: string[];
  monacoLanguage: string;
  isRunnable: boolean;
  defaultEntry: string;
}

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  { key: 'python', name: 'Python', extensions: ['py', 'pyw'], monacoLanguage: 'python', isRunnable: true, defaultEntry: 'main.py' },
  { key: 'javascript', name: 'JavaScript', extensions: ['js', 'jsx', 'mjs', 'cjs'], monacoLanguage: 'javascript', isRunnable: true, defaultEntry: 'index.js' },
  { key: 'typescript', name: 'TypeScript', extensions: ['ts', 'tsx'], monacoLanguage: 'typescript', isRunnable: true, defaultEntry: 'index.ts' },
  { key: 'c', name: 'C', extensions: ['c', 'h'], monacoLanguage: 'c', isRunnable: true, defaultEntry: 'main.c' },
  { key: 'cpp', name: 'C++', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx'], monacoLanguage: 'cpp', isRunnable: true, defaultEntry: 'main.cpp' },
  { key: 'java', name: 'Java', extensions: ['java'], monacoLanguage: 'java', isRunnable: true, defaultEntry: 'Main.java' },
  { key: 'go', name: 'Go', extensions: ['go'], monacoLanguage: 'go', isRunnable: true, defaultEntry: 'main.go' },
  { key: 'rust', name: 'Rust', extensions: ['rs'], monacoLanguage: 'rust', isRunnable: true, defaultEntry: 'main.rs' },
  { key: 'php', name: 'PHP', extensions: ['php', 'phtml'], monacoLanguage: 'php', isRunnable: true, defaultEntry: 'index.php' },
  { key: 'ruby', name: 'Ruby', extensions: ['rb'], monacoLanguage: 'ruby', isRunnable: true, defaultEntry: 'main.rb' },
  { key: 'csharp', name: 'C#', extensions: ['cs'], monacoLanguage: 'csharp', isRunnable: true, defaultEntry: 'Main.cs' },
  { key: 'kotlin', name: 'Kotlin', extensions: ['kt', 'kts'], monacoLanguage: 'kotlin', isRunnable: true, defaultEntry: 'Main.kt' },
  { key: 'bash', name: 'Bash', extensions: ['sh', 'bash', 'zsh'], monacoLanguage: 'shell', isRunnable: true, defaultEntry: 'script.sh' },
  { key: 'html', name: 'HTML', extensions: ['html', 'htm'], monacoLanguage: 'html', isRunnable: false, defaultEntry: 'index.html' },
  { key: 'css', name: 'CSS', extensions: ['css', 'scss', 'sass', 'less'], monacoLanguage: 'css', isRunnable: false, defaultEntry: 'style.css' },
  { key: 'json', name: 'JSON', extensions: ['json'], monacoLanguage: 'json', isRunnable: false, defaultEntry: 'data.json' },
  { key: 'markdown', name: 'Markdown', extensions: ['md', 'markdown'], monacoLanguage: 'markdown', isRunnable: false, defaultEntry: 'README.md' },
  { key: 'sql', name: 'SQL', extensions: ['sql'], monacoLanguage: 'sql', isRunnable: false, defaultEntry: 'query.sql' },
  { key: 'yaml', name: 'YAML', extensions: ['yaml', 'yml'], monacoLanguage: 'yaml', isRunnable: false, defaultEntry: 'config.yaml' },
  { key: 'xml', name: 'XML', extensions: ['xml', 'svg'], monacoLanguage: 'xml', isRunnable: false, defaultEntry: 'document.xml' },
];

/**
 * Detect language key from file name extension.
 */
export function getLanguageFromFileName(fileName: string): string {
  if (!fileName) return 'plaintext';
  const cleanName = fileName.split('/').pop() || fileName;
  const parts = cleanName.split('.');
  if (parts.length <= 1) return 'plaintext';
  const ext = parts.pop()?.toLowerCase() || '';

  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang.extensions.includes(ext)) {
      return lang.key;
    }
  }
  return 'plaintext';
}

/**
 * Get Monaco editor language identifier from file name or language key.
 */
export function getMonacoLanguage(fileNameOrKey: string): string {
  if (!fileNameOrKey) return 'plaintext';

  // Check if direct match by key
  const matchByKey = SUPPORTED_LANGUAGES.find((l) => l.key.toLowerCase() === fileNameOrKey.toLowerCase());
  if (matchByKey) return matchByKey.monacoLanguage;

  // Otherwise detect from file extension
  const detectedKey = getLanguageFromFileName(fileNameOrKey);
  const matchByExt = SUPPORTED_LANGUAGES.find((l) => l.key === detectedKey);
  return matchByExt ? matchByExt.monacoLanguage : 'plaintext';
}

/**
 * Check if a language or file is executable via backend sandbox.
 */
export function isExecutableLanguage(fileNameOrKey: string): boolean {
  const langKey = getLanguageFromFileName(fileNameOrKey);
  const lang = SUPPORTED_LANGUAGES.find((l) => l.key === langKey || l.key === fileNameOrKey);
  return lang?.isRunnable ?? false;
}
