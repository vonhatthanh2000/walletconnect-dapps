// @ton/core uses Node's Buffer. Browsers don't have it, so provide it globally before anything else loads.
import { Buffer } from 'buffer'

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof import('buffer').Buffer
}

globalThis.Buffer ??= Buffer
