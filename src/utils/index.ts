import { stringifyQuery } from "@joker.front/shared";
import { createRouterError, NavigationErrorTypes } from "../errors";
import {
    Lazy,
    NavigationCallback,
    NavigationNextCallback,
    RouteLocation,
    RouteParams,
    RouteParamsRaw,
    RouteParamsValueRaw
} from "../type";

export function callbackToPromise(callBack: NavigationCallback, to: RouteLocation, from: RouteLocation): Lazy<void> {
    return () =>
        new Promise((resolve, reject) => {
            let next: NavigationNextCallback = (valid) => {
                if (valid === false) {
                    reject(createRouterError(NavigationErrorTypes.ABORTED, { from, to }));
                } else if (valid instanceof Error) {
                    reject(valid);
                } else if (typeof valid === "object" || typeof valid === "string") {
                    //重定向 to->新地址
                    reject(createRouterError(NavigationErrorTypes.REDIRECT, { from: to, to: valid }));
                } else {
                    //true | underfind
                    resolve();
                }
            };

            let callbackReturn = callBack(to, from, next);
            let callbackCall = Promise.resolve(callbackReturn);

            //无next调用
            if (callBack.length <= 2) {
                callbackCall.then(next);
            }

            callbackCall.catch((err) => reject(err));
        });
}

export function transformParams(
    params: RouteParamsRaw | undefined,
    fn: (v: RouteParamsValueRaw) => string
): RouteParams {
    let result: RouteParams = {};

    for (let key in params) {
        let value = params[key];

        result[key] = Array.isArray(value) ? value.map(fn) : fn(value);
    }

    return result;
}

export function isSameRouteLocation(a: RouteLocation, b: RouteLocation): boolean {
    let aLastIndex = a.matched.length - 1;
    let bLastIndex = b.matched.length - 1;

    return (
        aLastIndex > -1 &&
        aLastIndex === bLastIndex &&
        a.matched[aLastIndex] === b.matched[bLastIndex] &&
        a.hash === b.hash &&
        isSameRouteLocationParams(a.params, b.params) &&
        stringifyQuery(a.query) === stringifyQuery(b.query)
    );
}

export function isSameRouteLocationParams(a: RouteParams, b: RouteParams): boolean {
    if (Object.keys(a).length !== Object.keys(b).length) return false;

    for (let key in a) {
        if (isEqualArray(a[key], b[key]) === false) return false;
    }

    return true;
}

function isEqualArray<T>(a: T[] | T, b: T[] | T): boolean {
    let aArray = [a].flat();
    let bArray = [b].flat();
    return aArray.length === bArray.length && aArray.every((value, i) => value === bArray[i]);
}
