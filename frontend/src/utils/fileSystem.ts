import { getLanguageFromFileName } from './languages';

export interface LocalFileEntry {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  handle?: any;
  isLocal: boolean;
}

export interface LocalFolderResult {
  rootName: string;
  files: LocalFileEntry[];
}

export interface SaveFileResult {
  success: boolean;
  aborted?: boolean;
  handle?: any;
  filename?: string;
  message: string;
}

/**
 * Check if the browser supports the File System Access API.
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window
  );
}

/**
 * Open a single local file using showOpenFilePicker.
 */
export async function openLocalFile(): Promise<LocalFileEntry | null> {
  if (!isFileSystemAccessSupported()) {
    return openLocalFileFallback();
  }

  try {
    const [handle] = await (window as any).showOpenFilePicker({
      multiple: false,
    });
    const file = await handle.getFile();
    const content = await file.text();
    const language = getLanguageFromFileName(file.name);

    return {
      id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: file.name,
      path: file.name,
      content,
      language,
      handle,
      isLocal: true,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return null;
    }
    console.warn('File System Access API failed, trying fallback:', err);
    return openLocalFileFallback();
  }
}

/**
 * Fallback to standard HTML file input for opening a single file.
 */
function openLocalFileFallback(): Promise<LocalFileEntry | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const content = await file.text();
      const language = getLanguageFromFileName(file.name);
      resolve({
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        path: file.name,
        content,
        language,
        isLocal: true,
      });
    };
    input.click();
  });
}

/**
 * Recursively read directory handle entries.
 */
async function readDirectoryRecursive(
  dirHandle: any,
  currentPath = '',
  collected: LocalFileEntry[] = [],
  maxFiles = 100,
): Promise<LocalFileEntry[]> {
  for await (const entry of dirHandle.values()) {
    if (collected.length >= maxFiles) break;

    // Skip hidden files and common ignore folders
    if (
      entry.name.startsWith('.') ||
      entry.name === 'node_modules' ||
      entry.name === '__pycache__' ||
      entry.name === 'dist' ||
      entry.name === 'build' ||
      entry.name === 'target' ||
      entry.name === '.git'
    ) {
      continue;
    }

    const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

    if (entry.kind === 'file') {
      try {
        const file = await entry.getFile();
        // Skip binary or huge files (>1MB)
        if (file.size > 1024 * 1024) continue;

        const content = await file.text();
        const language = getLanguageFromFileName(entry.name);
        collected.push({
          id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          name: itemPath,
          path: itemPath,
          content,
          language,
          handle: entry,
          isLocal: true,
        });
      } catch (e) {
        console.warn(`Could not read file ${itemPath}:`, e);
      }
    } else if (entry.kind === 'directory') {
      await readDirectoryRecursive(entry, itemPath, collected, maxFiles);
    }
  }
  return collected;
}

/**
 * Open a local directory/folder using showDirectoryPicker.
 */
export async function openLocalFolder(): Promise<LocalFolderResult | null> {
  if (!isFileSystemAccessSupported()) {
    return openLocalFolderFallback();
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
    });
    const files: LocalFileEntry[] = [];
    await readDirectoryRecursive(dirHandle, '', files);

    return {
      rootName: dirHandle.name,
      files,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return null;
    }
    console.warn('showDirectoryPicker failed, falling back:', err);
    return openLocalFolderFallback();
  }
}

/**
 * Fallback to directory upload input for opening a folder.
 */
function openLocalFolderFallback(): Promise<LocalFolderResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    (input as any).directory = true;
    input.multiple = true;

    input.onchange = async () => {
      const fileList = input.files;
      if (!fileList || fileList.length === 0) {
        resolve(null);
        return;
      }

      const files: LocalFileEntry[] = [];
      const rootName = fileList[0].webkitRelativePath.split('/')[0] || 'Local Project';

      for (let i = 0; i < Math.min(fileList.length, 100); i++) {
        const file = fileList[i];
        const relativePath = file.webkitRelativePath.replace(`${rootName}/`, '');

        // Skip ignored directories
        if (
          relativePath.includes('/node_modules/') ||
          relativePath.includes('/.git/') ||
          relativePath.includes('/__pycache__/') ||
          file.size > 1024 * 1024
        ) {
          continue;
        }

        try {
          const content = await file.text();
          const language = getLanguageFromFileName(file.name);
          files.push({
            id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            name: relativePath,
            path: relativePath,
            content,
            language,
            isLocal: true,
          });
        } catch {}
      }

      resolve({ rootName, files });
    };

    input.click();
  });
}

/**
 * Save ONLY the active source file to the user's local computer.
 * If a local handle exists, it writes directly.
 * If not, it opens the browser's showSaveFilePicker dialog.
 * If unsupported, downloads as fallback blob.
 */
export async function saveActiveFileLocally(
  file: { name: string; content: string; handle?: any; fileHandle?: any },
  suggestedName?: string,
): Promise<SaveFileResult> {
  const targetHandle = file.handle || file.fileHandle;
  const fileName = (suggestedName || file.name).split('/').pop() || file.name;

  // 1. Direct write to existing File System Access handle
  if (targetHandle && typeof targetHandle.createWritable === 'function') {
    try {
      const writable = await targetHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
      return {
        success: true,
        handle: targetHandle,
        filename: fileName,
        message: `Saved ${fileName}`,
      };
    } catch (err: any) {
      console.warn('Writing to existing handle failed, prompting for location:', err);
    }
  }

  // 2. Open Save File dialog with File System Access API
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
      const pickerOptions: any = {
        suggestedName: fileName,
      };

      if (ext) {
        pickerOptions.types = [
          {
            description: `${ext.toUpperCase()} Source File`,
            accept: { 'text/plain': [`.${ext}`] },
          },
        ];
      }

      const handle = await (window as any).showSaveFilePicker(pickerOptions);
      const writable = await handle.createWritable();
      await writable.write(file.content);
      await writable.close();

      const savedFile = await handle.getFile();
      return {
        success: true,
        handle,
        filename: savedFile.name || fileName,
        message: `Saved ${savedFile.name || fileName}`,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          aborted: true,
          message: 'Save cancelled',
        };
      }
      console.warn('showSaveFilePicker failed, trying download fallback:', err);
    }
  }

  // 3. Fallback: Browser download
  try {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return {
      success: true,
      filename: fileName,
      message: `Downloaded ${fileName}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to save file: ${err.message || 'Unknown error'}`,
    };
  }
}

/**
 * Legacy wrapper for backwards compatibility with any existing calls.
 */
export async function saveLocalFile(file: LocalFileEntry): Promise<boolean> {
  const res = await saveActiveFileLocally(file);
  return res.success;
}
