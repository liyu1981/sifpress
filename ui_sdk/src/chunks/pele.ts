import * as pele from 'pele';

const w = window as unknown as { SifpressUI?: { Libs?: Record<string, unknown> } };
w.SifpressUI = w.SifpressUI ?? {};
w.SifpressUI.Libs = w.SifpressUI.Libs ?? {};
w.SifpressUI.Libs.pele = pele;

export default pele;
