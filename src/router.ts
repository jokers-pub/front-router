import { ShallowObserver } from "@joker.front/core";
import {
    parseURL,
    decode,
    encodeParam,
    stringifyURL,
    logger,
    encodeHash,
    useCallbacks,
    noop
} from "@joker.front/shared";
import { LOGTAG } from "./config";
import { createRouterError, isNavigationError, NavigationError, NavigationErrorTypes } from "./errors";
import { HistoryState, IRouteHistory, NavigationType, WebHashHistory } from "./history";
import { RouteMatcher, RouteRecordMatcher } from "./matcher";
import { MatcherLocationRaw } from "./matcher/type";
import {
    getCurrentScrollPosition,
    getSavedScrollPosition,
    getScrollKey,
    saveScrollPosition,
    ScrollPosition,
    scrollToPosition
} from "./scroll";
import {
    Lazy,
    NavigationAfterCallback,
    NavigationCallback,
    RouteLocation,
    RouteLocationOption,
    RouteLocationRaw,
    RouterOptions,
    RouteParamsRaw,
    RouteRecord,
    RouteRecordName,
    RouteRecordRaw
} from "./type";
import { callbackToPromise, isSameRouteLocation, transformParams } from "./utils";

/**
 * 获取当前初始化的路由，若为空，则代表顺序有误，请先初始化路由，再进行该获取操作
 */
export let router!: Router;

/**
 * 初始化路由
 */
export class Router {
    private matcher: RouteMatcher;

    public route: ShallowObserver<RouteLocation> = new ShallowObserver(DEFAULT_LOCATION_ROUTE_RECORD);

    public routerHistory: IRouteHistory;

    /**
     * 跳转前路由勾子
     */
    public beforeRouteCallbacks = useCallbacks<NavigationCallback>();
    /**
     * 跳转后路由勾子
     */
    public afterRouteCallbacks = useCallbacks<NavigationAfterCallback>();

    /**
     * 异常处理钩子
     */
    public errorCallbacks = useCallbacks<(err: any, to: any, from: any) => any>();

    /**
     * 路由状态，第一次错误或者一次路由跳转则会进行修改
     */
    private readyState: boolean = false;

    /**
     * ready监听回调
     */
    private readyCallbacks = useCallbacks<(err?: any) => void>();

    /**
     * 移除history监听
     */
    private destroyHistoryListener?: () => void;

    /**
     * 用于记录中间态路由
     */
    private pendingLocation: RouteLocation = DEFAULT_LOCATION_ROUTE_RECORD;

    constructor(public options: RouterOptions) {
        if (options.loggerLeve) {
            logger.setLoggerLeve(options.loggerLeve);
        }

        this.routerHistory = options.history || new WebHashHistory(options.base);

        this.matcher = new RouteMatcher(options);

        router = this;

        if (this.route.isChanged === false) {
            this.push(this.routerHistory.location).catch((e) => {
                logger.warn(
                    LOGTAG,
                    `Failed to navigate to default address on first startup: ${this.routerHistory.location}`,
                    e
                );
            });
        }
    }

    /**
     * 判断是否已经完成路由初始化运行
     * @returns
     */
    public isReady(): Promise<void> {
        if (this.readyState && this.route.isChanged) return Promise.resolve();

        return new Promise((resolve, reject) => {
            this.readyCallbacks.add((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 添加路由
     * @param route 路由记录
     * @param parentRouteOrName 父路由name（可选）
     * @returns 路由销毁方法
     */
    public addRoute(route: RouteRecordRaw, parentRouteName?: RouteRecordName): () => void {
        let parent: RouteRecordMatcher | undefined = undefined;
        if (parentRouteName) {
            parent = this.matcher.matcherNameMap.get(parentRouteName);
        }

        return this.matcher.addRoute(route, parent);
    }

    /**
     * 移除路由
     * @param name 路由名称
     */
    public removeRoute(name: RouteRecordName): void {
        let recordMatcher = this.matcher.matcherNameMap.get(name);

        if (recordMatcher) {
            this.matcher.removeRoute(recordMatcher);
        } else {
            logger.warn("Routing", `Route record found when calling removeRoute, route name: "${String(name)}"`);
        }
    }

    /**
     * 获取路由记录列表
     */
    public get routes(): RouteRecord[] {
        return this.matcher.matchers.map((m) => m.record);
    }

    /**
     * 检查路由是否存在
     * @param name 路由名称
     * @returns
     */
    public hasRoute(name: RouteRecordName): boolean {
        return this.matcher.matcherNameMap.has(name);
    }

    /**
     * 解析路由
     * @param rawLocation
     * @param currentLocation
     * @returns
     */
    public resolve(rawLocation: RouteLocationRaw, currentLocation?: RouteLocation): RouteLocation & { href: string } {
        currentLocation = Object.assign({}, currentLocation, this.route.value);

        if (typeof rawLocation === "string") {
            let locationNormalized = parseURL(rawLocation, currentLocation.path);
            let matchedRoute = this.matcher.resolve({ path: locationNormalized.path }, currentLocation);
            let href = this.routerHistory.createHref(locationNormalized.fullPath);

            if (matchedRoute.matched.length === 0) {
                let error = createRouterError(NavigationErrorTypes.MATCHER_NOT_FOUND, {
                    to: rawLocation,
                    from: this.route.value
                });

                this.triggerError(error, rawLocation, this.route.value);
            }

            return Object.assign(locationNormalized, matchedRoute, {
                params: transformParams(matchedRoute.params, decode),
                hash: decode(locationNormalized.hash),
                redirectedFrom: undefined,

                href
            });
        }

        let matcherLocation: MatcherLocationRaw;
        if ("path" in rawLocation) {
            matcherLocation = Object.assign({}, rawLocation, {
                path: parseURL(rawLocation.path, currentLocation.path).path
            });
        } else {
            let params: RouteParamsRaw = {};

            for (let key in rawLocation.params) {
                if (rawLocation.params[key] !== undefined) {
                    params[key] = rawLocation.params[key];
                }
            }

            matcherLocation = Object.assign({}, rawLocation, {
                params: transformParams(rawLocation.params, encodeParam)
            });

            currentLocation.params = transformParams(currentLocation.params, encodeParam);
        }

        let matchedRoute = this.matcher.resolve(matcherLocation, currentLocation);

        if (matchedRoute.matched.length === 0) {
            let error = createRouterError(NavigationErrorTypes.MATCHER_NOT_FOUND, {
                to: rawLocation,
                from: this.route.value
            });

            this.triggerError(error, rawLocation, this.route.value);
        }

        let hash = rawLocation.hash || "";

        matchedRoute.params = transformParams(matchedRoute.params, decode);
        let fullPath = stringifyURL({
            ...rawLocation,
            hash: encodeHash(hash),
            path: matchedRoute.path
        });

        let href = this.routerHistory.createHref(fullPath);

        return {
            fullPath,
            hash,
            query: rawLocation.query || {},
            ...matchedRoute,
            redirectedFrom: undefined,
            href
        };
    }

    /**
     * 前进
     * @param to 目标地址
     * @returns
     */
    public push(to: RouteLocationRaw) {
        return this.pushWithRedirect(to);
    }

    /**
     * 前进（替换当前历史节点）
     * @param to 目标地址
     * @returns
     */
    public replace(to: RouteLocationRaw) {
        return this.pushWithRedirect({
            ...this.locationAsObject(to),
            replace: true
        });
    }
    /**
     * 初始化路由监听,在完成一次ready时进行路由监听
     */
    private initHistoryListener() {
        if (this.destroyHistoryListener) return;

        this.destroyHistoryListener = this.routerHistory.listen((to, _from, info) => {
            let toLocation = this.resolve(to);

            let newToLocation = this.checkAndReturnNewRouteRecordRaw(toLocation);

            if (newToLocation) {
                this.pushWithRedirect(
                    {
                        ...newToLocation,
                        replace: true
                    },
                    toLocation
                )
                    //异常补偿
                    .catch(noop);

                return;
            }

            this.pendingLocation = toLocation;
            let from = this.route.value;

            //记录位置
            saveScrollPosition(getScrollKey(from.fullPath, info.delta), getCurrentScrollPosition());

            this.navigate(toLocation, from)
                .catch((err) => {
                    if (isNavigationError(err, NavigationErrorTypes.ABORTED | NavigationErrorTypes.CANCELLED)) {
                        return err;
                    }

                    if (isNavigationError(err, NavigationErrorTypes.REDIRECT)) {
                        this.pushWithRedirect(err.to, toLocation)
                            .then((error) => {
                                //异常（中断、相似路由） && 具有路由偏移量（有变更） && 路由方向是后退
                                //如果是该场景，则再跨一级后退
                                if (
                                    isNavigationError(
                                        error,
                                        NavigationErrorTypes.ABORTED | NavigationErrorTypes.SAME
                                    ) &&
                                    !info.delta &&
                                    info.type === NavigationType.pop
                                ) {
                                    this.routerHistory.go(-1, false);
                                }
                            })
                            .catch(noop);

                        return Promise.reject();
                    }

                    if (info.delta) {
                        this.routerHistory.go(-info.delta, false);
                    }

                    return this.triggerError(err, toLocation, from);
                })
                .then((error?: NavigationError) => {
                    error ||= this.finalizeNavigation(toLocation, from);

                    if (error) {
                        //非取消类，则做路由偏移
                        if (info.delta && isNavigationError(error, NavigationErrorTypes.CANCELLED) === false) {
                            this.routerHistory.go(info.delta, false);
                        }
                        //回跳 && （相同||终止）
                        else if (
                            info.type === NavigationType.pop &&
                            isNavigationError(error, NavigationErrorTypes.ABORTED | NavigationErrorTypes.SAME)
                        ) {
                            this.routerHistory.go(-1, false);
                        }
                    }

                    this.triggerAfter(toLocation, from, error);
                })
                //异常补偿
                .catch(noop);
        });
    }

    private pushWithRedirect(
        to: RouteLocation | RouteLocationRaw,
        redirectedFrom?: RouteLocation
    ): Promise<NavigationError | void> {
        //记录中间态
        this.pendingLocation = this.resolve(to);

        let from = this.route.value;

        let data: HistoryState | undefined = typeof to !== "string" && "state" in to ? to.state : undefined;
        let force: boolean = !!(typeof to !== "string" && "force" in to ? to.force : undefined);
        let replace: boolean = !!(typeof to !== "string" && "replace" in to ? to.replace : undefined);
        let refresh: boolean = !!(typeof to !== "string" && "refresh" in to ? to.refresh : undefined);

        let shouldRedirect = this.checkAndReturnNewRouteRecordRaw(this.pendingLocation);

        if (shouldRedirect) {
            return this.pushWithRedirect(
                {
                    ...shouldRedirect,
                    state: Object.assign({}, data, shouldRedirect.state),
                    force,
                    replace
                },
                redirectedFrom || this.pendingLocation
            );
        }

        let toLocation = this.pendingLocation as RouteLocation;
        toLocation.redirectedFrom = redirectedFrom;

        let err: NavigationError | undefined = undefined;
        if (force === false && isSameRouteLocation(from, toLocation)) {
            err = createRouterError(NavigationErrorTypes.SAME, { to: toLocation, from });

            //same
            this.activeScroll(from, from, true, false);

            //非强制，不做路由切换，只做异常‘返回’
            return Promise.resolve(err);
        }

        //刷新目标缓存
        if (refresh) {
            toLocation.matched.forEach((m) => {
                for (let name in m.components) {
                    m.components[name].instance?.$destroy(true);
                    m.components[name].instance = undefined;
                    m.components[name].wakeCount = undefined;
                }
            });
        }

        return this.navigate(toLocation, from)
            .catch((err) => {
                return isNavigationError(err)
                    ? isNavigationError(err, NavigationErrorTypes.REDIRECT)
                        ? err
                        : this.markReady(err)
                    : this.triggerError(err, toLocation, from);
            })
            .then((err?: NavigationError) => {
                err ||= this.finalizeNavigation(toLocation, from, true, replace, data);

                if (err) {
                    if (isNavigationError(err, NavigationErrorTypes.REDIRECT)) {
                        return this.pushWithRedirect(
                            {
                                replace,
                                ...this.locationAsObject(err.to),
                                force,
                                refresh,
                                state:
                                    typeof err.to === "string"
                                        ? data
                                        : Object.assign({}, data, (err.to as RouteLocationOption).state)
                            },
                            redirectedFrom || toLocation
                        );
                    }
                }

                this.triggerAfter(toLocation, from, err);

                return err;
            });
    }

    /**
     * 跳转到哪个位置（仅支持索引）
     * @param delat 偏移量
     * @returns
     */
    public go = (delat: number) => this.routerHistory.go(delat);

    /**
     * 返回上一级
     * @returns
     */
    public back = () => this.go(-1);

    /**
     * 前进下一级（仅在有返回历史时生效）
     * @returns
     */
    public forward = () => this.go(1);

    private navigate(to: RouteLocation, from: RouteLocation): Promise<void | NavigationError> {
        let [leaveingRecords] = extractChangingRecords(to, from);
        let callbacks: Lazy<any>[] = [];

        leaveingRecords.forEach((record) => {
            if (record.beforeLeave) {
                [record.beforeLeave].flat().forEach((callback) => {
                    callbacks.push(callbackToPromise(callback, to, from));
                });
            }
        });

        let canceledNavigationCallback = () => {
            let error = this.checkCanceledNavigation(to, from);
            if (error) return Promise.reject(error);

            return Promise.resolve();
        };

        callbacks.push(canceledNavigationCallback);

        return (
            runCallbackQueue(callbacks)
                //beforeRouteCallbacks
                .then(() => {
                    callbacks = [];

                    this.beforeRouteCallbacks.callbacks.forEach((m) => {
                        callbacks.push(callbackToPromise(m, to, from));
                    });

                    callbacks.push(canceledNavigationCallback);

                    return runCallbackQueue(callbacks);
                })

                //路由配置项中的beforeEnter周期
                .then(() => {
                    callbacks = [];

                    to.matched.forEach((record) => {
                        //具有beforeEnter周期，并from时未被触发
                        if (record.beforeEnter && from.matched.includes(record) === false) {
                            [record.beforeEnter].flat().forEach((callback) => {
                                callbacks.push(callbackToPromise(callback, to, from));
                            });
                        }
                    });

                    callbacks.push(canceledNavigationCallback);

                    return runCallbackQueue(callbacks);
                })
                .catch((err) =>
                    //cancel 不会做异常
                    isNavigationError(err, NavigationErrorTypes.CANCELLED) ? err : Promise.reject(err)
                )
        );
    }

    private finalizeNavigation(
        to: RouteLocation,
        from: RouteLocation,
        isPush?: boolean,
        replace?: boolean,
        data?: HistoryState
    ): undefined | NavigationError {
        let error = this.checkCanceledNavigation(to, from);
        if (error) {
            return error;
        }

        let isFirstNavigation = this.route.isChanged === false;
        let state = history.state;

        if (isPush) {
            //如果是否次前进 || replace方式前进，则处理历史栈
            if (replace || isFirstNavigation) {
                this.routerHistory.replace(
                    to.fullPath,
                    Object.assign(
                        {
                            scroll: isFirstNavigation && state && state.scroll
                        },
                        data
                    )
                );
            }
            //否则追加记录
            else {
                this.routerHistory.push(to.fullPath, data);
            }
        }

        this.route.value = to;
        this.activeScroll(to, from, !!isPush, isFirstNavigation);

        this.markReady();
    }

    private checkAndReturnNewRouteRecordRaw(to: RouteLocation): Exclude<RouteLocationRaw, string> | undefined {
        let lastMatched = to.matched[to.matched.length - 1];

        if (lastMatched && lastMatched.redirect) {
            let newTargetLocation =
                typeof lastMatched.redirect === "function" ? lastMatched.redirect(to) : lastMatched.redirect;

            if (typeof newTargetLocation === "string") {
                newTargetLocation =
                    newTargetLocation.includes("?") || newTargetLocation.includes("#")
                        ? this.locationAsObject(newTargetLocation)
                        : { path: (this.options.base || "") + newTargetLocation };
            }

            return {
                query: to.query,
                hash: to.hash,
                params: "path" in newTargetLocation ? {} : to.params,
                ...newTargetLocation
            };
        }

        return;
    }

    private checkCanceledNavigation(to: RouteLocation, from: RouteLocation): NavigationError | void {
        //过程路由与to不一致，则代表取消或重定向
        if (this.pendingLocation !== to) {
            return createRouterError(NavigationErrorTypes.CANCELLED, { from, to });
        }
    }

    private locationAsObject(to: RouteLocationRaw): Exclude<RouteLocationRaw, string> {
        return typeof to === "string" ? parseURL(to, this.route.value.path) : { ...to };
    }

    private markReady(err?: any): any | void {
        if (this.readyState === false) {
            this.readyState = !err;

            this.initHistoryListener();

            this.readyCallbacks.callbacks.forEach((n) => {
                n(err);
            });

            this.readyCallbacks.reset();
        }

        return err;
    }

    private triggerError(err: any, to: any, from: any): Promise<any> {
        this.markReady(err);

        if (this.errorCallbacks.callbacks.length) {
            this.errorCallbacks.callbacks.forEach((m) => m(err, to, from));
        } else {
            //MATCHER_NOT_FOUND 做异常中断
            if (isNavigationError(err, NavigationErrorTypes.MATCHER_NOT_FOUND)) {
                throw err;
            }

            logger.warn(LOGTAG, "An exception occurred during route navigation", err);
        }

        //为了在catch中作为返回值直接返回
        return Promise.reject(err);
    }

    private triggerAfter(to: RouteLocation, from: RouteLocation, err?: NavigationError): void {
        this.afterRouteCallbacks.callbacks.forEach((m) => m(to, from, err));
    }

    private activeScroll(to: RouteLocation, from: RouteLocation, isPush: boolean, isFirst: boolean) {
        if (!this.options.scrollBehavior) return Promise.resolve();

        let scrollPosition: ScrollPosition | undefined;
        //如果不是前进，则优先取保存的滚动位置
        if (!isPush) {
            scrollPosition = getSavedScrollPosition(getScrollKey(to.fullPath, 0));
        }

        if (scrollPosition === undefined && (isFirst || !isPush) && history.state) {
            scrollPosition = history.state.scroll;
        }

        return Promise.resolve(this.options.scrollBehavior(to, from, scrollPosition))
            .then((position) => position && scrollToPosition(position))
            .catch((err) => this.triggerError(err, to, from));
    }
}

const DEFAULT_LOCATION_ROUTE_RECORD: RouteLocation = {
    path: "/",
    name: undefined,
    params: {},
    query: {},
    hash: "",
    fullPath: "/",
    matched: [],
    meta: {},
    redirectedFrom: undefined
};

function extractChangingRecords(to: RouteLocation, from: RouteLocation) {
    let leaveingRecords: RouteRecord[] = [];
    let updatingRecords: RouteRecord[] = [];

    let maxLength = Math.max(from.matched.length, to.matched.length);

    for (let i = 0; i < maxLength; i++) {
        let recordFrom = from.matched[i];

        if (recordFrom) {
            if (to.matched.find((m) => m === recordFrom)) {
                updatingRecords.push(recordFrom);
            } else {
                leaveingRecords.push(recordFrom);
            }
        }
    }

    return [leaveingRecords, updatingRecords];
}

function runCallbackQueue(callbacks: Lazy<any>[]): Promise<void> {
    return callbacks.reduce((promise, callback) => promise.then(() => callback()), Promise.resolve());
}

/**
 * 获取当前匹配的路由
 * @returns
 */
export function getCurrentRoute(): RouteLocation {
    return router.route.value;
}
