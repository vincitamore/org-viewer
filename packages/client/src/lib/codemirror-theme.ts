/**
 * CodeMirror theme that reads from CSS custom properties (--term-*)
 * This ensures the code editor matches whatever terminal theme is active.
 */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Editor chrome theme — backgrounds, gutters, selection, cursor
 * Uses CSS variables so it auto-updates when terminal theme changes.
 */
export const terminalEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--term-background)',
    color: 'var(--term-foreground)',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
    fontSize: '13px',
    lineHeight: '1.6',
    height: '100%',
  },
  '.cm-scroller': {
    overflow: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--term-border) transparent',
  },
  '.cm-content': {
    caretColor: 'var(--term-primary)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--term-primary)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--term-selection)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--term-selection) 50%, transparent)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--term-background)',
    color: 'var(--term-muted)',
    borderRight: '1px solid var(--term-border)',
    fontFamily: 'inherit',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--term-selection) 50%, transparent)',
    color: 'var(--term-foreground)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 4px',
    minWidth: '3em',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--term-selection)',
    color: 'var(--term-muted)',
    border: '1px solid var(--term-border)',
    borderRadius: '2px',
    padding: '0 4px',
  },
  // Search panel
  '.cm-panels': {
    backgroundColor: 'var(--term-background)',
    color: 'var(--term-foreground)',
    borderTop: '1px solid var(--term-border)',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid var(--term-border)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--term-warning) 30%, transparent)',
    outline: '1px solid var(--term-warning)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--term-primary) 30%, transparent)',
    outline: '1px solid var(--term-primary)',
  },
  // Tooltip
  '.cm-tooltip': {
    backgroundColor: 'var(--term-background)',
    color: 'var(--term-foreground)',
    border: '1px solid var(--term-border)',
  },
  // Panel inputs
  '.cm-panel input': {
    backgroundColor: 'var(--term-selection)',
    color: 'var(--term-foreground)',
    border: '1px solid var(--term-border)',
    padding: '2px 6px',
    fontFamily: 'inherit',
  },
  '.cm-panel button': {
    backgroundColor: 'var(--term-selection)',
    color: 'var(--term-foreground)',
    border: '1px solid var(--term-border)',
    padding: '2px 8px',
    cursor: 'pointer',
  },
  '.cm-panel button:hover': {
    backgroundColor: 'var(--term-border)',
  },
  // Matching bracket
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--term-accent) 25%, transparent)',
    outline: '1px solid var(--term-accent)',
  },
}, { dark: true });

/**
 * Syntax highlighting — maps language tokens to theme colors.
 * Uses CSS variable values read at creation time.
 */
export const terminalHighlightStyle = syntaxHighlighting(HighlightStyle.define([
  // Keywords, control flow
  { tag: tags.keyword, color: 'var(--term-primary)' },
  { tag: tags.controlKeyword, color: 'var(--term-primary)', fontWeight: 'bold' },

  // Functions, methods
  { tag: tags.function(tags.variableName), color: 'var(--term-secondary)' },
  { tag: tags.function(tags.propertyName), color: 'var(--term-secondary)' },
  { tag: tags.definition(tags.variableName), color: 'var(--term-foreground)' },
  { tag: tags.definition(tags.function(tags.variableName)), color: 'var(--term-secondary)' },

  // Types, classes
  { tag: tags.typeName, color: 'var(--term-info)' },
  { tag: tags.className, color: 'var(--term-info)' },
  { tag: tags.namespace, color: 'var(--term-info)' },

  // Strings
  { tag: tags.string, color: 'var(--term-accent)' },
  { tag: tags.special(tags.string), color: 'var(--term-accent)' },

  // Numbers, booleans
  { tag: tags.number, color: 'var(--term-warning)' },
  { tag: tags.bool, color: 'var(--term-warning)' },
  { tag: tags.null, color: 'var(--term-warning)' },

  // Comments
  { tag: tags.comment, color: 'var(--term-muted)', fontStyle: 'italic' },
  { tag: tags.lineComment, color: 'var(--term-muted)', fontStyle: 'italic' },
  { tag: tags.blockComment, color: 'var(--term-muted)', fontStyle: 'italic' },

  // Operators, punctuation
  { tag: tags.operator, color: 'var(--term-primary)' },
  { tag: tags.punctuation, color: 'var(--term-muted)' },
  { tag: tags.bracket, color: 'var(--term-foreground)' },

  // Properties, attributes
  { tag: tags.propertyName, color: 'var(--term-foreground)' },
  { tag: tags.attributeName, color: 'var(--term-secondary)' },
  { tag: tags.attributeValue, color: 'var(--term-accent)' },

  // Tags (HTML/JSX)
  { tag: tags.tagName, color: 'var(--term-primary)' },
  { tag: tags.angleBracket, color: 'var(--term-muted)' },

  // Regular expressions
  { tag: tags.regexp, color: 'var(--term-error)' },

  // Variables
  { tag: tags.variableName, color: 'var(--term-foreground)' },
  { tag: tags.special(tags.variableName), color: 'var(--term-primary)' },

  // Meta, annotations
  { tag: tags.meta, color: 'var(--term-muted)' },
  { tag: tags.annotation, color: 'var(--term-warning)' },

  // Headings (markdown)
  { tag: tags.heading, color: 'var(--term-primary)', fontWeight: 'bold' },
  { tag: tags.heading1, color: 'var(--term-primary)', fontWeight: 'bold', fontSize: '1.2em' },
  { tag: tags.heading2, color: 'var(--term-primary)', fontWeight: 'bold' },
  { tag: tags.heading3, color: 'var(--term-secondary)', fontWeight: 'bold' },

  // Emphasis (markdown)
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },

  // Links
  { tag: tags.link, color: 'var(--term-info)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--term-info)' },

  // Escape sequences
  { tag: tags.escape, color: 'var(--term-warning)' },

  // Invalid
  { tag: tags.invalid, color: 'var(--term-error)', textDecoration: 'underline wavy' },
]));
