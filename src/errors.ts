import { RouteLocation, RouteLocationRaw } from "./type";

export enum NavigationErrorTypes {
    /**重定向**/
    REDIRECT = 0,
    /**终止 */
    ABORTED = 1,
    /**取消 */
    CANCELLED = 2,
    /**存在多个相同，无明确指向 */
    SAME = 3,
    /** 未匹配到任何路由记录 */
    MATCHER_NOT_FOUND = 4
}

export const NavigationErrorSymbol = Symbol("JOKER_ROUTER_ERROR");

export interface NavigationError extends Error {
    type: NavigationErrorTypes;
    from: RouteLocation;
    to: RouteLocation | RouteLocationRaw;
    [NavigationErrorSymbol]: any;
}

export function createRouterError(
    type: NavigationErrorTypes,
    data: Pick<NavigationError, "to" | "from">
): NavigationError {
    let message: string;

    switch (type) {
        case NavigationErrorTypes.MATCHER_NOT_FOUND:
            message = `No matching route record found when navigating to ${JSON.stringify(data.to)}`;
            break;
        case NavigationErrorTypes.REDIRECT:
            message = `Route redirected from ${data.from.fullPath} to ${JSON.stringify(data.to)}`;
            break;
        case NavigationErrorTypes.ABORTED:
            message = `Navigation from ${data.from.fullPath} to ${(data.to as RouteLocation).fullPath} was aborted`;
            break;
        case NavigationErrorTypes.CANCELLED:
            message = `Navigation from ${data.from.fullPath} to ${(data.to as RouteLocation).fullPath} was cancelled`;
            break;
        case NavigationErrorTypes.SAME:
            message = `Multiple redundant route configurations detected for ${data.from.fullPath}. Please clean them up.`;
            break;
        default:
            message = "An unknown routing error occurred";
            break;
    }

    return Object.assign(new Error(message), { type, ...data, [NavigationErrorSymbol]: true });
}

export function isNavigationError(err: any, type?: NavigationErrorTypes): err is NavigationError {
    return (
        err instanceof Error &&
        NavigationErrorSymbol in err &&
        (type === undefined || (err as NavigationError).type === type)
    );
}
