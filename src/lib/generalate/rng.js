/**
 * rng.js — deterministic seeded RNG for GENERALATE.
 *
 * xmur3 string hash feeding sfc32. All game randomness flows through
 * makeRng() instances whose state can be snapshotted/restored, so a
 * serialized game state round-trips with identical future randomness.
 *
 * No DOM, no network. Pure logic.
 */

/**
 * xmur3 32-bit string hash. Returns a function that yields successive
 * 32-bit seeds each time it is called.
 * @param {string} str
 * @returns {() => number}
 */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/**
 * sfc32 PRNG with explicit get/set state for serialization.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @returns {{next:()=>number,getState:()=>number[],setState:(s:number[])=>void}}
 */
export function sfc32(a, b, c, d) {
  let _a = a >>> 0, _b = b >>> 0, _c = c >>> 0, _d = d >>> 0;
  return {
    next() {
      _a >>>= 0; _b >>>= 0; _c >>>= 0; _d >>>= 0;
      let t = (((_a + _b) | 0) + _d) | 0;
      _d = (_d + 1) | 0;
      _a = _b ^ (_b >>> 9);
      _b = (_c + (_c << 3)) | 0;
      _c = (_c << 21) | (_c >>> 11);
      _c = (_c + t) | 0;
      return (t >>> 0) / 4294967296;
    },
    getState() { return [_a >>> 0, _b >>> 0, _c >>> 0, _d >>> 0]; },
    setState(s) {
      if (!Array.isArray(s) || s.length !== 4) throw new Error('rng: bad state');
      [_a, _b, _c, _d] = s.map((x) => x >>> 0);
    },
  };
}

/**
 * Create a string-seeded deterministic RNG.
 * @param {string} seedString
 * @returns {{float:()=>number,int:(a:number,b:number)=>number,pick:<T>(arr:T[])=>T,shuffle:<T>(arr:T[])=>T[],chance:(p:number)=>boolean,getState:()=>number[],setState:(s:number[])=>void}}
 */
export function makeRng(seedString) {
  const seedFn = xmur3(String(seedString));
  const core = sfc32(seedFn(), seedFn(), seedFn(), seedFn());
  return {
    /** Uniform float in [0, 1). */
    float() { return core.next(); },
    /** Uniform integer in [a, b] inclusive. */
    int(a, b) {
      if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) {
        throw new Error(`rng.int: bad range [${a}, ${b}]`);
      }
      return a + Math.floor(core.next() * (b - a + 1));
    },
    /** Uniform element of a non-empty array. */
    pick(arr) {
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('rng.pick: empty array');
      return arr[Math.floor(core.next() * arr.length)];
    },
    /** Fisher–Yates; returns a NEW array, input untouched. */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(core.next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** True with probability p (0..1). */
    chance(p) { return core.next() < p; },
    /** Serializable PRNG state (array of 4 uint32). */
    getState() { return core.getState(); },
    /** Restore a state previously captured with getState(). */
    setState(s) { core.setState(s); },
  };
}
