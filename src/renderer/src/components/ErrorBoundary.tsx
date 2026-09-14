import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';
import { PixelButton } from './PixelButton';

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
        padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
        alignItems: 'flex-start', fontFamily: 'var(--cth-font-ui)',
        color: 'var(--cth-ink-900)', background: 'var(--cth-cream-100)',
        boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
      }}>
        {/* A class component, so no useTranslation hook — the i18n instance
            directly. This screen is the one a person reads while something is
            already wrong; an untranslated SHOUT was the wrong tone for it. */}
        <div style={{
          fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, lineHeight: '18px',
          color: 'var(--cth-ink-900)'
        }}>
          {i18n.t('errorBoundary.title', { label: this.props.label ?? i18n.t('errorBoundary.fallbackLabel') })}
        </div>
        <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>
          {i18n.t('errorBoundary.body')}
        </div>
        <pre style={{
          margin: 0, maxWidth: '100%', maxHeight: 160, overflow: 'auto',
          padding: 12, fontFamily: 'var(--cth-font-mono)', fontSize: 11,
          background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
          whiteSpace: 'pre-wrap'
        }}>{error.message || String(error)}</pre>
        <PixelButton
          size="sm"
          onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}
        >{i18n.t('errorBoundary.retry')}</PixelButton>
      </div>
    );
  }
}
