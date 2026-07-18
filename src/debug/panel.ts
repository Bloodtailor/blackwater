// Debug harness (DESIGN.md §16). Panel renders only with ?debug=1, but hotkeys
// (incl. screenshot mode) are always active. Every feature milestone adds its
// triggers here in the same session it ships.

type HotkeyFn = () => void;

export class DebugPanel {
  readonly enabled: boolean;
  private root: HTMLDivElement | null = null;
  private hotkeys = new Map<string, { label: string; fn: HotkeyFn }>();
  private hotkeyList: HTMLDivElement | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const h = this.hotkeys.get(e.code);
      if (h) {
        e.preventDefault();
        h.fn();
      }
    });
    if (enabled) {
      const ui = document.getElementById('ui');
      if (!ui) throw new Error('#ui missing');
      this.root = document.createElement('div');
      this.root.id = 'debug-panel';
      const title = document.createElement('h3');
      title.textContent = 'BLACKWATER DEBUG';
      this.root.appendChild(title);
      const sec = this.section('Hotkeys');
      sec.classList.add('hotkeys');
      this.hotkeyList = sec;
      ui.appendChild(this.root);
      this.hotkey('F1', 'Toggle debug panel', () => this.root?.classList.toggle('hidden'));
    }
  }

  hotkey(code: string, label: string, fn: HotkeyFn): void {
    this.hotkeys.set(code, { label, fn });
    if (this.hotkeyList) {
      const d = document.createElement('div');
      d.textContent = `${code.replace('Key', '').replace('Digit', '')} — ${label}`;
      this.hotkeyList.appendChild(d);
    }
  }

  section(title: string): HTMLDivElement {
    const s = document.createElement('div');
    s.className = 'section';
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = title;
    s.appendChild(t);
    this.root?.appendChild(s);
    return s;
  }

  button(section: HTMLDivElement, label: string, fn: () => void): void {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    section.appendChild(b);
  }

  toggle(section: HTMLDivElement, label: string, get: () => boolean, set: (v: boolean) => void): void {
    const l = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = get();
    box.addEventListener('change', () => set(box.checked));
    l.append(span, box);
    section.appendChild(l);
  }

  slider(
    section: HTMLDivElement,
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
  ): void {
    const l = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    input.addEventListener('input', () => set(Number(input.value)));
    l.append(span, input);
    section.appendChild(l);
  }
}
