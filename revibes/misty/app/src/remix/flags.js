export const PRESETS = {
  base: { fog: false, builders: false, input: false, voice: false, tutorial: true, three: false },
  fog: { fog: true, builders: false, input: false, voice: false, tutorial: true, three: false },
  builders: { fog: false, builders: true, input: false, voice: false, tutorial: true, three: true },
  input: { fog: false, builders: false, input: true, voice: true, tutorial: true, three: false },
  sound: { fog: false, builders: false, input: false, voice: false, tutorial: true, three: false },
  all: { fog: true, builders: true, input: true, voice: true, tutorial: true, three: true },
};
export const DEFAULT_FLAGS = { ...PRESETS.all, input: false, voice: false, reduceMotion: false };
