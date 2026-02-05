import { useState, useEffect } from 'react';
import { api, type ServerStatus } from '../lib/api';

interface DashboardProps {
  status: ServerStatus;
  onSelectDocument: (path: string) => void;
  onRefresh: () => void;
}

function parseRecentChanges(content: string): string[] {
  // Extract "## Recent Changes" section from current-state.md content
  const match = content.match(/## Recent Changes\s*\n([\s\S]*?)(?=\n---|\n## |\Z)/);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- ') || line.startsWith('* '))
    .map(line => line.replace(/^[-*]\s+/, ''))
    .filter(Boolean)
    .slice(0, 8); // Max 8 items
}

export default function Dashboard({ status, onSelectDocument, onRefresh }: DashboardProps) {
  const [recentChanges, setRecentChanges] = useState<string[]>([]);
  const [changesLastUpdated, setChangesLastUpdated] = useState<string>('');

  useEffect(() => {
    // Try to load context/current-state.md for Recent Changes
    api.getFile('context/current-state.md')
      .then(doc => {
        const changes = parseRecentChanges(doc.content);
        setRecentChanges(changes);

        // Extract last updated line
        const lastUpdated = doc.content.match(/\*Last updated:\s*(.+?)\*/);
        if (lastUpdated) {
          setChangesLastUpdated(lastUpdated[1]);
        }
      })
      .catch(() => {
        // File doesn't exist - graceful degradation
        setRecentChanges([]);
      });
  }, [status]); // Re-fetch when status changes (on refresh)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total Docs" value={status.documents.total} />
        <StatCard
          label="Tasks"
          value={status.documents.byType.task || 0}
          subValue={`${status.documents.byStatus.active || 0} active`}
          color="var(--term-success)"
        />
        <StatCard
          label="Knowledge"
          value={status.documents.byType.knowledge || 0}
          color="var(--term-info)"
        />
        <StatCard
          label="Inbox"
          value={status.documents.byType.inbox || 0}
          color="var(--term-warning)"
        />
        <StatCard
          label="Reminders"
          value={status.documents.byType.reminder || 0}
          subValue={`${status.documents.byStatus.pending || 0} pending`}
          color="#ff6b6b"
        />
      </div>

      {/* Recent Changes from current-state.md */}
      {recentChanges.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ color: 'var(--term-primary)' }} className="font-bold">
              Recent Changes
            </h2>
            {changesLastUpdated && (
              <span className="text-xs" style={{ color: 'var(--term-muted)' }}>
                {changesLastUpdated}
              </span>
            )}
          </div>
          <div
            className="border px-4 py-3 space-y-1"
            style={{ borderColor: 'var(--term-border)' }}
          >
            {recentChanges.map((change, i) => (
              <div
                key={i}
                className="text-sm"
                style={{ color: 'var(--term-foreground)' }}
              >
                <span style={{ color: 'var(--term-muted)' }}>{'>'} </span>
                {change}
              </div>
            ))}
          </div>
          <button
            onClick={() => onSelectDocument('context/current-state.md')}
            className="text-xs mt-1"
            style={{ color: 'var(--term-muted)' }}
          >
            View full state &rarr;
          </button>
        </section>
      )}

      {/* Recent documents */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ color: 'var(--term-primary)' }} className="font-bold">
            Recent Activity
          </h2>
          <button
            onClick={onRefresh}
            className="text-sm px-2 py-1 border"
            style={{ borderColor: 'var(--term-border)', color: 'var(--term-muted)' }}
          >
            Refresh
          </button>
        </div>
        <div className="space-y-2">
          {status.recent.length === 0 ? (
            <div className="text-center py-4" style={{ color: 'var(--term-muted)' }}>
              No recent activity
            </div>
          ) : (
            status.recent.map((doc) => (
              <button
                key={doc.path}
                onClick={() => onSelectDocument(doc.path)}
                className="w-full text-left px-4 py-3 border transition-colors hover:border-[var(--term-primary)]"
                style={{ borderColor: 'var(--term-border)' }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div style={{ color: 'var(--term-foreground)' }}>{doc.title}</div>
                    <div className="text-sm" style={{ color: 'var(--term-muted)' }}>
                      {doc.path}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-xs px-2 py-0.5"
                      style={{
                        backgroundColor: 'var(--term-selection)',
                        color: doc.type === 'task' ? 'var(--term-success)' :
                               doc.type === 'knowledge' ? 'var(--term-info)' :
                               doc.type === 'reminder' ? '#ff6b6b' :
                               'var(--term-warning)',
                      }}
                    >
                      {doc.type}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Top tags */}
      <section>
        <h2 style={{ color: 'var(--term-primary)' }} className="font-bold mb-3">
          Top Tags ({status.tags.total} total)
        </h2>
        <div className="flex flex-wrap gap-2">
          {status.tags.top.map(({ tag, count }) => (
            <span
              key={tag}
              className="text-sm px-2 py-1"
              style={{
                backgroundColor: 'var(--term-selection)',
                color: 'var(--term-secondary)',
              }}
            >
              #{tag} <span style={{ color: 'var(--term-muted)' }}>({count})</span>
            </span>
          ))}
        </div>
      </section>

      {/* Server info */}
      <section
        className="text-sm border-t pt-4"
        style={{ borderColor: 'var(--term-border)', color: 'var(--term-muted)' }}
      >
        <div className="flex items-center justify-between">
          <span>
            Server uptime: {formatUptime(status.server.uptime)}
          </span>
          <span>
            {status.server.connectedClients} connected client{status.server.connectedClients !== 1 ? 's' : ''}
          </span>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  color,
}: {
  label: string;
  value: number;
  subValue?: string;
  color?: string;
}) {
  return (
    <div
      className="border px-4 py-3"
      style={{ borderColor: 'var(--term-border)' }}
    >
      <div className="text-sm" style={{ color: 'var(--term-muted)' }}>
        {label}
      </div>
      <div
        className="text-2xl font-bold"
        style={{ color: color || 'var(--term-foreground)' }}
      >
        {value}
      </div>
      {subValue && (
        <div className="text-xs" style={{ color: 'var(--term-muted)' }}>
          {subValue}
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
