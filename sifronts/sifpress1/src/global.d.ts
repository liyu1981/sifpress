interface SifrontMeta {
  require_keys: Record<string, unknown>[];
}

interface Window {
  gtag?: (...args: unknown[]) => void;
  plausible?: (...args: unknown[]) => void;
  _sifront_meta?: SifrontMeta;
}
