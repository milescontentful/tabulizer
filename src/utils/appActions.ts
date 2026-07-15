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
 * Translate ONE field from source to target locale using the given AI Action.
 * Called once per field (in parallel) so translations stream into the UI.
 * Returns the translated value (string for Symbol/Text, document for RichText)
 * or skipped=true when there was nothing to translate.
 */
export async function translateFieldViaAiAction(
  sdk: EditorAppSDK,
  aiActionId: string,
  fieldId: string,
  sourceLocale: string,
  targetLocale: string
): Promise<{ value?: string | object; skipped?: boolean }> {
  const result = await invokeAppAction<{
    value?: string | object;
    skipped?: boolean;
    error?: string;
  }>(sdk, APP_ACTION_IDS.translateFields, {
    entryId: sdk.ids.entry,
    fieldId,
    sourceLocale,
    targetLocale,
    aiActionId,
  });
  if (result.error && !result.skipped) throw new Error(result.error);
  return result;
}
