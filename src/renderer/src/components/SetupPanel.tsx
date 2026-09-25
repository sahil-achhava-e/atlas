/**
 * PREREQUISITES — the external tools this app needs, and whether you have them.
 *
 * Several of the harness's best features are thin wrappers over tools that live
 * OUTSIDE the app bundle: git for worktrees, one CLI per agent engine. (Memory
 * used to be on that list; it is an index inside the app now, so there is
 * nothing to install for it.) Every one of them degrades silently
 * when missing — which is the right runtime behaviour and a terrible diagnostic
 * one, because "off" and "broken" look identical from the floor. This page is the
 * single place that distinguishes them, and the only place that says what each
 * tool actually buys you.
 *
 * The primary action delegates rather than executes: installing software touches
 * the user's machine and can need a password, so the button SEEDS Michael's
 * dispatch box with an exact, verified-by-him contract instead of shelling out
 * from the renderer. The user still presses dispatch. That keeps a real
 * confirmation step in front of anything that writes outside the app.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { groupCard, rowRule } from '@/design/surfaces';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import { useStore } from '@/store/store';
import { setupPrompt, type ToolStatus, type ToolKind } from '../../../shared/toolCatalog';

const SECTIONS: { kind: ToolKind; titleKey: string; blurbKey: string }[] = [
  { kind: 'prerequisite', titleKey: 'setupPanel.sections.prerequisites.title', blurbKey: 'setupPanel.sections.prerequisites.blurb' },
  { kind: 'memory', titleKey: 'setupPanel.sections.memory.title', blurbKey: 'setupPanel.sections.memory.blurb' },
  { kind: 'engine', titleKey: 'setupPanel.sections.engine.title', blurbKey: 'setupPanel.sections.engine.blurb' }
];

function StatusChip({ tool }: { tool: ToolStatus }) {
  const { t } = useTranslation();
  const ready = tool.found;
  return (
    <span style={{
      fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11,
      padding: '3px 10px', flexShrink: 0, whiteSpace: 'nowrap',
      borderRadius: 999,
      background: ready ? 'var(--cth-mint-light)' : 'var(--cth-cream-100)',
      color: ready ? 'var(--cth-mint-text)' : 'var(--cth-ink-500)'
    }}>
      {ready ? t('setupPanel.statusReady') : tool.essential ? t('setupPanel.statusMissing') : t('setupPanel.statusNotSetUp')}
    </span>
  );
}

function ToolRow({ tool }: { tool: ToolStatus }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(tool.installCommand).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1200); },
      () => { /* clipboard denied — the text is on screen to select by hand */ }
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13.5,
          flex: 1, minWidth: 0, color: 'var(--cth-ink-900)'
        }}>{tool.label}</span>
        {tool.essential && !tool.found && (
          <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', flexShrink: 0 }}>{t('setupPanel.recommended')}</span>
        )}
        <StatusChip tool={tool} />
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--cth-ink-600)', lineHeight: 1.45 }}>{tool.why}</div>

      {/* Found: show WHERE, so a "ready" claim is verifiable rather than trusted. */}
      {tool.found && tool.path && (
        <div style={{
          fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-400)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {tool.path}{tool.detail ? ` · ${tool.detail}` : ''}
        </div>
      )}

      {/* Missing WITH a scripted install: the exact command, one click to copy. */}
      {!tool.found && tool.installCommand && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <code style={{
            flex: 1, minWidth: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 11,
            padding: '6px 10px', background: 'var(--cth-cream-100)',
            borderRadius: 'var(--cth-radius-btn)',
            color: 'var(--cth-ink-900)', overflowX: 'auto', whiteSpace: 'pre'
          }}>{tool.installCommand}</code>
          <button
            onClick={copy}
            style={{
              flexShrink: 0, fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11.5,
              padding: '0 12px', borderRadius: 'var(--cth-radius-btn)',
              background: 'var(--cth-cream-100)', border: 'none',
              cursor: 'pointer', color: 'var(--cth-ink-600)'
            }}
          >{copied ? t('common.copied') : t('common.copy')}</button>
        </div>
      )}

      {(tool.note || tool.docsUrl) && (
        <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tool.note && <span>{tool.note}</span>}
          {tool.docsUrl && (
            <a
              href={tool.docsUrl}
              onClick={(e) => { e.preventDefault(); void window.cth.openExternal(tool.docsUrl!); }}
              style={{ color: 'var(--cth-ink-700)' }}
            >{t('setupPanel.docs')}</a>
          )}
        </div>
      )}
    </div>
  );
}

export function SetupPanel(
  { onDone, only, installedOnly }: { onDone?: () => void; only?: ToolKind[]; installedOnly?: boolean } = {}
) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<ToolStatus[] | null>(null);
  const [busy, setBusy] = useState(false);
  const requestDispatchSeed = useStore((s) => s.requestDispatchSeed);
  const requestCommandCenterTab = useStore((s) => s.requestCommandCenterTab);

  const refresh = useCallback(async () => {
    setBusy(true);
    try { setTools(await window.cth.toolsStatus()); }
    catch { setTools([]); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Only ESSENTIALS are handed to Michael. Installing all eight engine CLIs
  // because they happen to be listed would be a wild overreach of one click.
  // `only` narrows the panel to some sections, so the header must count the
  // same subset. It counted every tool in the catalogue, which is how a memory
  // section showing one row announced "2 of 3 ready".
  const visible = useMemo(
    () => (tools ?? [])
      .filter((t) => !only || only.includes(t.kind))
      // `installedOnly` is for the settings page, where this is a statement of
      // what you HAVE rather than a setup checklist. Twelve engines you never
      // installed, under a heading about your agents, is a catalogue — and the
      // one you do use is somewhere in it.
      .filter((t) => !installedOnly || t.found),
    [tools, only, installedOnly]
  );
  const missingEssential = useMemo(
    () => visible.filter((t) => !t.found && t.essential),
    [visible]
  );
  const readyCount = visible.filter((t) => t.found).length;

  const askMichael = () => {
    if (missingEssential.length === 0) return;
    requestDispatchSeed(setupPrompt(missingEssential));
    requestCommandCenterTab('terminal'); // the orchestrator's composer
    // This panel lives in a modal now — leaving it open would hide the very box
    // we just filled in.
    onDone?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 13, lineHeight: '16px' }}>
            {only && !only.includes('prerequisite')
              ? t('setupPanel.titleEngines')
              : t('setupPanel.title')}
          </div>
          <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)', marginTop: 2 }}>
            {tools === null
              ? t('setupPanel.checking')
              : missingEssential.length
                ? t('setupPanel.summaryMissing', {
                    ready: readyCount, total: visible.length, missing: missingEssential.length
                  })
                : t('setupPanel.summary', { ready: readyCount, total: visible.length })}
          </div>
        </div>
        <PixelButton variant="secondary" size="sm" onClick={() => void refresh()} disabled={busy}>
          {busy ? t('setupPanel.checkingBtn') : t('setupPanel.recheck')}
        </PixelButton>
      </div>

      {/* Only when something is missing. It used to render disabled with an
          "everything is installed" paragraph beside it, which read as a control
          nobody could explain: a primary button that does nothing, under a
          heading about prerequisites, in a panel about models. The summary line
          above already says everything is ready. */}
      {missingEssential.length > 0 && (
      <div style={{
        padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        background: 'var(--cth-lemon-light)',
        borderRadius: 'var(--cth-radius-card)'
      }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: 1.5 }}>
          {t('setupPanel.askDesc', { count: missingEssential.length })}
        </div>
        <PixelButton
          variant="primary"
          size="md"
          onClick={askMichael}
          disabled={missingEssential.length === 0}
        >
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <Icon name="sparkle" /> {t('setupPanel.askMichael')}
          </span>
        </PixelButton>
      </div>
      )}

      {SECTIONS.filter((sec) => !only || only.includes(sec.kind)).map((section) => {
        const rows = visible.filter((t) => t.kind === section.kind);
        if (rows.length === 0) return null;
        // Installed first, then the rest. A list that interleaves "Ready" and
        // "Not set up" makes you read every row to answer "what do I have?" —
        // which is the only question this panel exists to answer.
        const installed = rows.filter((r) => r.found);
        const missing = rows.filter((r) => !r.found);
        const band = (label: string, count: number) => (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px',
            fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11,
            color: 'var(--cth-ink-500)'
          }}>
            <span>{label}</span>
            <span style={{
              padding: '1px 7px', borderRadius: 999, fontVariantNumeric: 'tabular-nums',
              background: 'var(--cth-cream-100)', color: 'var(--cth-ink-500)'
            }}>{count}</span>
            <span style={{ flex: 1, height: 1, background: 'var(--cth-ink-100)' }} />
          </div>
        );
        const list = (tools: ToolStatus[]) => tools.map((tool, i) => (
          <div key={tool.id}>
            {i > 0 && <div style={rowRule} />}
            <ToolRow tool={tool} />
          </div>
        ));
        return (
          <div key={section.kind} style={groupCard}>
            <div style={{
              fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 13, lineHeight: '16px',
              color: 'var(--cth-ink-900)'
            }}>{t(installedOnly && section.kind === 'engine' ? 'setupPanel.sections.engine.titleInstalled' : section.titleKey)}</div>
            <div style={{
              fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)', margin: '2px 0 0'
            }}>{t(installedOnly && section.kind === 'engine' ? 'setupPanel.sections.engine.blurbInstalled' : section.blurbKey)}</div>
            {/* One band each, and only when both halves exist: a section where
                everything is installed should not carry a header saying so. */}
            {installed.length > 0 && missing.length > 0
              ? <>
                  {band(t('setupPanel.bandInstalled'), installed.length)}
                  {list(installed)}
                  {band(t('setupPanel.bandMissing'), missing.length)}
                  {list(missing)}
                </>
              : <div style={{ marginTop: 12 }}>{list(rows)}</div>}
          </div>
        );
      })}
    </div>
  );
}
