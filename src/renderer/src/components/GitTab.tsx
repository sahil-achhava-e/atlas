import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CommitGraph } from './git/CommitGraph';
import { GitIcon, RefreshIcon, CopyIcon } from './TabIcons';

interface GitCommit {
  sha: string;
  shortSha: string;
  parents: string[];
  subject: string;
  author: string;
  time: number;
  refs: string[];
}
interface GitStatusEntry { path: string; index: string; worktree: string }
interface GitStatus { staged: GitStatusEntry[]; unstaged: GitStatusEntry[]; untracked: string[] }

export interface GitTabProps {
  cwd: string;
}

function statusLabelKey(code: string): string {
  return code === 'M' ? 'gitTab.modified'
    : code === 'A' ? 'gitTab.added'
    : code === 'D' ? 'gitTab.deleted'
    : code === 'R' ? 'gitTab.renamed'
    : code === '?' ? 'gitTab.untracked'
    : code === 'U' ? 'gitTab.unmerged'
    : code === ' ' ? '' : code;
}

function statusColor(code: string): string {
  if (code === 'M') return 'var(--cth-lemon)';
  if (code === 'A') return 'var(--cth-mint)';
  if (code === 'D') return 'var(--cth-coral)';
  if (code === 'R') return 'var(--cth-lilac)';
  if (code === '?') return 'var(--cth-ink-300)';
  return 'var(--cth-ink-500)';
}

export function GitTab({ cwd }: GitTabProps) {
  const { t } = useTranslation();
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [detached, setDetached] = useState(false);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<GitCommit[]>([]);
  const [ahead, setAhead] = useState(0);
  const [behind, setBehind] = useState(0);
  const [upstream, setUpstream] = useState<string | null>(null);
  // Absolute, because a path copied out of here is pasted into a shell that is
  // somewhere else. `git status` reports relative to the working tree's top
  // level, which is not necessarily this agent's cwd.
  const [root, setRoot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refresh = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const repo = await window.cth.gitIsRepo(cwd);
      setIsRepo(repo);
      if (!repo) { setLoading(false); return; }
      const [b, s, l, ab, rt] = await Promise.all([
        window.cth.gitBranch(cwd),
        window.cth.gitStatus(cwd),
        window.cth.gitLog(cwd, 100),
        window.cth.gitAheadBehind(cwd),
        window.cth.gitRoot(cwd)
      ]);
      setRoot(rt);
      if ('error' in b) setError(b.error);
      else { setBranch(b.current); setDetached(b.detached); }
      if ('error' in s) setError(prev => prev ?? s.error); else setStatus(s);
      if (Array.isArray(l)) setLog(l); else if ('error' in l) setError(prev => prev ?? l.error);
      if ('error' in ab) { /* keep defaults */ } else { setAhead(ab.ahead); setBehind(ab.behind); setUpstream(ab.upstream); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Poll the working-tree status every 4s so freshly-edited files show up.
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  if (isRepo === false) {
    return (
      <div style={{
        flex: 1, minWidth: 0,
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, textAlign: 'center', color: 'var(--cth-ink-500)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 14
      }}>
        {t('gitTab.notARepo')}<br />{t('gitTab.notARepoHint')}
      </div>
    );
  }

  const changedCount = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;

  return (
    <div style={{
      flex: 1, minWidth: 0,
      height: '100%', minHeight: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--cth-paper-100)'
    }}>
      {/* The branch you are standing on, and how far it has drifted. Everything
          else this row used to hold was a second way of saying the same thing:
          the upstream name sat beside counts that only exist because there is
          one, and Refresh was a labelled ghost button for a panel that already
          re-reads itself every 4 seconds. The button stays, because a person
          who has just committed should not have to wait out the poll, but it
          is a 32px icon with a hover label like every other control here. */}
      <div className="cth-iconbar" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 8px 8px 16px',
        background: 'var(--cth-cream-100)',
        borderBottom: '1px solid var(--cth-ink-100)'
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
          fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, lineHeight: '18px',
          padding: '1px 10px 1px 8px',
          background: 'var(--cth-lilac-light)',
          boxShadow: 'inset 0 0 0 1px var(--cth-lilac)', borderRadius: 'var(--cth-radius-input)',
          color: 'var(--cth-lilac-text)'
        }}>
          <span style={{ display: 'inline-flex', flexShrink: 0 }}><GitIcon size={14} /></span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detached ? t('gitTab.detachedHead') : (branch ?? '—')}
          </span>
        </span>
        {upstream && (ahead > 0 || behind > 0) && (
          <span style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 6, flexShrink: 0,
            fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '18px',
            color: 'var(--cth-ink-500)'
          }}>
            {ahead > 0 && <span style={{ color: 'var(--cth-jade-text)' }}>↑{ahead}</span>}
            {behind > 0 && <span style={{ color: 'var(--cth-peach-text)' }}>↓{behind}</span>}
            <span style={{
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{upstream}</span>
          </span>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          data-label={t('gitTab.refresh')}
          aria-label={t('gitTab.refresh')}
          style={{
            marginInlineStart: 'auto', flexShrink: 0,
            width: 32, height: 32,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1,
            borderRadius: 'var(--cth-radius-btn)',
            color: 'var(--cth-ink-700)',
            transition: 'background 120ms ease, color 120ms ease'
          }}
        >
          <RefreshIcon />
        </button>
      </div>

      {error && (
        <div style={{
          padding: '4px 16px',
          background: 'var(--cth-coral-light)',
          color: 'var(--cth-ink-900)',
          fontSize: 13,
          borderBottom: '1px solid var(--cth-coral)'
        }}>{error}</div>
      )}

      {/* Body — scrollable, contains status + graph */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {/* Status */}
        <Section title={t('gitTab.sectionStatus')} meta={changedCount ? t('gitTab.changedCount', { count: changedCount }) : undefined}>
          {status && (
            <>
              <StatusGroup label={t('gitTab.staged')} root={root} entries={status.staged.map(e => ({ ...e, code: e.index }))} />
              <StatusGroup label={t('gitTab.changes')} root={root} entries={status.unstaged.map(e => ({ ...e, code: e.worktree }))} />
              <StatusGroup label={t('gitTab.untracked')} root={root} entries={status.untracked.map(p => ({ path: p, code: '?' }))} />
              {status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0 && (
                <div style={{
                  padding: '4px 12px', color: 'var(--cth-ink-500)', fontSize: 13
                }}>{t('gitTab.clean')}</div>
              )}
            </>
          )}
        </Section>

        {/* Graph */}
        <Section title={t('gitTab.sectionLog')}>
          {log.length > 0 ? <CommitGraph commits={log} currentBranch={branch} /> : (
            <div style={{ padding: 12, color: 'var(--cth-ink-500)', fontSize: 13 }}>{t('gitTab.noCommits')}</div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, meta, children }: {
  title: string;
  /** A count, on the right of the rule. Absent when there is nothing to say. */
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, lineHeight: '12px',
        color: 'var(--cth-ink-700)',
        padding: '12px 16px 4px',
        background: 'var(--cth-cream-50)',
        borderBottom: '1px solid var(--cth-ink-100)'
      }}>
        <span>{title}</span>
        {meta && <span style={{ marginInlineStart: 'auto', fontWeight: 500, color: 'var(--cth-ink-500)' }}>{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function StatusGroup({ label, entries, root }: {
  label: string;
  entries: Array<{ path: string; code: string }>;
  /** Repo top level, for the absolute path the copy button writes. */
  root: string | null;
}) {
  if (entries.length === 0) return null;
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 6,
        padding: '0 12px', fontSize: 11, lineHeight: '16px', color: 'var(--cth-ink-500)'
      }}>
        <span>{label}</span>
        <span style={{ fontFamily: 'var(--cth-font-mono)' }}>{entries.length}</span>
      </div>
      {entries.map(e => (
        <StatusRow key={`${label}-${e.path}-${e.code}`} path={e.path} root={root} code={e.code} />
      ))}
    </div>
  );
}

function StatusRow({ path, root, code }: { path: string; root: string | null; code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const cut = path.lastIndexOf('/');
  const dir = cut >= 0 ? path.slice(0, cut + 1) : '';
  const file = cut >= 0 ? path.slice(cut + 1) : path;
  const word = statusLabelKey(code) ? t(statusLabelKey(code)) : '';

  // Say it happened. A copy button that changes nothing on screen is a button
  // you press twice because you cannot tell whether the first one worked.
  const copy = async () => {
    try {
      // Falls back to the repo-relative path when the root is not back yet or
      // the call failed — better a short path than a wrong absolute one.
      await navigator.clipboard.writeText(root ? `${root}/${path}` : path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* no clipboard permission — the row just does not confirm */ }
  };

  return (
    <div className="cth-iconbar" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '1px 8px 1px 12px',
      fontSize: 13, color: 'var(--cth-ink-900)'
    }}>
      <span style={{
        flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', direction: 'rtl', textAlign: 'left',
        fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '20px'
      }}>
        {/* rtl + bdi: an overflowing path loses its FRONT (the shared prefix)
            rather than its end (the file name), which is the half that tells
            two rows apart. bdi keeps the text itself reading left to right. */}
        <bdi><span style={{ color: 'var(--cth-ink-500)' }}>{dir}</span>{file}</bdi>
      </span>
      {word && (
        <span style={{
          flexShrink: 0, fontSize: 11, lineHeight: '16px', color: statusColor(code)
        }}>{word}</span>
      )}
      <button
        onClick={copy}
        data-label={copied ? t('gitTab.copied') : t('gitTab.copyPath')}
        aria-label={copied ? t('gitTab.copied') : t('gitTab.copyPath')}
        style={{
          flexShrink: 0, width: 22, height: 22,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
          borderRadius: 'var(--cth-radius-btn)',
          color: copied ? 'var(--cth-jade-text)' : 'var(--cth-ink-500)',
          transition: 'background 120ms ease, color 120ms ease'
        }}
      >
        <CopyIcon size={14} />
      </button>
    </div>
  );
}
