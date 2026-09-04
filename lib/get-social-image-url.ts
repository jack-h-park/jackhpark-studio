import { api, host } from "./config";
import { errorMessage } from "./error-message";

export function getSocialImageUrl(pageId: string | undefined) {
  try {
    const url = new URL(api.getSocialImage, host);

    if (pageId) {
      url.searchParams.set("id", pageId);
      return url.toString();
    }
  } catch (err: unknown) {
    console.warn("error invalid social image url", pageId, errorMessage(err));
  }

  return null;
}
