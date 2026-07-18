// Cheap layered sin-noise. Deterministic, dependency-free, position-keyed —
// good enough for rock. (Seam-safe: value depends on position only.)

export function n3(x: number, y: number, z: number): number {
  return (
    (Math.sin(x * 1.7 + Math.sin(y * 2.1)) +
      Math.sin(y * 1.3 + Math.sin(z * 1.9)) +
      Math.sin(z * 1.5 + Math.sin(x * 2.3))) /
    3
  );
}

export function fbm(x: number, y: number, z: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += n3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}
