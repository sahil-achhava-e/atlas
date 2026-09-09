import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Catches a render crash and shows what broke.
 *
 *  React unmounts the whole tree when a render throws, so before this a single
 *  bad field in one tab — `undefined.trim()` in the Triggers panel — blanked the
 *  entire window with no message and nothing to click. A boundary turns that
 *  into a contained failure: the rest of the app keeps running, and the part
 *  that broke says so and offers to try again.
 *
 *  `label` names the region for the message; `onReset` re-mounts the children
 *  (default: just clear the error and re-render). */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the stack in the console: the panel below is for the user, this is
    // for whoever is asked to fix it.
    console.error('[ErrorBoundary]', this.props.label ?? 'app', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{
        padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
        alignItems: 'flex-start', fontFamily: 'var(--cth-font-ui)',
        color: 'var(--cth-ink-900)', background: 'var(--cth-cream-100)',
        boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
      }}>
        <div style={{
          fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '14px',
          color: 'var(--cth-ink-700)'
        }}>
          {(this.props.label ?? 'this panel').toUpperCase()} STOPPED
        </div>
        <div style={{ fontSize: 13, lineHeight: '19px' }}>
          Something in here threw while drawing. The rest of the app is fine.
        </div>
        <pre style={{
          margin: 0, maxWidth: '100%', maxHeight: 160, overflow: 'auto',
          padding: 8, fontFamily: 'var(--cth-font-mono)', fontSize: 11,
          background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
          whiteSpace: 'pre-wrap'
        }}>{error.message || String(error)}</pre>
        <button
          onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}
          style={{
            padding: '4px 12px 3px', border: 'none', cursor: 'pointer',
            background: 'var(--cth-lilac)', color: 'var(--cth-on-accent)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 13
          }}
        >Try again</button>
      </div>
    );
  }
}
