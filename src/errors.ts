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
            message = `跳转到${JSON.stringify(data.to)}时，未找到目标路由记录`;
            break;
        case NavigationErrorTypes.REDIRECT:
            message = `路由从${data.from.fullPath}重定向到${JSON.stringify(data.to)}`;
            break;
        case NavigationErrorTypes.ABORTED:
            message = `路由从${data.from.fullPath}跳转到${(data.to as RouteLocation).fullPath}时被终止`;
            break;
        case NavigationErrorTypes.CANCELLED:
            message = `路由从${data.from.fullPath}跳转到${(data.to as RouteLocation).fullPath}时被取消`;
            break;

        case NavigationErrorTypes.SAME:
            message = `${data.from.fullPath}存在多条冗余路由配置，请及时清理`;
            break;
        default:
            message = "路由发生未知异常";
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
