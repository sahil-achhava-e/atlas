"""Flip Atlas's theme colour:  python3 .preview/theme.py purple|blue

The whole app is styled through the --cth-* tokens, so a retint is a swap of
the cream/ink ramps in tokens.css plus the splash tile in index.html. Every run
starts from the COMMITTED state of those two files, so variants never stack —
which also means uncommitted edits to them are discarded. Refresh the browser
after (CSS hot-reloads; index.html needs the reload).
"""
import pathlib, subprocess, sys

R = pathlib.Path(__file__).resolve().parent.parent
variant = sys.argv[1] if len(sys.argv) > 1 else 'purple'
if variant not in ('purple', 'blue'):
    sys.exit('usage: theme.py purple|blue')

# always start from the committed state so variants never stack
subprocess.run(['git', 'checkout', '--',
                'src/renderer/src/design/tokens.css', 'src/renderer/index.html'], cwd=R, check=True)

# (light-block value, dark-block value) keyed by the current committed value
PAL = {
 'purple': {
  'light': {'--cth-cream-50':'#FDFCFF','--cth-cream-100':'#F7F5FF','--cth-cream-200':'#EAE5FA',
            '--cth-cream-300':'#D6CEF2','--cth-paper-100':'#FCFBFF','--cth-paper-200':'#F0ECFB',
            '--cth-ink-900':'#1A1030','--cth-ink-700':'#3B2C5E','--cth-ink-500':'#6A5A90',
            '--cth-ink-300':'#A99CC6','--cth-ink-100':'#DAD2EC',
            '--cth-texture-line':'rgba(148, 130, 211, 0.16)',
            '--cth-ground-centre':'#FDFCFF','--cth-ground-edge':'#EDE8FB'},
  'dark':  {'--cth-cream-50':'#15121D','--cth-cream-100':'#1B1727','--cth-cream-200':'#251F34',
            '--cth-cream-300':'#312A44','--cth-paper-100':'#181423','--cth-paper-200':'#211B2F',
            '--cth-texture-line':'rgba(198, 188, 235, 0.035)',
            '--cth-ground-centre':'#262038','--cth-ground-edge':'#110E19'},
  'mark':  ('#5B3FA8', '#3B2673'),   # splash tile fill, its border
 },
 'blue': {
  'light': {'--cth-cream-50':'#FBFDFF','--cth-cream-100':'#F1F6FD','--cth-cream-200':'#E0EBF8',
            '--cth-cream-300':'#C6DAEF','--cth-paper-100':'#FAFCFF','--cth-paper-200':'#EAF2FA',
            '--cth-ink-900':'#101827','--cth-ink-700':'#2C3E5C','--cth-ink-500':'#5A6E8C',
            '--cth-ink-300':'#96A8C0','--cth-ink-100':'#CBD8E7',
            '--cth-texture-line':'rgba(84, 130, 194, 0.15)',
            '--cth-ground-centre':'#FBFDFF','--cth-ground-edge':'#E6EFF9'},
  'dark':  {'--cth-cream-50':'#11151E','--cth-cream-100':'#161C27','--cth-cream-200':'#1F2735',
            '--cth-cream-300':'#2A3446','--cth-paper-100':'#131822','--cth-paper-200':'#1B222F',
            '--cth-texture-line':'rgba(186, 205, 236, 0.035)',
            '--cth-ground-centre':'#1F2839','--cth-ground-edge':'#0D1118'},
  'mark':  ('#2F5FA8', '#1B3A६E'.replace('६','6'), ),
 },
}[variant]

p = R / 'src/renderer/src/design/tokens.css'
lines = p.read_text().split('\n')
dark_at = next(i for i, l in enumerate(lines) if "data-cth-theme='dark'" in l)
for i, l in enumerate(lines):
    block = 'dark' if i > dark_at else 'light'
    for tok, val in PAL[block].items():
        if l.strip().startswith(tok + ':'):
            head = l.split(':')[0]
            tail = ('  /* ' + l.split('/*')[1]) if '/*' in l else ''
            lines[i] = f'{head}: {val};' + (' ' + tail if tail else '')
p.write_text('\n'.join(lines))

h = R / 'src/renderer/index.html'
s = h.read_text()
fill, border = PAL['mark']
s = s.replace('background: #6E1423; color: #F4F1EA; border: 4px solid #4A0D17;',
              f'background: {fill}; color: #F4F1EA; border: 4px solid {border};')
s = s.replace('<div class="mk">MD</div>', '<div class="mk">A</div>')
s = s.replace('background: #FFF8E7; color: #1A1320;',
              f"background: {PAL['light']['--cth-cream-100']}; color: {PAL['light']['--cth-ink-900']};")
h.write_text(s)
print(variant, 'applied')
