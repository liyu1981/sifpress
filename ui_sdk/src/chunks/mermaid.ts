import mermaid from 'mermaid';

const w = window as unknown as { SifpressUI?: { Libs?: Record<string, unknown> } };
w.SifpressUI = w.SifpressUI ?? {};
w.SifpressUI.Libs = w.SifpressUI.Libs ?? {};
w.SifpressUI.Libs.mermaid = mermaid;

export default mermaid;
