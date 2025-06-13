import { isEmptyObject, logger } from "@joker.front/shared";
import { LOGTAG } from "../config";
import { RouteParams, RouteProps, RouteRecord, RouteRecordName, RouteRecordRaw, RouterOptions } from "../type";
import { comparePathParserScore, parserPath, PathParams, PathParser } from "./parsePath";
import { MatcherLocation, MatcherLocationRaw, MathcerResolveLocation } from "./type";
import { stripBase } from "../utils";

export interface RouteRecordMatcher extends PathParser {
    record: RouteRecord;

    parent?: RouteRecordMatcher;

    children: RouteRecordMatcher[];

    alias: RouteRecordMatcher[];
}

export class RouteMatcher {
    public matchers: RouteRecordMatcher[] = [];

    public matcherNameMap: Map<RouteRecordName, RouteRecordMatcher> = new Map();

    constructor(private routeOption: RouterOptions) {
        routeOption.routes.forEach((route) => this.addRoute(route));
    }

    public addRoute(record: RouteRecordRaw, parent?: RouteRecordMatcher, originalRecord?: RouteRecordMatcher) {
        let isRootAdd = !originalRecord;

        let routeRecord = createRouteRecord(record);

        if (parent && parent.record.name && !routeRecord.name && !routeRecord.path) {
            logger.warn(
                LOGTAG,
                `The route with name=${parent.record.name.toString()} has a child route where both the name and path are empty. Please check.`
            );
        }

        let childrenRouteRecords: RouteRecord[] = [routeRecord];

        if (record.alias) {
            let aliases = [record.alias].flat();

            for (let alias of aliases) {
                childrenRouteRecords.push({
                    ...routeRecord,

                    components: originalRecord ? originalRecord.record.components : routeRecord.components,
                    path: alias
                });
            }
        }

        let originalMatcher: RouteRecordMatcher | undefined;

        for (let childrenRouteRecord of childrenRouteRecords) {
            if (parent && childrenRouteRecord.path.charAt(0) !== "/") {
                //如果有父级 && 子路由地址不是/开头 =》 父路由地址/子路由地址
                //如果是/开头，则忽略父路由地址，作为绝对路径使用
                childrenRouteRecord.path =
                    parent.record.path +
                    (childrenRouteRecord.path &&
                        (parent.record.path.endsWith("/") ? "" : "/") + childrenRouteRecord.path);
            }

            if (childrenRouteRecord.path === "*") {
                throw new Error(
                    `To capture all routes using ("*"), you must define them with parameters that include custom regular expressions.`
                );
            }

            let matcher: RouteRecordMatcher = this.createRouteRecordMatcher(childrenRouteRecord, parent);

            if (originalMatcher) {
                originalMatcher.alias.push(matcher);
            } else {
                originalMatcher ||= matcher;

                if (originalMatcher !== matcher) {
                    originalMatcher.alias.push(matcher);
                }

                //无源 && 自身具有name，则移除路由记录
                //因为接下来会添加到上面的originalMatcher中
                if (isRootAdd && record.name) {
                    this.removeRoute(record.name);
                }
            }

            if (routeRecord.children) {
                for (let i = 0; i < routeRecord.children.length; i++) {
                    let record = routeRecord.children[i];
                    this.addRoute(record, matcher, originalRecord && originalRecord.children[i]);
                }
            }

            originalRecord ||= matcher;

            if (
                matcher.record.name ||
                matcher.record.redirect ||
                //有组件
                (matcher.record.components && isEmptyObject(matcher.record.components) === false)
            ) {
                this.appendMatcher(matcher);
            }
        }

        if (originalMatcher) {
            return () => {
                this.removeRoute(originalMatcher!);
            };
        } else {
            return () => {};
        }
    }

    public removeRoute(matcherOrName: RouteRecordName | RouteRecordMatcher) {
        if (isRouteName(matcherOrName)) {
            let matcher = this.matcherNameMap.get(matcherOrName);

            if (matcher) {
                this.matcherNameMap.delete(matcherOrName);
                this.matchers.splice(this.matchers.indexOf(matcher), 1);

                matcher.children.forEach(this.removeRoute);
                matcher.alias.forEach(this.removeRoute);
            }
        } else {
            let index = this.matchers.indexOf(matcherOrName);
            if (index > -1) {
                this.matchers.splice(index, 1);

                if (matcherOrName.record.name) {
                    this.matcherNameMap.delete(matcherOrName.record.name);

                    matcherOrName.children.forEach(this.removeRoute);
                    matcherOrName.alias.forEach(this.removeRoute);
                }
            }
        }
    }

    public resolve(location: MatcherLocationRaw, currentLocation: MatcherLocation): MathcerResolveLocation {
        let matcher: RouteRecordMatcher | undefined;
        let params: PathParams = {};
        let path: string;
        let name: RouteRecordName | undefined;

        if ("name" in location && location.name) {
            matcher = this.matcherNameMap.get(location.name);

            if (matcher === undefined) {
                throw new Error(`Not Match:${JSON.stringify(location)}`);
            }

            name = matcher.record.name;
            params = Object.assign(
                pickParams(
                    currentLocation.params,
                    //非全局的继承
                    matcher.keys.filter((m) => !m.optional).map((m) => m.name)
                ),
                location.params &&
                    pickParams(
                        location.params,
                        matcher.keys.map((m) => m.name)
                    )
            );

            path = matcher.stringify(params);
        } else if ("path" in location) {
            path = stripBase(location.path, this.routeOption.base || "");

            matcher = this.matchers.find((m) => m.regexp.test(path));

            if (matcher) {
                params = matcher.parse(path)!;
                name = matcher.record.name;
            }
        } else {
            matcher = currentLocation.name
                ? this.matcherNameMap.get(currentLocation.name)
                : this.matchers.find((m) => m.regexp.test(currentLocation.path));
            if (matcher === undefined) {
                throw new Error(`Not Found:${JSON.stringify(location)}`);
            }

            name = matcher.record.name;
            params = Object.assign({}, currentLocation.params, location.params);
            path = matcher.stringify(params);
        }

        let parentMatcher: RouteRecordMatcher | undefined = matcher;
        let matched: MathcerResolveLocation["matched"] = [];

        while (parentMatcher) {
            matched.unshift({ ...parentMatcher.record, parserPath: parentMatcher.stringify(params) });
            parentMatcher = parentMatcher.parent;
        }

        return {
            name,
            path,
            params,
            matched,
            meta: matched.reduce((meta, record) => Object.assign(meta, record.meta), {} as MatcherLocation["meta"])
        };
    }

    private createRouteRecordMatcher(record: RouteRecord, parent?: RouteRecordMatcher): RouteRecordMatcher {
        let parser = parserPath(record.path);

        return { ...parser, record, parent, children: [], alias: [] };
    }

    private appendMatcher(matcher: RouteRecordMatcher) {
        let i = 0;

        while (
            i < this.matchers.length &&
            comparePathParserScore(matcher, this.matchers[i]) >= 0 &&
            (matcher.record.path !== this.matchers[i].record.path ||
                isRecordChildOf(matcher, this.matchers[i]) === false)
        ) {
            i++;
        }

        this.matchers.splice(i, 0, matcher);

        if (matcher.record.name) {
            this.matcherNameMap.set(matcher.record.name, matcher);
        }
    }
}

function isRecordChildOf(record: RouteRecordMatcher, parent: RouteRecordMatcher): boolean {
    return parent.children.some((m) => m === record || isRecordChildOf(record, m));
}

function createRouteRecord(record: RouteRecordRaw): RouteRecord {
    let components: RouteRecord["components"] | undefined = undefined;

    if ("components" in record) {
        components = {};
        for (let name in record.components) {
            components[name] = { component: record.components[name] };
        }
    } else if ("component" in record && record.component) {
        components = {
            default: { component: record.component }
        };
    }

    return {
        path: record.path,
        redirect: record.redirect,
        name: record.name,
        meta: record.meta || {},
        keepalive: record.keepalive,
        beforeEnter: record.beforeEnter,
        beforeLeave: record.beforeLeave,
        children: record.children || [],
        //容错补充，在实际转换时生效
        parserPath: "",
        props: transformRouteRecordProps(record),
        components
    };
}

function transformRouteRecordProps(record: RouteRecordRaw): Record<string, RouteProps> {
    let result: Record<string, RouteProps> = {};

    if (record.props === undefined) return result;

    if ("component" in record) {
        result.default = record.props;
    } else if ("components" in record) {
        for (let name in record.components) {
            result[name] = record.props[name] || {};
        }
    }

    return result;
}

function pickParams(params: RouteParams, keys: string[]): RouteParams {
    let result: RouteParams = {};

    for (let key of keys) {
        if (key in params) {
            result[key] = params[key];
        }
    }

    return result;
}

export function isRouteName(name: any): name is RouteRecordName {
    return typeof name === "string" || typeof name === "symbol";
}
