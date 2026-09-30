import React, { useRef, useEffect, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount, OnChange } from '@monaco-editor/react';
import {
  Code2,
  Users,
  X,
  FileCode,
  FileText,
  Search,
  WrapText,
  Map,
  Save,
} from 'lucide-react';
import type { ProjectFile, CursorPosition } from '../types';
import { api } from '../services/api';
import { getMonacoLanguage } from '../utils/languages';

interface EditorPanelProps {
  files: ProjectFile[];
  activeFile: ProjectFile | null;
  openTabs: ProjectFile[];
  onSelectFile: (file: ProjectFile) => void;
  onCloseTab: (fileId: string) => void;
  onCodeChange: (fileId: string, content: string) => void;
  onCursorMove: (fileId: string, cursor: { lineNumber: number; column: number }) => void;
  onSelectionChange: (selectedText: string) => void;
  onSaveFile?: (file: ProjectFile) => void;
  remoteCursors: CursorPosition[];
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  files,
  activeFile,
  openTabs,
  onSelectFile,
  onCloseTab,
  onCodeChange,
  onCursorMove,
  onSelectionChange,
  onSaveFile,
  remoteCursors,
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const isRemoteUpdate = useRef<boolean>(false);
  const completionDisposableRef = useRef<any>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Editor configuration toggles
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [minimap, setMinimap] = useState<boolean>(false);
  const [showQuickOpen, setShowQuickOpen] = useState<boolean>(false);
  const [quickSearch, setQuickSearch] = useState<string>('');

  // Register dynamic Monaco AI inline completions provider
  const registerCompletionProvider = useCallback((monaco: any) => {
    if (completionDisposableRef.current) {
      completionDisposableRef.current.dispose();
    }

    completionDisposableRef.current = monaco.languages.registerInlineCompletionsProvider('*', {
      provideInlineCompletions: async (model: any, position: any, _context: any, token: any) => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        return new Promise((resolve) => {
          debounceTimerRef.current = window.setTimeout(async () => {
            if (token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            const codeBefore = model.getValueInRange({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });
            const codeAfter = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: model.getLineCount(),
              endColumn: model.getLineMaxColumn(model.getLineCount()),
            });

            // Minimum length check
            if (codeBefore.trim().length < 6) {
              resolve({ items: [] });
              return;
            }

            const language = getMonacoLanguage(activeFile?.name || 'py');

            try {
              abortControllerRef.current = new AbortController();
              const result = await api.aiComplete(
                codeBefore.slice(-3000),
                codeAfter.slice(0, 1200),
                language,
                activeFile?.name || '',
              );

              if (token.isCancellationRequested || !result.completion) {
                resolve({ items: [] });
                return;
              }

              resolve({
                items: [
                  {
                    insertText: result.completion,
                    range: {
                      startLineNumber: position.lineNumber,
                      startColumn: position.column,
                      endLineNumber: position.lineNumber,
                      endColumn: position.column,
                    },
                  },
                ],
              });
            } catch {
              resolve({ items: [] });
            }
          }, 450); // 450ms debounce
        });
      },
      freeInlineCompletions: () => {},
    });
  }, [activeFile?.name]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Track cursor movements for collaboration
    editor.onDidChangeCursorPosition((e) => {
      if (activeFile) {
        onCursorMove(activeFile.id, {
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        });
      }
    });

    // Track text selection for contextual AI
    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel();
      if (model) {
        const text = model.getValueInRange(e.selection);
        onSelectionChange(text);
      }
    });

    // Professional Dark Graphite IDE Theme
    monaco.editor.defineTheme('ide-graphite', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '626978', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c678dd', fontStyle: 'bold' },
        { token: 'string', foreground: '98c379' },
        { token: 'number', foreground: 'd19a66' },
        { token: 'type', foreground: 'e5c07b' },
        { token: 'function', foreground: '61afef' },
        { token: 'variable', foreground: 'abb2bf' },
        { token: 'operator', foreground: '56b6c2' },
      ],
      colors: {
        'editor.background': '#111215',
        'editor.foreground': '#eceef2',
        'editor.lineHighlightBackground': '#18191e',
        'editorLineNumber.foreground': '#4b505c',
        'editorLineNumber.activeForeground': '#eceef2',
        'editorCursor.foreground': '#10b981',
        'editor.selectionBackground': '#263345',
        'editor.inactiveSelectionBackground': '#1a222e',
        'editorIndentGuide.background': '#1e2026',
        'editorIndentGuide.activeBackground': '#30343f',
        'editorBracketMatch.background': '#283142',
        'editorBracketMatch.border': '#38bdf8',
        'editorGutter.background': '#111215',
      },
    });
    monaco.editor.setTheme('ide-graphite');

    // Add Ctrl+S Save command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeFile && onSaveFile) {
        onSaveFile(activeFile);
      }
    });

    // Add Ctrl+P Quick Open command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => {
      setShowQuickOpen(true);
    });

    registerCompletionProvider(monaco);
  };

  const handleContentChange: OnChange = (value) => {
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    if (activeFile && value !== undefined) {
      onCodeChange(activeFile.id, value);
    }
  };

  // Sync external remote updates without losing cursor position
  useEffect(() => {
    if (!editorRef.current || !activeFile) return;
    const currentVal = editorRef.current.getValue();
    if (activeFile.content !== currentVal) {
      isRemoteUpdate.current = true;
      const position = editorRef.current.getPosition();
      editorRef.current.setValue(activeFile.content);
      if (position) {
        editorRef.current.setPosition(position);
      }
    }
  }, [activeFile?.content]);

  // Global keyboard shortcut for Quick Open (Ctrl+P / Cmd+P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowQuickOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && showQuickOpen) {
        setShowQuickOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQuickOpen]);

  useEffect(() => {
    return () => {
      if (completionDisposableRef.current) {
        completionDisposableRef.current.dispose();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const getTabIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['py', 'pyw', 'c', 'cpp', 'java', 'go', 'rs', 'php', 'rb', 'cs', 'kt', 'sh'].includes(ext)) {
      return <Code2 className="w-3.5 h-3.5 text-[#10b981] shrink-0" />;
    }
    if (['js', 'jsx', 'ts', 'tsx', 'html', 'css'].includes(ext)) {
      return <FileCode className="w-3.5 h-3.5 text-[#fbbf24] shrink-0" />;
    }
    return <FileText className="w-3.5 h-3.5 text-[#9a9ea8] shrink-0" />;
  };

  const filteredQuickFiles = files.filter((f) =>
    f.name.toLowerCase().includes(quickSearch.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111215] overflow-hidden relative">
      {/* File Tabs Bar */}
      <div className="h-9 bg-[#17181c] border-b border-[#2b2d35] flex items-center justify-between overflow-x-auto select-none px-2 gap-1 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {openTabs.map((file) => {
            const isActive = file.id === activeFile?.id;
            return (
              <div
                key={file.id}
                onClick={() => onSelectFile(file)}
                className={`group h-7 px-2.5 flex items-center gap-1.5 rounded-t text-xs font-mono border-t border-x cursor-pointer transition ${
                  isActive
                    ? 'bg-[#111215] text-white border-[#2b2d35] border-b-[#111215] font-medium'
                    : 'bg-[#17181c] text-[#9a9ea8] border-transparent hover:text-white hover:bg-[#1e2026]'
                }`}
              >
                {getTabIcon(file.name)}
                <span className="text-[11px] truncate max-w-[140px]">{file.name}</span>
                {file.unsaved && (
                  <span
                    className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0 shadow-xs"
                    title="Unsaved changes (press Ctrl+S to save locally)"
                    aria-label="Unsaved changes"
                  />
                )}
                {openTabs.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(file.id);
                    }}
                    title="Close tab"
                    aria-label={`Close ${file.name}`}
                    className="p-1 text-[#606470] hover:text-white hover:bg-[#2b2d35] rounded transition opacity-0 group-hover:opacity-100 cursor-pointer ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Editor Controls Bar */}
        <div className="flex items-center gap-1 px-1 text-[#9a9ea8]">
          {activeFile && onSaveFile && (
            <button
              onClick={() => onSaveFile(activeFile)}
              title="Save File to Disk (Ctrl+S)"
              aria-label="Save File to Disk (Ctrl+S)"
              className="h-8 w-8 min-w-[32px] flex items-center justify-center text-[#10b981] hover:text-[#34d399] hover:bg-[#202227] rounded transition cursor-pointer"
            >
              <Save className="w-[18px] h-[18px]" />
            </button>
          )}

          <button
            onClick={() => setWordWrap((prev) => (prev === 'on' ? 'off' : 'on'))}
            title={`Word Wrap: ${wordWrap}`}
            aria-label={`Toggle Word Wrap: currently ${wordWrap}`}
            className={`h-8 w-8 min-w-[32px] flex items-center justify-center rounded transition cursor-pointer ${
              wordWrap === 'on' ? 'text-[#10b981] bg-[#1e2026]' : 'hover:text-white hover:bg-[#202227]'
            }`}
          >
            <WrapText className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={() => setMinimap((prev) => !prev)}
            title={`Minimap: ${minimap ? 'Enabled' : 'Disabled'}`}
            aria-label={`Toggle Minimap: currently ${minimap ? 'enabled' : 'disabled'}`}
            className={`h-8 w-8 min-w-[32px] flex items-center justify-center rounded transition cursor-pointer ${
              minimap ? 'text-[#10b981] bg-[#1e2026]' : 'hover:text-white hover:bg-[#202227]'
            }`}
          >
            <Map className="w-[18px] h-[18px]" />
          </button>

          <button
            onClick={() => setShowQuickOpen(true)}
            title="Quick Open File (Ctrl+P)"
            aria-label="Quick Open File (Ctrl+P)"
            className="h-8 w-8 min-w-[32px] flex items-center justify-center hover:text-white hover:bg-[#202227] rounded transition cursor-pointer"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* Editor Surface & Presence Overlay */}
      <div className="flex-1 relative overflow-hidden">
        {remoteCursors.length > 0 && (
          <div className="absolute top-2 right-4 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#17181c]/95 border border-[#2b2d35] text-[11px] text-[#9a9ea8] shadow-md">
            <Users className="w-3.5 h-3.5 text-[#10b981]" />
            <span>
              {remoteCursors.map((c) => `${c.user_name} (Line ${c.cursor.lineNumber})`).join(', ')}
            </span>
          </div>
        )}

        {activeFile ? (
          <Editor
            height="100%"
            language={getMonacoLanguage(activeFile.name)}
            value={activeFile.content}
            theme="ide-graphite"
            onChange={handleContentChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: minimap },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, 'Courier New', monospace",
              fontLigatures: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              wordWrap: wordWrap,
              autoClosingBrackets: 'always',
              autoClosingQuotes: 'always',
              autoSurround: 'languageDefined',
              folding: true,
              foldingHighlight: true,
              matchBrackets: 'always',
              inlineSuggest: { enabled: true, mode: 'subwordSmart' },
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'smart',
              tabCompletion: 'on',
              smoothScrolling: true,
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-xs text-[#606470] h-full">
            <Code2 className="w-8 h-8 stroke-1 text-[#2b2d35] mb-2" />
            <span>Select or create a file in the explorer to start editing</span>
          </div>
        )}
      </div>

      {/* Quick Open Modal (Ctrl+P) */}
      {showQuickOpen && (
        <div
          onClick={() => setShowQuickOpen(false)}
          className="absolute inset-0 bg-black/50 z-50 flex items-start justify-center pt-16"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#17181c] border border-[#2b2d35] rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="p-2.5 border-b border-[#2b2d35] flex items-center gap-2 bg-[#111215]">
              <Search className="w-4 h-4 text-[#9a9ea8]" />
              <input
                type="text"
                autoFocus
                placeholder="Type file name to open..."
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder-[#606470] focus:outline-hidden"
              />
              <span className="text-[10px] text-[#606470] font-mono border border-[#2b2d35] px-1.5 py-0.5 rounded">
                ESC
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
              {filteredQuickFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => {
                    onSelectFile(file);
                    setShowQuickOpen(false);
                    setQuickSearch('');
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-[#202227] text-xs font-mono text-[#eceef2] cursor-pointer"
                >
                  {getTabIcon(file.name)}
                  <span className="truncate">{file.name}</span>
                </div>
              ))}
              {filteredQuickFiles.length === 0 && (
                <div className="p-3 text-center text-xs text-[#606470]">No matching files found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
