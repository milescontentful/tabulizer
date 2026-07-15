/**
 * Frontend helpers for calling Tabulizer's App Actions (backed by App Functions).
 *
 * App Functions run server-side on Contentful's infrastructure, which lets them
 * invoke Contentful AI Actions — something the App SDK blocks from the iframe.
 * App Action IDs live on the app definition, so they're stable across every
 * space the app is installed in (see contentful-app-manifest.json).
 */
import type { EditorAppSDK } from '@contentful/app-sdk';

export const APP_ACTION_IDS = {
  listAiActions: '34PhrpWXe5vNmptu6tIErP',
  translateFields: 'ch8JlwGk5hZbFWNNvvTB8',
} as const;

export interface AiActionInfo {
  id: string;
  name: string;
  description: string;
}

/**
 * Invokes an App Action and returns its parsed JSON response body.
 */
async function invokeAppAction<T>(
  sdk: EditorAppSDK,
  appActionId: string,
  parameters: Record<string, unknown>
): Promise<T> {
  const result = await (sdk.cma as any).appActionCall.createWithResponse(
    { appActionId, appDefinitionId: sdk.ids.app },
    { parameters }
  );
  const rawBody = result?.response?.body ?? result?.body ?? '{}';
  return (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody) as T;
}

/** Fetch the published AI Actions available in this space (server-side lookup). */
export async function listAiActions(sdk: EditorAppSDK): Promise<AiActionInfo[]> {
  const result = await invokeAppAction<{ actions: AiActionInfo[]; error?: string }>(
    sdk,
    APP_ACTION_IDS.listAiActions,
    {}
  );
  if (result.error) throw new Error(result.error);
  return result.actions;
}

/**
 * Translate the entry's localizable text fields from source to target locale
 * using the given AI Action. Returns the translations (fieldId → text) so the
 * caller can apply them through the App SDK field API.
 */
export async function translateFieldsViaAiAction(
  sdk: EditorAppSDK,
  aiActionId: string,
  sourceLocale: string,
  targetLocale: string
): Promise<{ translations: Record<string, string>; skippedCount: number }> {
  const result = await invokeAppAction<{
    translations: Record<string, string>;
    skippedCount: number;
    error?: string;
  }>(sdk, APP_ACTION_IDS.translateFields, {
    entryId: sdk.ids.entry,
    sourceLocale,
    targetLocale,
    aiActionId,
  });
  if (result.error) throw new Error(result.error);
  return result;
}
