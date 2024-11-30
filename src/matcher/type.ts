import { KeepAlive, RouteMeta, RouteParams, RouteRecord, RouteRecordName } from "../type";

export type MatcherLocationRaw = MatcherLocationAsPath | MatcherLocationAsName | MatcherLocationAsRelative;

/**
 * 地址 path匹配
 */
export interface MatcherLocationAsPath {
    path: string;
}

export interface MatcherLocationAsName {
    name: string;
    params?: RouteParams;
}

export interface MatcherLocationAsRelative {
    params?: RouteParams;
}

/**
 * 匹配后的路由地址
 */
export interface MatcherLocation {
    /**
     * name匹配
     */
    name?: RouteRecordName;

    /**
     * 匹配地址/name寻址转换后的地址
     */
    path: string;

    /**
     * 通过path解码出的param参数
     */
    params: RouteParams;

    /**
     * 路由数据元
     */
    meta: RouteMeta;

    /**
     * 匹配的路由记录（留痕）
     */
    matched: RouteRecord[];
}

export type MathcerResolveLocation = Omit<MatcherLocation, "mathed"> & {
    /**
     * 匹配的路由记录（留痕）
     */
    matched: Array<RouteRecord>;
};
