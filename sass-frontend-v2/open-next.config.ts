// ==============================================================================
// OpenNext for Cloudflare — build-time configuration for sass-frontend-v2.
//
// The default Cloudflare config is enough for SSR + client assets.  When you
// start using ISR / `revalidateTag` / `revalidatePath`, plug in the R2
// incremental-cache override (commented below) and add the matching r2_buckets
// binding in wrangler.jsonc.
// Docs: https://opennext.js.org/cloudflare/caching
// ==============================================================================

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // incrementalCache: r2IncrementalCache, // uncomment when R2 bucket is bound
});
