/**
 * Realtime Michael — microphone & speaker device picker (card rt-8, Phase 1).
 *
 * Lets the user choose WHICH microphone the voice loop captures and WHICH speaker
 * it plays Michael's voice through. Selections are held in the realtime session
 * store via `setDeviceId()` / `setOutputDeviceId()` (see session.ts): the mic is
 * applied on the next connect() (getUserMedia `{ deviceId: { exact } }`), the
 * speaker is applied immediately to the live `<audio>` sink via `setSinkId()` (and
 * re-applied at connect). Both fall back to the system default if a stored id is
 * stale.
 *
 * `enumerateDevices()` only returns device LABELS once the page has been granted
 * mic access at least once (our main-process gate opens while a voice session or
 * Free Flow is live — see src/main/index.ts). Before that we show generic
 * "Microphone N" / "Speaker N" names and a hint, so the picker is usable cold.
 *
 * Branch feat/realtime-michael. See board.md "🎙 REALTIME MICHAEL".
 */
import { useCallback, useEffect, useState } from 'react';
import { PixelButton } from '@/components/PixelButton';
import { Dropdown } from '@/components/Dropdown';
import { useTranslation } from 'react-i18next';
import { useRealtimeMichael } from './session';
import { useStore } from '@/store/store';

interface AudioDevice {
  deviceId: string;
  label: string;
}

/** Whether this runtime can route audio output to a chosen sink (Chromium/Electron
 *  expose HTMLMediaElement.setSinkId; some lib.dom targets don't). When false we
 *  hide the speaker picker rather than show an inert control. */
const CAN_PICK_SPEAKER =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

/** Enumerate audio devices of one kind, with a generic fallback label when the
 *  real label is hidden (no mic permission granted yet this session). */
async function listDevices(kind: 'audioinput' | 'audiooutput'): Promise<AudioDevice[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
  const fallback = kind === 'audioinput' ? 'Microphone' : 'Speaker';
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === kind)
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
  fontSize: 12,
  lineHeight: '14px',
  color: 'var(--cth-ink-600)',
};

export function RealtimeDevicePicker(): React.ReactElement {
  const { t } = useTranslation();
  const { deviceId, setDeviceId, outputDeviceId, setOutputDeviceId } = useRealtimeMichael();
  const godName = useStore((s) => s.agents.find((a) => a.isGod)?.name) ?? 'the orchestrator';
  const [mics, setMics] = useState<AudioDevice[]>([]);
  const [speakers, setSpeakers] = useState<AudioDevice[]>([]);
  /** True once at least one device exposes a real label ⇒ mic permission granted. */
  const [labelled, setLabelled] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState('');

  const refresh = useCallback(async () => {
    const [ins, outs] = await Promise.all([
      listDevices('audioinput'),
      CAN_PICK_SPEAKER ? listDevices('audiooutput') : Promise.resolve<AudioDevice[]>([])
    ]);
    setMics(ins);
    setSpeakers(outs);
    setLabelled(ins.some((m) => m.label && !/^Microphone \d+$/.test(m.label)));
  }, []);

  /** The browser hides device LABELS until a page has been granted the
   *  microphone once — that is why the lists read "System default" and nothing
   *  else. Asking for a stream and stopping it immediately is the whole trick:
   *  permission sticks, labels appear, and no audio is ever captured. */
  const askAccess = useCallback(async () => {
    setAsking(true); setAskError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refresh();
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    // Hot-plug / unplug a device, or a permission grant that reveals labels → re-list.
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md) return;
    const onChange = (): void => void refresh();
    md.addEventListener?.('devicechange', onChange);
    return () => md.removeEventListener?.('devicechange', onChange);
  }, [refresh]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>{t('devicePicker.microphone')}</span>
        <Dropdown
          value={deviceId ?? ''}
          options={[
            { value: '', label: t('devicePicker.systemDefault') },
            ...mics.map((m) => ({ value: m.deviceId, label: m.label }))
          ]}
          onChange={(v) => setDeviceId(v || null)}
          ariaLabel={t('devicePicker.microphone')}
          width="100%"
        />
      </div>

      {CAN_PICK_SPEAKER && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelStyle}>{t('devicePicker.speaker')}</span>
          <Dropdown
            value={outputDeviceId ?? ''}
            options={[
              { value: '', label: t('devicePicker.systemDefault') },
              ...speakers.map((sp) => ({ value: sp.deviceId, label: sp.label }))
            ]}
            onChange={(v) => setOutputDeviceId(v || null)}
            ariaLabel={t('devicePicker.speaker')}
            width="100%"
          />
        </div>
      )}

      {!labelled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <PixelButton variant="secondary" size="sm" onClick={() => { void askAccess(); }} disabled={asking}>
            {asking ? t('devicePicker.asking') : t('devicePicker.showNames')}
          </PixelButton>
          <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
            {askError || t('devicePicker.namesHint')}
          </span>
        </div>
      )}
    </div>
  );
}
