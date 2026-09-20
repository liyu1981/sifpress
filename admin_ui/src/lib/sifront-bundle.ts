import JSZip from 'jszip';

export interface SifrontBundle {
  name: string;
  version: string;
  meta: Record<string, unknown>;
  bundle: string;
}

/**
 * Unpack a `.sifront` ZIP in the browser and return the two pieces the
 * backend stores: the parsed `meta.json` and the raw `bundle.js`. Doing the
 * unzip here keeps the backend free of any zip dependency.
 */
export async function readSifrontBundle(file: File): Promise<SifrontBundle> {
  const zip = await JSZip.loadAsync(file);
  const metaEntry = zip.file('meta.json');
  const bundleEntry = zip.file('bundle.js');

  if (metaEntry === null || bundleEntry === null) {
    throw new Error('bundle must contain meta.json and bundle.js');
  }

  const [metaRaw, bundle] = await Promise.all([
    metaEntry.async('string'),
    bundleEntry.async('string'),
  ]);

  if (bundle === '') {
    throw new Error('bundle.js is empty');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(metaRaw);
  } catch {
    throw new Error('invalid meta.json');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid meta.json');
  }

  const meta = parsed as Record<string, unknown>;
  const version = typeof meta.version === 'string' && meta.version !== '' ? meta.version : '0.0.0';
  const name =
    typeof meta.name === 'string' && meta.name !== ''
      ? meta.name
      : file.name.replace(/\.sifront$/i, '');

  return { name, version, meta, bundle };
}
