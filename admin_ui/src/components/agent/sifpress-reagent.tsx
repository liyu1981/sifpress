import { ReAgent, type ReAgentProps, type ReAgentTranslate } from '@liyu1981/reagent';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { assetMarkdownLink, assetSourceUrl, assetsApi, MarkdownView } from 'ui-sdk';

import { SIFPRESS_TOOLS } from '@/lib/agent/sifpress-tools';
import { AGENT_STORAGE_PREFIX } from '@/lib/agent/agent-defaults';
import { useResolvedTheme } from '@/lib/theme';

type SifpressReAgentProps = Omit<
  ReAgentProps,
  | 'theme'
  | 'language'
  | 'translate'
  | 'renderMarkdown'
  | 'extraDescriptors'
  | 'notify'
  | 'uploadFile'
  | 'storagePrefix'
>;

/**
 * Binds ReAgent to Sifpress: app i18n, theme, Markdown rendering, the Sifpress
 * tool set, sonner notifications and asset uploads. Everything else is the
 * stock component.
 */
export function SifpressReAgent(props: SifpressReAgentProps) {
  const { t, i18n } = useTranslation();
  const theme = useResolvedTheme();

  return (
    <ReAgent
      {...props}
      storagePrefix={AGENT_STORAGE_PREFIX}
      theme={theme}
      language={i18n.language}
      translate={t as unknown as ReAgentTranslate}
      renderMarkdown={MarkdownView}
      extraDescriptors={SIFPRESS_TOOLS}
      notify={(message, level) => {
        if (level === 'error') {
          toast.error(message);
        } else {
          toast.success(message);
        }
      }}
      uploadFile={async file => {
        const formData = new FormData();
        formData.append('file', file);
        const { asset } = await assetsApi.create(formData);
        return asset.kind === 'image' || asset.kind === 'video'
          ? assetMarkdownLink(asset.name, asset.id, asset.kind)
          : `[${asset.name}](${assetSourceUrl(asset.id, asset.name, asset.kind)})`;
      }}
    />
  );
}
