import hljs from 'highlight.js/lib/common';

const w = window as unknown as { SifpressUI?: { Libs?: Record<string, unknown> } };
w.SifpressUI = w.SifpressUI ?? {};
w.SifpressUI.Libs = w.SifpressUI.Libs ?? {};
w.SifpressUI.Libs.hljs = hljs;

export default hljs;
