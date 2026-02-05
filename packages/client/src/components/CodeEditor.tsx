import { useRef, useEffect, useCallback, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { javascript } from '@codemirror/lang-javascript';
import { rust } from '@codemirror/lang-rust';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { terminalEditorTheme, terminalHighlightStyle } from '../lib/codemirror-theme';

interface CodeEditorProps {
  content: string;
  language: string | null;
  readOnly: boolean;
  onSave?: (content: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function getLanguageExtension(lang: string | null) {
  switch (lang) {
    case 'typescript':
      return javascript({ typescript: true });
    case 'typescriptJsx':
      return javascript({ typescript: true, jsx: true });
    case 'javascript':
      return javascript();
    case 'javascriptJsx':
      return javascript({ jsx: true });
    case 'rust':
      return rust();
    case 'python':
      return python();
    case 'markdown':
      return markdown();
    case 'json':
      return json();
    case 'css':
      return css();
    case 'html':
      return html();
    default:
      return null;
  }
}

export default function CodeEditor({ content, language, readOnly, onSave, onDirtyChange }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const originalContentRef = useRef(content);
  const [isDirty, setIsDirty] = useState(false);

  // Track dirty state
  const checkDirty = useCallback((currentContent: string) => {
    const dirty = currentContent !== originalContentRef.current;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [onDirtyChange]);

  // Save handler
  const handleSave = useCallback(() => {
    if (viewRef.current && onSave) {
      const currentContent = viewRef.current.state.doc.toString();
      onSave(currentContent);
      originalContentRef.current = currentContent;
      setIsDirty(false);
      onDirtyChange?.(false);
    }
  }, [onSave, onDirtyChange]);

  // Create editor
  useEffect(() => {
    if (!containerRef.current) return;

    // Build extensions
    const extensions = [
      terminalEditorTheme,
      terminalHighlightStyle,
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      bracketMatching(),
      foldGutter(),
      highlightSelectionMatches(),
      history(),
      indentOnInput(),
      EditorView.lineWrapping,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
    ];

    // Add language support
    const langExt = getLanguageExtension(language);
    if (langExt) {
      extensions.push(langExt);
    }

    // Read-only or editable
    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
      extensions.push(EditorView.editable.of(false));
    } else {
      // Save keybinding
      extensions.push(keymap.of([
        {
          key: 'Ctrl-s',
          mac: 'Cmd-s',
          run: () => {
            handleSave();
            return true;
          },
        },
      ]));

      // Track changes
      extensions.push(EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          checkDirty(update.state.doc.toString());
        }
      }));
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    originalContentRef.current = content;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally only recreate on content/language/readOnly change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, language, readOnly]);

  return (
    <div className="h-full flex flex-col">
      {/* Editor */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{ cursor: readOnly ? 'default' : 'text' }}
      />

      {/* Save bar (edit mode only) */}
      {!readOnly && (
        <div
          className="flex items-center justify-between px-4 py-2 border-t shrink-0"
          style={{
            borderColor: 'var(--term-border)',
            backgroundColor: isDirty ? 'color-mix(in srgb, var(--term-warning) 10%, var(--term-background))' : 'var(--term-background)',
          }}
        >
          <div className="flex items-center gap-3 text-sm">
            {isDirty ? (
              <span style={{ color: 'var(--term-warning)' }}>* Unsaved changes</span>
            ) : (
              <span style={{ color: 'var(--term-muted)' }}>No changes</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: 'var(--term-muted)' }}>
              Ctrl+S save &middot; Esc cancel
            </span>
            <button
              onClick={handleSave}
              disabled={!isDirty}
              className="px-3 py-1 border text-sm transition-colors"
              style={{
                borderColor: isDirty ? 'var(--term-accent)' : 'var(--term-border)',
                color: isDirty ? 'var(--term-accent)' : 'var(--term-muted)',
                opacity: isDirty ? 1 : 0.5,
                cursor: isDirty ? 'pointer' : 'default',
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
