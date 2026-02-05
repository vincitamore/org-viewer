import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type OrgDocument } from '../lib/api';
import { liveReload } from '../lib/websocket';
import TuiEditor, { type EditorData } from './TuiEditor';
import { getEditorFields, documentToEditorData, editorDataToPayload } from '../lib/editor-helpers';

interface DocumentViewProps {
  path: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
}

export default function DocumentView({ path, onBack, onNavigate }: DocumentViewProps) {
  const [document, setDocument] = useState<OrgDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchDocument = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getFile(path);
      setDocument(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchDocument();

    // Refresh when this specific document changes
    const unsubUpdate = liveReload.onUpdate((changedPath) => {
      if (changedPath === path) {
        fetchDocument();
      }
    });

    return () => unsubUpdate();
  }, [path, fetchDocument]);

  // Keyboard shortcut for edit mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 'e' to edit (when not already editing and not in an input)
      if (
        e.key === 'e' &&
        !isEditing &&
        document &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsEditing(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, document]);

  const handleSave = useCallback(async (data: EditorData) => {
    if (!document) return;

    try {
      setSaving(true);
      const { frontmatter, content } = editorDataToPayload(data, document);
      await api.updateFile(path, frontmatter, content);
      setIsEditing(false);
      // Refresh document to show updated content
      await fetchDocument();
    } catch (err) {
      alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }, [document, path, fetchDocument]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Process content to handle wikilinks
  const processContent = (content: string): string => {
    // Remove frontmatter
    let processed = content.replace(/^---[\s\S]*?---\n?/, '');

    // Convert wikilinks to markdown links
    processed = processed.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target, alias) => {
        const displayText = alias || target;
        return `[${displayText}](wikilink:${target})`;
      }
    );

    return processed;
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute('href');
    if (href?.startsWith('wikilink:')) {
      e.preventDefault();
      const target = href.replace('wikilink:', '');
      onNavigate(target);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--term-muted)' }}>
        Loading document...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div style={{ color: 'var(--term-error)' }}>Error: {error}</div>
        <button
          onClick={onBack}
          className="px-4 py-2 border"
          style={{ borderColor: 'var(--term-border)', color: 'var(--term-foreground)' }}
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!document) return null;

  // Edit mode - show TuiEditor
  if (isEditing) {
    return (
      <div className="h-full relative">
        {saving && (
          <div
            className="absolute inset-0 flex items-center justify-center z-50"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <span style={{ color: 'var(--term-foreground)' }}>Saving...</span>
          </div>
        )}
        <TuiEditor
          title={`Edit: ${document.title}`}
          fields={getEditorFields(document.type)}
          initialData={documentToEditorData(document)}
          onSave={handleSave}
          onCancel={handleCancelEdit}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b sticky top-0 bg-[var(--term-background)]" style={{ borderColor: 'var(--term-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-bold" style={{ color: 'var(--term-foreground)' }}>
              {document.title}
            </h1>
            <div className="text-xs mt-1" style={{ color: 'var(--term-muted)' }}>
              {document.path}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs px-2 py-1 border hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--term-border)', color: 'var(--term-info)' }}
              title="Press 'e' to edit"
            >
              [e] Edit
            </button>
            {document.type && (
              <span
                className="text-xs px-2 py-1"
                style={{ backgroundColor: 'var(--term-selection)', color: 'var(--term-info)' }}
              >
                {document.type}
              </span>
            )}
            {document.status && (
              <span
                className="text-xs px-2 py-1"
                style={{
                  backgroundColor: 'var(--term-selection)',
                  color: document.status === 'active' ? 'var(--term-success)' :
                         document.status === 'blocked' ? 'var(--term-error)' :
                         document.status === 'paused' ? 'var(--term-warning)' :
                         'var(--term-muted)',
                }}
              >
                {document.status}
              </span>
            )}
          </div>
        </div>

        {/* Tags */}
        {document.tags.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {document.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5"
                style={{
                  backgroundColor: 'var(--term-background)',
                  color: 'var(--term-secondary)',
                  border: '1px solid var(--term-border)',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 max-w-4xl">
        <div className="prose max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  onClick={handleLinkClick}
                  style={{ color: 'var(--term-info)', textDecoration: 'underline' }}
                >
                  {children}
                </a>
              ),
              h1: ({ children }) => (
                <h1 style={{ color: 'var(--term-primary)', borderBottom: '1px solid var(--term-border)', paddingBottom: '0.5rem' }}>
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 style={{ color: 'var(--term-primary)' }}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 style={{ color: 'var(--term-secondary)' }}>{children}</h3>
              ),
              code: ({ className, children }) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code
                      style={{
                        backgroundColor: 'var(--term-selection)',
                        color: 'var(--term-secondary)',
                        padding: '0.125rem 0.25rem',
                        borderRadius: '0.25rem',
                      }}
                    >
                      {children}
                    </code>
                  );
                }
                return <code className={className}>{children}</code>;
              },
              pre: ({ children }) => (
                <pre
                  style={{
                    backgroundColor: 'var(--term-selection)',
                    border: '1px solid var(--term-border)',
                    borderRadius: '0.25rem',
                    padding: '1rem',
                    overflow: 'auto',
                  }}
                >
                  {children}
                </pre>
              ),
              blockquote: ({ children }) => (
                <blockquote
                  style={{
                    borderLeft: '3px solid var(--term-primary)',
                    paddingLeft: '1rem',
                    color: 'var(--term-muted)',
                    fontStyle: 'italic',
                  }}
                >
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      border: '1px solid var(--term-border)',
                    }}
                  >
                    {children}
                  </table>
                </div>
              ),
              th: ({ children }) => (
                <th
                  style={{
                    backgroundColor: 'var(--term-selection)',
                    color: 'var(--term-primary)',
                    padding: '0.5rem',
                    border: '1px solid var(--term-border)',
                    textAlign: 'left',
                  }}
                >
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td style={{ padding: '0.5rem', border: '1px solid var(--term-border)' }}>
                  {children}
                </td>
              ),
            }}
          >
            {processContent(document.content)}
          </ReactMarkdown>
        </div>
      </div>

      {/* Backlinks */}
      {document.backlinks.length > 0 && (
        <div className="px-4 pb-4">
          <div className="border-t pt-4 mt-4" style={{ borderColor: 'var(--term-border)' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--term-muted)' }}>
              Backlinks ({document.backlinks.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {document.backlinks.map((link) => (
                <button
                  key={link}
                  onClick={() => onNavigate(link)}
                  className="text-sm px-2 py-1 border transition-colors hover:bg-white/5"
                  style={{ borderColor: 'var(--term-border)', color: 'var(--term-info)' }}
                >
                  {link.split('/').pop()?.replace('.md', '') || link}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Links */}
      {document.links.length > 0 && (
        <div className="px-4 pb-4">
          <div className="border-t pt-4" style={{ borderColor: 'var(--term-border)' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--term-muted)' }}>
              Links ({document.links.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {document.links.map((link) => (
                <button
                  key={link}
                  onClick={() => onNavigate(link)}
                  className="text-sm px-2 py-1 border transition-colors hover:bg-white/5"
                  style={{ borderColor: 'var(--term-border)', color: 'var(--term-secondary)' }}
                >
                  {link}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
