import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './shell/App.tsx';
import { CHECK_PACKS, REFERENCES, SAMPLE_CONTRACTS, SAMPLE_EPO, SAMPLE_RELATIONSHIPS, SAMPLE_REPORT, SAMPLE_SOLUSI, SAMPLE_SOLUSI_EARLIER } from './platform/bundle.ts';
import { setContent } from './state/content.ts';
import { rememberedUser } from './state/settings.ts';

setContent({
  packs: CHECK_PACKS, references: REFERENCES,
  samples: { report: SAMPLE_REPORT, relationships: SAMPLE_RELATIONSHIPS, epo: SAMPLE_EPO, solusi: SAMPLE_SOLUSI, contracts: SAMPLE_CONTRACTS, solusiEarlier: SAMPLE_SOLUSI_EARLIER }
});
rememberedUser();
createRoot(document.getElementById('root')!).render(<App />);
