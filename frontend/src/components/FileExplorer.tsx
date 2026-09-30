import React, { useState } from 'react';
import { Plus, Trash2, Edit2, FileText, Code2, FileCode, Check, X, File } from 'lucide-react';
import type { ProjectFile } from '../types';

interface FileExplorerProps {
  files: ProjectFile[];
  activeFileId: string | null;
  onSelectFile: (file: ProjectFile) => void;
  onCreateFile: (name: string, language: string) => Promise<void>;
  onRenameFile: (fileId: string, newName: string) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState('');
  const [loading, setLoading] = useState(false);

  const getLanguageFromFileName = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      c: 'c',
      h: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      hpp: 'cpp',
      java: 'java',
      go: 'go',
      rs: 'rust',
      php: 'php',
      rb: 'ruby',
      cs: 'csharp',
      kt: 'kotlin',
      sh: 'bash',
      bash: 'bash',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
    };
    return map[ext] || 'plaintext';
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'py') return <Code2 className="w-3.5 h-3.5 text-[#38bdf8]" />;
    if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') return <FileCode className="w-3.5 h-3.5 text-[#fbbf24]" />;
    if (ext === 'c' || ext === 'cpp' || ext === 'h') return <Code2 className="w-3.5 h-3.5 text-[#60a5fa]" />;
    if (ext === 'java') return <Code2 className="w-3.5 h-3.5 text-[#f87171]" />;
    if (ext === 'go') return <Code2 className="w-3.5 h-3.5 text-[#2dd4bf]" />;
    if (ext === 'rs') return <Code2 className="w-3.5 h-3.5 text-[#fb923c]" />;
    if (ext === 'php') return <Code2 className="w-3.5 h-3.5 text-[#a78bfa]" />;
    if (ext === 'rb') return <Code2 className="w-3.5 h-3.5 text-[#f43f5e]" />;
    if (ext === 'md') return <FileText className="w-3.5 h-3.5 text-[#9a9ea8]" />;
    return <File className="w-3.5 h-3.5 text-[#606470]" />;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    setLoading(true);
    try {
      const lang = getLanguageFromFileName(newFileName.trim());
      await onCreateFile(newFileName.trim(), lang);
      setNewFileName('');
      setIsCreating(false);
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async (fileId: string) => {
    if (!editingFileName.trim()) return;
    setLoading(true);
    try {
      await onRenameFile(fileId, editingFileName.trim());
      setEditingFileId(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-56 border-r border-[#2b2d35] bg-[#17181c] flex flex-col h-full select-none">
      {/* Explorer Header */}
      <div className="px-3 py-2 border-b border-[#2b2d35] flex items-center justify-between text-[11px] font-semibold text-[#9a9ea8] uppercase tracking-wider">
        <span>Project Files</span>
        <button
          onClick={() => setIsCreating(true)}
          title="New File"
          className="p-1 hover:text-white hover:bg-[#262830] rounded transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New file input row */}
      {isCreating && (
        <form onSubmit={handleCreate} className="p-2 border-b border-[#2b2d35] bg-[#1e2026] flex items-center gap-1.5">
          <input
            type="text"
            autoFocus
            placeholder="e.g. script.py, main.cpp"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            className="flex-1 bg-[#111215] border border-[#2b2d35] rounded px-2 py-1 text-xs text-white focus:outline-hidden focus:border-[#10b981]"
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
            onClick={() => { setIsCreating(false); setNewFileName(''); }}
            className="p-1 text-[#9a9ea8] hover:bg-[#262830] rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {files.map((file) => {
          const isActive = file.id === activeFileId;
          const isEditing = file.id === editingFileId;

          if (isEditing) {
            return (
              <div key={file.id} className="flex items-center gap-1 px-2 py-1 bg-[#1e2026] rounded border border-[#2b2d35]">
                <input
                  type="text"
                  autoFocus
                  value={editingFileName}
                  onChange={(e) => setEditingFileName(e.target.value)}
                  className="flex-1 bg-[#111215] text-xs text-white px-1.5 py-0.5 rounded border border-[#2b2d35] focus:outline-hidden"
                />
                <button
                  onClick={() => handleRename(file.id)}
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
              className={`group flex items-center justify-between px-2.5 py-1 rounded-md text-xs font-mono cursor-pointer transition ${
                isActive
                  ? 'bg-[#202227] text-white font-medium border border-[#363945]'
                  : 'text-[#9a9ea8] hover:bg-[#1e2026] hover:text-[#eceef2]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                {getFileIcon(file.name)}
                <span className="truncate">{file.name}</span>
              </div>

              {/* Action buttons */}
              <div className="hidden group-hover:flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingFileId(file.id);
                    setEditingFileName(file.name);
                  }}
                  title="Rename"
                  className="p-0.5 text-[#9a9ea8] hover:text-white hover:bg-[#262830] rounded"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                {files.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete file "${file.name}"?`)) {
                        onDeleteFile(file.id);
                      }
                    }}
                    title="Delete"
                    className="p-0.5 text-[#9a9ea8] hover:text-[#ef4444] hover:bg-[#262830] rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
