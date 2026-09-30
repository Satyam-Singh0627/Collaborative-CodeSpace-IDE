import React, { useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount, OnChange } from '@monaco-editor/react';
import { Code2, Users } from 'lucide-react';
import type { ProjectFile, CursorPosition } from '../types';
import { api } from '../services/api';

interface EditorPanelProps {
  files: ProjectFile[];
  activeFile: ProjectFile | null;
  onSelectFile: (file: ProjectFile) => void;
  onCodeChange: (fileId: string, content: string) => void;
  onCursorMove: (fileId: string, cursor: { lineNumber: number; column: number }) => void;
  onSelectionChange: (selectedText: string) => void;
  remoteCursors: CursorPosition[];
}

export const EditorPanel: React.FC<EditorPanelProps> = ({
  files,
  activeFile,
  onSelectFile,
  onCodeChange,
  onCursorMove,
  onSelectionChange,
  remoteCursors,
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const isRemoteUpdate = useRef<boolean>(false);
  const completionDisposableRef = useRef<any>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Map file names to Monaco language identifiers
  const getLanguage = (fileName?: string) => {
    if (!fileName) return 'python';
    const ext = fileName.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      py: 'python',
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      c: 'c',
      h: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      hpp: 'cpp',
      java: 'java',
      go: 'go',
      rs: 'rust',
      rb: 'ruby',
      php: 'php',
      cs: 'csharp',
      kt: 'kotlin',
      sh: 'shell',
      bash: 'shell',
      md: 'markdown',
      json: 'json',
      html: 'html',
      css: 'css',
      sql: 'sql',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return map[ext || ''] || 'plaintext';
  };

  // Register dynamic AI inline completion provider
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
            if (codeBefore.trim().length < 8) {
              resolve({ items: [] });
              return;
            }

            const language = getLanguage(activeFile?.name);

            try {
              abortControllerRef.current = new AbortController();
              const result = await api.aiComplete(
                codeBefore.slice(-2500),
                codeAfter.slice(0, 1000),
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
          }, 500); // 500ms debounce
        });
      },
      freeInlineCompletions: () => {},
    });
  }, [activeFile?.name]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Track cursor positions
    editor.onDidChangeCursorPosition((e) => {
      if (activeFile) {
        onCursorMove(activeFile.id, {
          lineNumber: e.position.lineNumber,
          column: e.position.column,
        });
      }
    });

    // Track selection changes for contextual AI
    editor.onDidChangeCursorSelection((e) => {
      const model = editor.getModel();
      if (model) {
        const text = model.getValueInRange(e.selection);
        onSelectionChange(text);
      }
    });

    // Professional Neutral Graphite IDE Monaco Theme
    monaco.editor.defineTheme('ide-graphite', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c678dd' },
        { token: 'string', foreground: '98c379' },
        { token: 'number', foreground: 'd19a66' },
        { token: 'type', foreground: 'e5c07b' },
        { token: 'function', foreground: '61afef' },
        { token: 'variable', foreground: 'abb2bf' },
      ],
      colors: {
        'editor.background': '#111215',
        'editor.lineHighlightBackground': '#18191d',
        'editorLineNumber.foreground': '#4b505c',
        'editorLineNumber.activeForeground': '#eceef2',
        'editorCursor.foreground': '#10b981',
        'editor.selectionBackground': '#2b3445',
        'editor.inactiveSelectionBackground': '#1e2533',
        'editorIndentGuide.background': '#1e2026',
        'editorIndentGuide.activeBackground': '#2e313b',
      },
    });
    monaco.editor.setTheme('ide-graphite');

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

  // Sync external remote code update without moving user cursor
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111215] overflow-hidden">
      {/* File Tabs Bar */}
      <div className="h-8 bg-[#17181c] border-b border-[#2b2d35] flex items-center overflow-x-auto select-none px-2 gap-1">
        {files.map((file) => {
          const isActive = file.id === activeFile?.id;
          return (
            <div
              key={file.id}
              onClick={() => onSelectFile(file)}
              className={`h-6 px-3 flex items-center gap-1.5 rounded-t text-xs font-mono border-t border-x cursor-pointer transition ${
                isActive
                  ? 'bg-[#111215] text-white border-[#2b2d35] border-b-[#111215] font-medium'
                  : 'bg-[#17181c] text-[#9a9ea8] border-transparent hover:text-white hover:bg-[#1e2026]'
              }`}
            >
              <Code2 className="w-3 h-3 text-[#10b981]" />
              <span className="text-[11px]">{file.name}</span>
            </div>
          );
        })}
      </div>

      {/* Editor Surface & Presence Overlay */}
      <div className="flex-1 relative">
        {remoteCursors.length > 0 && (
          <div className="absolute top-2 right-4 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#17181c]/95 border border-[#2b2d35] text-[11px] text-[#9a9ea8] shadow-md">
            <Users className="w-3.5 h-3.5 text-[#10b981]" />
            <span>
              {remoteCursors.map((c) => `${c.user_name} (L:${c.cursor.lineNumber})`).join(', ')}
            </span>
          </div>
        )}

        {activeFile ? (
          <Editor
            height="100%"
            language={getLanguage(activeFile.name)}
            value={activeFile.content}
            theme="ide-graphite"
            onChange={handleContentChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
              fontLigatures: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              inlineSuggest: { enabled: true, mode: 'subwordSmart' },
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'smart',
              tabCompletion: 'on',
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[#606470]">
            Select or create a file in the explorer to start editing
          </div>
        )}
      </div>
    </div>
  );
};
