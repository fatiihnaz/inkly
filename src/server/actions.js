"use server";

/**
 * @file CMS Server Actions.
 *
 * Import from `inscribed/actions`.
 * The `"use server"` directive at the top of this file is required -
 * Next.js treats every export as a Server Action callable from Client Components.
 */

import { revalidateTag } from "next/cache";

import { cmsCacheTag } from "./get-content.js";

/**
 * Drop the ISR cache for a page slug after an admin save.
 * Pass this directly as `onAfterSave` to `NextAuthCmsProvider` or `CmsProvider`.
 *
 * @param {string} slug
 */
export async function revalidateCmsSlug(slug) {
  revalidateTag(cmsCacheTag(slug));
}