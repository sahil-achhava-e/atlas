import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';

/**
 * Choosing a folder when there is no OS to ask.
 *
 * Every "pick a folder" button in the app calls `chooseFolder`, which opens a
 * native dialog from the main process. In a browser tab there is no window to
 * hang that dialog off, and a browser cannot show you the SERVER's filesystem
 * either — so those buttons did nothing at all: setup's "Add project", the
 * workspace picker's "Open another folder", the agent cwd field.
 *
 * This is the honest substitute: type the path. It renders in the app's own
 * theme rather than `window.prompt`, it takes several paths at once for the
 * callers that ask for several, and it says plainly why it is a field instead
 * of a picker. It is installed ONLY in browser mode; the desktop app keeps its
 * native dialog untouched.
 */

export interface FolderChoice { ok: boolean; path?: string; paths?: string[]; error?: string }

/** The live prompt, registered by the host below. Module scope because the
 *  caller is `window.cth.chooseFolder`, which is not inside React. */
let opener: ((multi: boolean) => Promise<FolderChoice>) | null = null;

/** Point `chooseFolder` at the prompt. No-op in the desktop app, where the
 *  native dialog is the better answer and already works. */
export function installBrowserFolderPicker(): void {
  const cth = window.cth as unknown as { isServerMode?: boolean; chooseFolder?: unknown };
  if (!cth?.isServerMode) return;
  cth.chooseFolder = (opts?: { multi?: boolean }): Promise<FolderChoice> =>
    opener ? opener(!!opts?.multi) : Promise.resolve({ ok: false, error: 'cancelled' });
}

/** Mounted once, near the root. Draws nothing until something asks for a path. */
export function PathPromptHost() {
  const { t } = useTranslation();
  const [ask, setAsk] = useState<{ multi: boolean; resolve: (r: FolderChoice) => void } | undefined>();
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    opener = (multi: boolean) => new Promise<FolderChoice>((resolve) => {
      setText('');
      setAsk({ multi, resolve });
    });
    return () => { opener = null; };
  }, []);

  useEffect(() => { if (ask) field.current?.focus(); }, [ask]);

  if (!ask) return null;

  const close = (res: FolderChoice) => { ask.resolve(res); setAsk(undefined); };
  const submit = () => {
    const paths = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (paths.length === 0) return close({ ok: false, error: 'cancelled' });
    close({ ok: true, path: paths[0], paths });
  };

  return (
    <div
      onClick={() => close({ ok: false, error: 'cancelled' })}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(26, 19, 32, 0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 950
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '92vw' }}>
        <PixelPanel variant="dialog" title={t(ask.multi ? 'pathPrompt.titleMulti' : 'pathPrompt.title')} noPadding>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>
              {t(ask.multi ? 'pathPrompt.bodyMulti' : 'pathPrompt.body')}
            </p>
            <textarea
              ref={field}
              value={text}
              rows={ask.multi ? 4 : 1}
              spellCheck={false}
              placeholder={ask.multi ? '~/code/api\n~/code/web' : '~/code/api'}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close({ ok: false, error: 'cancelled' });
                // Enter submits a single path; a multi prompt needs Enter for
                // the next line, so it takes Cmd/Ctrl-Enter instead.
                if (e.key === 'Enter' && (!ask.multi || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
              }}
              style={{
                font: 'inherit', fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '20px',
                resize: 'vertical', padding: '8px 10px', background: 'var(--cth-cream-50)',
                border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                borderRadius: 'var(--cth-radius-input)', color: 'var(--cth-ink-900)'
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PixelButton variant="ghost" size="sm" onClick={() => close({ ok: false, error: 'cancelled' })}>
                {t('pathPrompt.cancel')}
              </PixelButton>
              <PixelButton variant="primary" size="sm" onClick={submit} disabled={!text.trim()}>
                {t('pathPrompt.use')}
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
