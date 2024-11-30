import { HistoryState, IRouteHistory } from "./history";
import { ScrollPosition } from "./scroll";
import type { Component, ComponentConstructor } from "@joker.front/core";
import { MatcherLocation, MatcherLocationAsPath } from "./matcher/type";
import { LocationQuery, LoggerLeve } from "@joker.front/shared";
import { NavigationError } from "./errors";

export type Awaitable<T> = T | Promise<T>;

export type Lazy<T> = () => Promise<T>;

export type RouteRecordName = string | symbol;

export type RouteScrollBehavior = (
    to: RouteLocation,
    from: RouteLocation,
    savedPosition: ScrollPosition | undefined
) => Awaitable<ScrollPosition | false | void>;

/**
 * 路由初始化配置
 */
export interface RouterOptions {
    /**
     * 历史栈模式
     *
     * @default WebHashHistory模式
     *
     */
    history?: IRouteHistory;

    /**
     * 路由根
     */
    base?: string;

    /**
     * 路由切换时滚动条行为控制
     */
    scrollBehavior?: RouteScrollBehavior;

    /**
     * 路由记录列表
     */
    routes: Readonly<RouteRecordRaw[]>;

    /**
     * 日志等级
     * {@link LoggerLeve}
     */
    loggerLeve?: LoggerLeve;
}

//#region  路由配置项数据
export type RouteRecordRaw = RouteRecordSingleView | RouteRecordMultipleView | RouteRecordBase;

/**
 * 路由展示单组件页面
 */
export type RouteRecordSingleView = RouteRecordBase & {
    component: RouteComponent;

    props?: RouteProps;
};

export type RouteRecordMultipleView = RouteRecordBase & {
    components: Record<string, RouteComponent>;

    props?: Record<string, RouteProps>;
};

//#endregion

export interface RouteRecord
    extends Pick<
        RouteRecordBase,
        "path" | "redirect" | "name" | "beforeLeave" | "beforeEnter" | "children" | "keepalive"
    > {
    parserPath: string;

    meta: Exclude<RouteRecordBase["meta"], void>;

    props: Record<string, RouteProps>;

    components?: Record<string, RouteRecordComponent>;
}

export type RouteRecordComponent = { component: RouteComponent; instance?: Component; wakeCount?: number };

export type KeepAlive = "once" | boolean;

export interface RouteRecordBase {
    /**
     * 匹配地址必须已'/'开头，除非它是一个字路由
     * @example '/demo/page' , '/demo/:id'
     */
    path: string;

    /**
     * 重定向配置
     */
    redirect?: RouteRecordRedirectOption;

    /**
     * 配置路由path补充
     * 例如：/demo/:id ==> id
     */
    alias?: string | string[];

    /**
     * 路由名称
     */
    name?: RouteRecordName;

    //before hook
    beforeEnter?: NavigationCallback | NavigationCallback[];

    //before hook
    beforeLeave?: NavigationCallback | NavigationCallback[];
    /**
     * 路由元数据
     */
    meta?: RouteMeta;

    /**
     * 子路由
     */
    children?: RouteRecordRaw[];

    /**
     * 参数
     */
    props?: RouteProps | Record<string, RouteProps>;

    /**
     * 是否保存当前路由下的组件状态，当再次展现时不再初始化组件，保存交互状态
     * - true：一直保持存活，可以通过跳转时使用refresh属性进行缓存销毁刷新；
     * - 'once' ：代表只存活一次，满足大部分的场景；
     * - undefind|false 代表保留状态；
     *
     * @default undefind
     */
    keepalive?: KeepAlive;
}

/**
 * 路由重定向配置
 */
export type RouteRecordRedirectOption = RouteLocationRaw | ((to: RouteLocationBase) => RouteLocationRaw);

/**
 * 路由地址
 */
export type RouteLocationRaw = string | RouteLocationPathRaw | RouteLocationNameRaw;

/**
 * path匹配路由
 */
export type RouteLocationPathRaw = RouteQueryAndHash & MatcherLocationAsPath & RouteLocationOption;

/**
 * name模式路由
 */
export type RouteLocationNameRaw = RouteQueryAndHash & LocationAsRelativeRaw & RouteLocationOption;

/**
 * 静态路由地址（name模式）
 */
export interface LocationAsRelativeRaw {
    name?: RouteRecordName;
    params?: RouteParamsRaw;
}

/**
 * 路由地址跳转配置，包含replace、强制等配置
 */
export interface RouteLocationOption {
    /**
     * replace跳转
     */
    replace?: boolean;
    /**
     * 强制跳转，一般适用于相同地址的强制刷新
     */
    force?: boolean;
    /**
     * 刷新缓存，当页面存在keepalive时，可通过该属性刷新缓存
     */
    refresh?: boolean;
    /**
     * 路由状态数据
     */
    state?: HistoryState;
}

/**
 * Query 和 Hash 路由基础
 */
export interface RouteQueryAndHash {
    query?: LocationQuery;
    hash?: string;
}

export interface RouteLocationBase extends Omit<MatcherLocation, "matched"> {
    fullPath: string;

    query: LocationQuery;

    hash: string;

    redirectedFrom?: RouteLocationBase;
}

export interface RouteLocation extends RouteLocationBase {
    /**
     * 匹配的路由记录（留痕）
     */
    matched: Array<RouteRecord>;
}

//#region  RouteParam | RoutMeta |RouteProps
export type RouteParamsValueRaw = string | number | undefined;

export type RouteParamsRaw = Record<string, RouteParamsValueRaw | Exclude<RouteParamsValueRaw, undefined>[]>;

export type RouteParams = Record<string, any>;

export type RouteMeta = Record<string | number | symbol, any>;

export type RouteProps = Record<string, any> | ((to: RouteLocationBase) => Record<string, any>);
//#endregion

export type RouteComponent = ComponentConstructor | Lazy<{ default: ComponentConstructor }>;

export type NavigationCallbackReturn = Error | RouteLocationRaw | boolean | undefined | void;

export type NavigationNextCallback = (valid?: Error | RouteLocationRaw | boolean | void) => void;

export type NavigationCallback = (
    to: RouteLocation,
    from: RouteLocation,
    next: NavigationNextCallback
) => Awaitable<NavigationCallbackReturn>;

export type NavigationAfterCallback = (
    to: RouteLocation,
    from: RouteLocation,
    failure?: NavigationError | void
) => void;
