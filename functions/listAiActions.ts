/**
 * App Function: listAiActions
 *
 * Returns the published AI Actions available in the current space so the
 * entry editor can offer them in the Translation mode Actions menu.
 * (The App SDK blocks AiAction entity access from the iframe, so this
 * runs server-side where the restriction doesn't apply.)
 *
 * Accepts: {} (no parameters)
 * Returns: { actions: Array<{ id, name, description }>, error?: string }
 */
import {
  FunctionEventHandler,
  FunctionTypeEnum,
  FunctionEventContext,
} from '@contentful/node-apps-toolkit';

interface ListAiActionsResponse {
  actions: Array<{ id: string; name: string; description: string }>;
  error?: string;
}

export const handler: FunctionEventHandler<FunctionTypeEnum.AppActionCall> = async (
  _event,
  context: FunctionEventContext,
): Promise<ListAiActionsResponse> => {
  try {
    const cma = context.cma;
    const spaceId: string = context.spaceId;

    const collection = await cma.aiAction.getMany({ spaceId, query: { limit: 100 } });

    // Only published actions can be invoked
    const actions = (collection.items as any[])
      .filter((a) => a.sys?.publishedAt)
      .map((a) => ({
        id: a.sys.id as string,
        name: (a.name as string) ?? a.sys.id,
        description: (a.description as string) ?? '',
      }));

    return { actions };
  } catch (err: any) {
    return { actions: [], error: `Function error: ${err?.message ?? String(err)}` };
  }
};
