import { useState, useCallback, useEffect, useRef } from 'react';
import type { TreeEntry } from '../lib/api';

interface FileTreeProps {
  entries: TreeEntry[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

// TUI-style file type indicators — monospace-friendly, no emoji
function getFileIcon(entry: TreeEntry): { icon: string; color: string } {
  if (entry.isDir) return { icon: '/', color: 'var(--term-secondary)' };
  switch (entry.language) {
    case 'rust': return { icon: 'rs', color: 'var(--term-warning)' };
    case 'typescript':
    case 'typescriptJsx': return { icon: 'ts', color: 'var(--term-info)' };
    case 'javascript':
    case 'javascriptJsx': return { icon: 'js', color: 'var(--term-warning)' };
    case 'python': return { icon: 'py', color: 'var(--term-accent)' };
    case 'json': return { icon: '{}', color: 'var(--term-muted)' };
    case 'markdown': return { icon: 'md', color: 'var(--term-primary)' };
    case 'css': return { icon: 'cs', color: 'var(--term-info)' };
    case 'html': return { icon: '<>', color: 'var(--term-warning)' };
    case 'toml': return { icon: 'tm', color: 'var(--term-muted)' };
    case 'yaml': return { icon: 'ym', color: 'var(--term-muted)' };
    case 'shell':
    case 'powershell': return { icon: 'sh', color: 'var(--term-accent)' };
    case 'sql': return { icon: 'sq', color: 'var(--term-info)' };
    case 'zig': return { icon: 'zg', color: 'var(--term-warning)' };
    default: return { icon: '--', color: 'var(--term-muted)' };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

interface TreeNodeProps {
  entry: TreeEntry;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  defaultOpen?: boolean;
}

function TreeNode({ entry, depth, selectedPath, onSelectFile, defaultOpen = false }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const isSelected = entry.path === selectedPath;

  const handleClick = useCallback(() => {
    if (entry.isDir) {
      setExpanded(prev => !prev);
    } else {
      onSelectFile(entry.path);
    }
  }, [entry, onSelectFile]);

  const { icon, color: iconColor } = getFileIcon(entry);

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full text-left flex items-center gap-1 py-0.5 transition-colors"
        style={{
          paddingLeft: `${depth * 14 + 8}px`,
          paddingRight: '8px',
          backgroundColor: isSelected ? 'var(--term-selection)' : undefined,
          color: isSelected
            ? 'var(--term-primary)'
            : entry.isDir
              ? 'var(--term-secondary)'
              : 'var(--term-foreground)',
          fontFamily: 'inherit',
          borderLeft: isSelected ? '2px solid var(--term-primary)' : '2px solid transparent',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--term-selection)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.backgroundColor = '';
        }}
      >
        {/* Expand/collapse for dirs, or spacer for files */}
        <span className="w-3 text-center shrink-0" style={{ color: 'var(--term-muted)', fontSize: '10px' }}>
          {entry.isDir ? (expanded ? '\u25BE' : '\u25B8') : ' '}
        </span>

        {/* Type badge */}
        <span
          className="w-5 text-center shrink-0"
          style={{
            color: iconColor,
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '-0.5px',
          }}
        >
          {icon}
        </span>

        {/* Name */}
        <span className="truncate min-w-0">{entry.name}</span>

        {/* Size for files */}
        {!entry.isDir && entry.size != null && (
          <span className="ml-auto shrink-0 pl-2" style={{ color: 'var(--term-muted)', fontSize: '10px' }}>
            {formatSize(entry.size)}
          </span>
        )}
      </button>

      {/* Children */}
      {entry.isDir && expanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function FileTree({ entries, selectedPath, onSelectFile }: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll selected file into view
  useEffect(() => {
    if (selectedPath && containerRef.current) {
      const selected = containerRef.current.querySelector('[style*="border-left: 2px solid var(--term-primary)"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedPath]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto py-1"
      style={{
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
        fontSize: '12px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--term-border) transparent',
      }}
    >
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          defaultOpen={entry.isDir}
        />
      ))}
      {entries.length === 0 && (
        <div className="p-4 text-sm" style={{ color: 'var(--term-muted)' }}>
          No files found
        </div>
      )}
    </div>
  );
}
