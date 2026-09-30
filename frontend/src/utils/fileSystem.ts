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

export interface SaveProjectResult {
  success: boolean;
  aborted?: boolean;
  count: number;
  folderName?: string;
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
  maxFiles = 200,
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
        if (file.size > 2 * 1024 * 1024) continue; // Skip files > 2MB

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

      for (let i = 0; i < Math.min(fileList.length, 150); i++) {
        const file = fileList[i];
        const relativePath = file.webkitRelativePath.replace(`${rootName}/`, '');

        if (
          relativePath.includes('/node_modules/') ||
          relativePath.includes('/.git/') ||
          relativePath.includes('/__pycache__/') ||
          file.size > 2 * 1024 * 1024
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

// ---------------------------------------------------------------------------
// SAVE FILE (Single Active File)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SAVE PROJECT (Complete Workspace to Local Folder)
// ---------------------------------------------------------------------------

/**
 * Save the COMPLETE project structure into a chosen local folder on disk.
 * Preserves nested folders, skips node_modules/.git/etc.
 * Provides ZIP fallback for browsers without showDirectoryPicker.
 */
export async function saveProjectLocally(
  files: { name: string; content: string }[],
  projectName = 'Collaborative-CodeSpace-Project',
): Promise<SaveProjectResult> {
  const validFiles = files.filter((f) => {
    const n = f.name;
    return (
      !n.startsWith('.') &&
      !n.includes('/.') &&
      !n.includes('node_modules/') &&
      !n.includes('__pycache__/') &&
      !n.includes('.git/') &&
      !n.includes('dist/')
    );
  });

  if (validFiles.length === 0) {
    return {
      success: false,
      count: 0,
      message: 'No project files to save',
    };
  }

  // 1. Direct folder write using showDirectoryPicker
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const rootDirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
      });

      let savedCount = 0;

      for (const file of validFiles) {
        const parts = file.name.split('/').filter(Boolean);
        const fileName = parts.pop()!;
        let currentDir = rootDirHandle;

        // Traverse / create nested directories
        for (const subDir of parts) {
          currentDir = await currentDir.getDirectoryHandle(subDir, { create: true });
        }

        // Create and write file
        const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file.content);
        await writable.close();
        savedCount++;
      }

      return {
        success: true,
        count: savedCount,
        folderName: rootDirHandle.name,
        message: `Project saved to ${rootDirHandle.name} (${savedCount} files)`,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          aborted: true,
          count: 0,
          message: 'Project save cancelled',
        };
      }
      console.warn('showDirectoryPicker failed, falling back to ZIP archive download:', err);
    }
  }

  // 2. Fallback: Generate ZIP and download
  try {
    const zipBlob = generateZipBlob(validFiles);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
      success: true,
      count: validFiles.length,
      message: `Exported project as ${a.download} (${validFiles.length} files)`,
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: `Failed to export project: ${err.message || 'Unknown error'}`,
    };
  }
}

/**
 * Pure TypeScript zero-dependency ZIP archive generator.
 * Produces valid uncompressed (Store) ZIP file binary blobs.
 */
export function generateZipBlob(files: { name: string; content: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c;
  }

  function getCrc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  for (const f of files) {
    const nameBytes = enc.encode(f.name.replace(/^\/+/, ''));
    const dataBytes = enc.encode(f.content);
    const crc = getCrc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name length)
    const localHdr = new Uint8Array(30 + nameBytes.length);
    const lView = new DataView(localHdr.buffer);
    lView.setUint32(0, 0x04034b50, true); // Local header signature
    lView.setUint16(4, 20, true); // Version needed: 2.0
    lView.setUint16(6, 0, true); // Flags
    lView.setUint16(8, 0, true); // Compression: Store (0)
    lView.setUint16(10, 0, true); // Mod time
    lView.setUint16(12, 0, true); // Mod date
    lView.setUint32(14, crc, true); // CRC32
    lView.setUint32(18, size, true); // Compressed size
    lView.setUint32(22, size, true); // Uncompressed size
    lView.setUint16(26, nameBytes.length, true);
    lView.setUint16(28, 0, true); // Extra field length
    localHdr.set(nameBytes, 30);

    parts.push(localHdr, dataBytes);

    // Central directory header (46 bytes + name length)
    const centralHdr = new Uint8Array(46 + nameBytes.length);
    const cView = new DataView(centralHdr.buffer);
    cView.setUint32(0, 0x02014b50, true); // Central header signature
    cView.setUint16(4, 20, true); // Version made by
    cView.setUint16(6, 20, true); // Version needed
    cView.setUint16(8, 0, true); // Flags
    cView.setUint16(10, 0, true); // Compression method
    cView.setUint16(12, 0, true); // Mod time
    cView.setUint16(14, 0, true); // Mod date
    cView.setUint32(16, crc, true); // CRC32
    cView.setUint32(20, size, true); // Compressed size
    cView.setUint32(24, size, true); // Uncompressed size
    cView.setUint16(28, nameBytes.length, true);
    cView.setUint16(30, 0, true); // Extra field length
    cView.setUint16(32, 0, true); // File comment length
    cView.setUint16(34, 0, true); // Disk number start
    cView.setUint16(36, 0, true); // Internal attributes
    cView.setUint32(38, 0, true); // External attributes
    cView.setUint32(42, offset, true); // Relative offset of local header
    centralHdr.set(nameBytes, 46);

    centralHeaders.push(centralHdr);
    offset += localHdr.length + dataBytes.length;
  }

  const centralOffset = offset;
  let centralSize = 0;
  for (const ch of centralHeaders) {
    centralSize += ch.length;
  }

  // End of Central Directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true); // EOCD signature
  eView.setUint16(4, 0, true); // Disk number
  eView.setUint16(6, 0, true); // Start disk
  eView.setUint16(8, files.length, true); // Records on this disk
  eView.setUint16(10, files.length, true); // Total records
  eView.setUint32(12, centralSize, true); // Size of central directory
  eView.setUint32(16, centralOffset, true); // Offset of central directory
  eView.setUint16(20, 0, true); // Comment length

  return new Blob([...parts, ...centralHeaders, eocd] as BlobPart[], { type: 'application/zip' });
}

/**
 * Legacy wrapper for backwards compatibility with any existing calls.
 */
export async function saveLocalFile(file: LocalFileEntry): Promise<boolean> {
  const res = await saveActiveFileLocally(file);
  return res.success;
}
