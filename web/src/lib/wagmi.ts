import { createConfig, http } from 'wagmi';
import { biteSandbox } from './chain';

let _config: ReturnType<typeof createConfig> | null = null;

export function getConfig() {
  if (!_config) {
    _config = createConfig({
      chains: [biteSandbox],
      transports: {
        [biteSandbox.id]: http(biteSandbox.rpcUrls.default.http[0]),
      },
      ssr: true,
    });
  }
  return _config;
}
