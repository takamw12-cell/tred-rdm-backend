/**
 * CBOR minimal (RFC 8949) pour les objets d'App Attest : entiers, octets,
 * texte, tableaux, dictionnaires. Rien d'autre n'est accepté : un objet
 * inattendu est refusé plutôt qu'interprété. Profondeur et tailles bornées.
 */
export type Cbor = number | bigint | Uint8Array | string | Cbor[] | Map<Cbor, Cbor> | boolean | null;

const MAX_DEPTH = 8;
const MAX_ITEMS = 64;

export function decodeCbor(bytes: Uint8Array): Cbor {
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > bytes.length) throw new Error("cbor: fin inattendue");
  };
  const readLength = (info: number): number => {
    if (info < 24) return info;
    const size = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : info === 27 ? 8 : 0;
    if (!size) throw new Error("cbor: longueur indéfinie refusée");
    need(size);
    let v = 0;
    for (let i = 0; i < size; i++) v = v * 256 + bytes[pos + i]!;
    pos += size;
    if (!Number.isSafeInteger(v)) throw new Error("cbor: entier trop grand");
    return v;
  };
  const item = (depth: number): Cbor => {
    if (depth > MAX_DEPTH) throw new Error("cbor: trop imbriqué");
    need(1);
    const head = bytes[pos++]!;
    const major = head >> 5;
    const info = head & 31;
    switch (major) {
      case 0:
        return readLength(info);
      case 1:
        return -1 - readLength(info);
      case 2: {
        const n = readLength(info);
        need(n);
        const out = bytes.slice(pos, pos + n);
        pos += n;
        return out;
      }
      case 3: {
        const n = readLength(info);
        need(n);
        const out = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(pos, pos + n));
        pos += n;
        return out;
      }
      case 4: {
        const n = readLength(info);
        if (n > MAX_ITEMS) throw new Error("cbor: tableau trop long");
        const out: Cbor[] = [];
        for (let i = 0; i < n; i++) out.push(item(depth + 1));
        return out;
      }
      case 5: {
        const n = readLength(info);
        if (n > MAX_ITEMS) throw new Error("cbor: dictionnaire trop long");
        const out = new Map<Cbor, Cbor>();
        for (let i = 0; i < n; i++) {
          const k = item(depth + 1);
          out.set(k, item(depth + 1));
        }
        return out;
      }
      case 7:
        if (info === 20) return false;
        if (info === 21) return true;
        if (info === 22) return null;
        throw new Error("cbor: valeur simple refusée");
      default:
        throw new Error("cbor: type refusé");
    }
  };
  const value = item(0);
  if (pos !== bytes.length) throw new Error("cbor: octets en trop");
  return value;
}

/** L'encodeur symétrique, pour les tests et les objets fabriqués à la main. */
export function encodeCbor(value: Cbor): Uint8Array {
  const out: number[] = [];
  const head = (major: number, n: number) => {
    if (n < 24) out.push((major << 5) | n);
    else if (n < 256) out.push((major << 5) | 24, n);
    else if (n < 65536) out.push((major << 5) | 25, n >> 8, n & 255);
    else out.push((major << 5) | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
  };
  const write = (v: Cbor) => {
    if (typeof v === "number") {
      if (v >= 0) head(0, v);
      else head(1, -1 - v);
    } else if (v instanceof Uint8Array) {
      head(2, v.length);
      out.push(...v);
    } else if (typeof v === "string") {
      const b = new TextEncoder().encode(v);
      head(3, b.length);
      out.push(...b);
    } else if (Array.isArray(v)) {
      head(4, v.length);
      v.forEach(write);
    } else if (v instanceof Map) {
      head(5, v.size);
      for (const [k, x] of v) {
        write(k);
        write(x);
      }
    } else if (v === false) out.push(0xf4);
    else if (v === true) out.push(0xf5);
    else if (v === null) out.push(0xf6);
    else throw new Error("cbor: type non encodable");
  };
  write(value);
  return Uint8Array.from(out);
}
