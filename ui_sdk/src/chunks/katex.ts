import katex from 'katex';

const w = window as unknown as { SifpressUI?: { Libs?: Record<string, unknown> } };
w.SifpressUI = w.SifpressUI ?? {};
w.SifpressUI.Libs = w.SifpressUI.Libs ?? {};
w.SifpressUI.Libs.katex = katex;

export default katex;
