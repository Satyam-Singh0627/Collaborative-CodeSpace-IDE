import React, { useState, useMemo } from 'react';
import {
  FileCode,
  FileText,
  Code2,
  File,
  Trash2,
  Edit2,
  Check,
  X,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Upload,
  FolderInput,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import type { ProjectFile } from '../types';
import { getLanguageFromFileName } from '../utils/languages';

interface FileExplorerProps {
  files: ProjectFile[];
  activeFileId: string | null;
  onSelectFile: (file: ProjectFile) => void;
  onCreateFile: (name: string, language: string) => Promise<void>;
  onRenameFile: (fileId: string, newName: string) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
  onOpenLocalFile?: () => void;
  onOpenLocalFolder?: () => void;
  onRefresh?: () => void;
  roomName?: string;
}

interface TreeNode {
  name: string;
  fullPath: string;
  isFolder: boolean;
  file?: ProjectFile;
  children: Record<string, TreeNode>;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onOpenLocalFile,
  onOpenLocalFolder,
  onRefresh,
  roomName = 'Project Workspace',
}) => {
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  // Build hierarchical tree from flat file list with path separators
  const tree = useMemo(() => {
    const root: Record<string, TreeNode> = {};

    files.forEach((file) => {
      const parts = file.name.split('/').filter(Boolean);
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;

        if (!currentLevel[part]) {
          currentLevel[part] = {
            name: part,
            fullPath: currentPath,
            isFolder: !isLast,
            file: isLast ? file : undefined,
            children: {},
          };
        }
        currentLevel = currentLevel[part].children;
      });
    });

    return root;
  }, [files]);

  const toggleFolder = (path: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'py' || ext === 'pyw') return <Code2 className="w-4 h-4 text-[#38bdf8] shrink-0" />;
    if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext)) return <FileCode className="w-4 h-4 text-[#fbbf24] shrink-0" />;
    if (['c', 'cpp', 'cc', 'h', 'hpp'].includes(ext)) return <Code2 className="w-4 h-4 text-[#60a5fa] shrink-0" />;
    if (ext === 'java') return <Code2 className="w-4 h-4 text-[#f87171] shrink-0" />;
    if (ext === 'go') return <Code2 className="w-4 h-4 text-[#2dd4bf] shrink-0" />;
    if (ext === 'rs') return <Code2 className="w-4 h-4 text-[#fb923c] shrink-0" />;
    if (ext === 'php') return <Code2 className="w-4 h-4 text-[#a78bfa] shrink-0" />;
    if (ext === 'rb') return <Code2 className="w-4 h-4 text-[#f43f5e] shrink-0" />;
    if (ext === 'cs') return <Code2 className="w-4 h-4 text-[#10b981] shrink-0" />;
    if (ext === 'kt' || ext === 'kts') return <Code2 className="w-4 h-4 text-[#a855f7] shrink-0" />;
    if (['sh', 'bash', 'zsh'].includes(ext)) return <Code2 className="w-4 h-4 text-[#4ade80] shrink-0" />;
    if (['html', 'htm'].includes(ext)) return <FileCode className="w-4 h-4 text-[#f97316] shrink-0" />;
    if (['css', 'scss', 'sass'].includes(ext)) return <FileCode className="w-4 h-4 text-[#38bdf8] shrink-0" />;
    if (ext === 'json') return <FileText className="w-4 h-4 text-[#eab308] shrink-0" />;
    if (['md', 'markdown'].includes(ext)) return <FileText className="w-4 h-4 text-[#9a9ea8] shrink-0" />;
    return <File className="w-4 h-4 text-[#606470] shrink-0" />;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newItemName.trim();
    if (!raw) return;

    setLoading(true);
    try {
      let finalName = raw;
      if (isCreatingFolder && !finalName.includes('.')) {
        // Create an initial placeholder file inside folder so folder exists in tree
        finalName = `${finalName}/main.py`;
      }
      const lang = getLanguageFromFileName(finalName);
      await onCreateFile(finalName, lang);
      setNewItemName('');
      setIsCreatingFile(false);
      setIsCreatingFolder(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameSubmit = async (fileId: string) => {
    if (!editingFileName.trim()) return;
    setLoading(true);
    try {
      await onRenameFile(fileId, editingFileName.trim());
      setEditingFileId(null);
    } finally {
      setLoading(false);
    }
  };

  // Render tree node recursively
  const renderTree = (nodes: Record<string, TreeNode>, depth = 0) => {
    const keys = Object.keys(nodes).sort((a, b) => {
      // Folders first, then files alphabetically
      if (nodes[a].isFolder && !nodes[b].isFolder) return -1;
      if (!nodes[a].isFolder && nodes[b].isFolder) return 1;
      return a.localeCompare(b);
    });

    return keys.map((key) => {
      const node = nodes[key];
      const isCollapsed = collapsedFolders[node.fullPath];

      if (node.isFolder) {
        return (
          <div key={node.fullPath} className="flex flex-col select-none">
            <div
              onClick={() => toggleFolder(node.fullPath)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className="flex items-center gap-1.5 py-1 text-xs text-[#9a9ea8] hover:text-[#eceef2] hover:bg-[#1e2026] rounded cursor-pointer transition"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3 h-3 text-[#606470]" />
              ) : (
                <ChevronDown className="w-3 h-3 text-[#606470]" />
              )}
              {isCollapsed ? (
                <Folder className="w-3.5 h-3.5 text-[#fbbf24]" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 text-[#fbbf24]" />
              )}
              <span className="truncate font-medium text-[11px]">{node.name}</span>
            </div>

            {!isCollapsed && renderTree(node.children, depth + 1)}
          </div>
        );
      }

      // File Node
      const file = node.file!;
      const isActive = file.id === activeFileId;
      const isEditing = file.id === editingFileId;

      if (isEditing) {
        return (
          <div
            key={file.id}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            className="flex items-center gap-1 py-1 pr-2 bg-[#1e2026] rounded border border-[#2b2d35]"
          >
            <input
              type="text"
              autoFocus
              value={editingFileName}
              onChange={(e) => setEditingFileName(e.target.value)}
              className="flex-1 bg-[#111215] text-xs text-white px-1.5 py-0.5 rounded border border-[#2b2d35] focus:outline-hidden"
            />
            <button
              onClick={() => handleRenameSubmit(file.id)}
              disabled={loading}
              className="p-1 text-[#10b981] hover:bg-[#262830] rounded cursor-pointer"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => setEditingFileId(null)}
              className="p-1 text-[#9a9ea8] hover:bg-[#262830] rounded cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      }

      return (
        <div
          key={file.id}
          onClick={() => onSelectFile(file)}
          style={{ paddingLeft: `${depth * 12 + 14}px` }}
          className={`group flex items-center justify-between pr-2 py-1 rounded text-xs font-mono cursor-pointer transition ${
            isActive
              ? 'bg-[#202227] text-white font-medium border border-[#363945]'
              : 'text-[#9a9ea8] hover:bg-[#1e2026] hover:text-[#eceef2]'
          }`}
        >
          <div className="flex items-center gap-1.5 truncate">
            {getFileIcon(node.name)}
            <span className="truncate text-[11.5px]">{node.name}</span>
            {file.unsaved && <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]"></span>}
          </div>

          <div className="hidden group-hover:flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingFileId(file.id);
                setEditingFileName(file.name);
              }}
              title="Rename file"
              className="p-0.5 text-[#9a9ea8] hover:text-white hover:bg-[#262830] rounded"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            {files.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${file.name}"?`)) {
                    onDeleteFile(file.id);
                  }
                }}
                title="Delete file"
                className="p-0.5 text-[#9a9ea8] hover:text-[#ef4444] hover:bg-[#262830] rounded"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="w-60 border-r border-[#2b2d35] bg-[#17181c] flex flex-col h-full select-none">
      {/* Explorer Header */}
      <div className="px-3 py-2 border-b border-[#2b2d35] flex items-center justify-between text-[11px] font-semibold text-[#9a9ea8] uppercase tracking-wider">
        <span className="truncate max-w-[110px] text-white">{roomName}</span>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setIsCreatingFile(true);
              setIsCreatingFolder(false);
            }}
            title="New File"
            aria-label="Create New File"
            className="h-8 w-8 min-w-[32px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#262830] rounded transition cursor-pointer"
          >
            <FilePlus className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={() => {
              setIsCreatingFolder(true);
              setIsCreatingFile(false);
            }}
            title="New Folder"
            aria-label="Create New Folder"
            className="h-8 w-8 min-w-[32px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#262830] rounded transition cursor-pointer"
          >
            <FolderPlus className="w-[18px] h-[18px]" />
          </button>

          {onOpenLocalFolder && (
            <button
              onClick={onOpenLocalFolder}
              title="Open Local Folder"
              aria-label="Open Local Folder"
              className="h-8 w-8 min-w-[32px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#262830] rounded transition cursor-pointer"
            >
              <FolderInput className="w-[18px] h-[18px]" />
            </button>
          )}

          {onOpenLocalFile && (
            <button
              onClick={onOpenLocalFile}
              title="Open Local File"
              aria-label="Open Local File"
              className="h-8 w-8 min-w-[32px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#262830] rounded transition cursor-pointer"
            >
              <Upload className="w-[18px] h-[18px]" />
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Workspace"
              aria-label="Refresh Workspace Files"
              className="h-8 w-8 min-w-[32px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#262830] rounded transition cursor-pointer"
            >
              <RefreshCw className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* New File / Folder Input Form */}
      {(isCreatingFile || isCreatingFolder) && (
        <form onSubmit={handleCreateSubmit} className="p-2 border-b border-[#2b2d35] bg-[#1e2026] flex items-center gap-1.5">
          <div className="text-[#9a9ea8]">
            {isCreatingFolder ? <Folder className="w-3.5 h-3.5 text-[#fbbf24]" /> : <FileCode className="w-3.5 h-3.5 text-[#38bdf8]" />}
          </div>
          <input
            type="text"
            autoFocus
            placeholder={isCreatingFolder ? 'folder name (e.g. api, src)' : 'file name (e.g. app.ts, main.py)'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 bg-[#111215] border border-[#2b2d35] rounded px-2 py-0.5 text-xs text-white placeholder-[#606470] focus:outline-hidden focus:border-[#10b981]"
          />
          <button
            type="submit"
            disabled={loading}
            className="p-1 text-[#10b981] hover:bg-[#262830] rounded cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreatingFile(false);
              setIsCreatingFolder(false);
              setNewItemName('');
            }}
            className="p-1 text-[#9a9ea8] hover:bg-[#262830] rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Files Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {renderTree(tree)}
      </div>

      {/* Explorer Bottom Quick Actions */}
      <div className="p-2 border-t border-[#2b2d35] bg-[#111215] flex items-center justify-between text-[11px] text-[#606470]">
        <span>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
        <div className="flex items-center gap-2">
          {onOpenLocalFolder && (
            <button
              onClick={onOpenLocalFolder}
              className="text-[#9a9ea8] hover:text-white transition cursor-pointer flex items-center gap-1"
            >
              <FolderInput className="w-3 h-3" />
              <span>Open Local</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
