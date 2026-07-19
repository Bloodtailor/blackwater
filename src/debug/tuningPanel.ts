// Every TUNING knob as an editable form (user 2026-07-19: tune from the level
// editor, carry the values into a playtest). Shared by the editor side panel
// and the in-game debug panel. Values write through setTuningValue, so they
// apply live AND persist in localStorage across editor ⇄ game switches.

import { clearTuningOverrides, getTuningDefault, getTuningValue, listTuningPaths, setTuningValue, tuningOverrideCount } from '../tuning';

export function buildTuningUI(parent: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'tuning-ui';
  parent.appendChild(wrap);

  const head = document.createElement('div');
  head.className = 'tuning-head';
  const count = document.createElement('span');
  const setCount = (): void => {
    const n = tuningOverrideCount();
    count.textContent = n ? `${n} override(s) active` : 'all values stock';
  };
  setCount();
  const reset = document.createElement('button');
  reset.textContent = 'reset all';
  head.append(count, reset);
  wrap.appendChild(head);

  const groups = new Map<string, HTMLElement>();
  const inputs = new Map<string, HTMLInputElement>();

  const groupBody = (name: string): HTMLElement => {
    let body = groups.get(name);
    if (!body) {
      const det = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = name;
      det.appendChild(sum);
      body = document.createElement('div');
      det.appendChild(body);
      wrap.appendChild(det);
      groups.set(name, body);
    }
    return body;
  };

  for (const path of listTuningPaths()) {
    const dot = path.indexOf('.');
    const group = dot < 0 ? '(root)' : path.slice(0, dot);
    const leaf = dot < 0 ? path : path.slice(dot + 1);
    const row = document.createElement('label');
    row.className = 'tuning-row';
    const span = document.createElement('span');
    span.textContent = leaf;
    span.title = path;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    const paint = (): void => {
      input.value = String(getTuningValue(path));
      row.classList.toggle('tuned', getTuningValue(path) !== getTuningDefault(path));
    };
    paint();
    input.addEventListener('change', () => {
      setTuningValue(path, input.value === '' ? undefined : Number(input.value));
      paint();
      setCount();
    });
    inputs.set(path, input);
    row.append(span, input);
    groupBody(group).appendChild(row);
  }

  reset.addEventListener('click', () => {
    clearTuningOverrides();
    for (const [path, input] of inputs) {
      input.value = String(getTuningValue(path));
      input.parentElement?.classList.remove('tuned');
    }
    setCount();
  });
}
