import { isEmptyStr } from "@joker.front/shared";

export type PathParams = Record<string, string | string[]>;

export interface PathParser {
    regexp: RegExp;

    score: Array<number[]>;

    keys: PathParserParamKey[];

    parse(path: string): PathParams | undefined;

    stringify(params: PathParams): string;
}

export function parserPath(path: string): PathParser {
    let tokens = analysisPathToTokens(path);

    return tokensToParser(tokens);
}

export function tokensToParser(tokens: Array<Token[]>): PathParser {
    let score: Array<number[]> = [];
    let pattern = "^";
    let keys: PathParserParamKey[] = [];

    for (let part of tokens) {
        let tokenScores: number[] = part.length ? [] : [PathScore.ROOT];

        for (let tokenIndex = 0; tokenIndex < part.length; tokenIndex++) {
            let token = part[tokenIndex];

            let subTokenScore: number = PathScore.TOKEN;

            if (token.type === TokenType.Static) {
                if (tokenIndex === 0) {
                    pattern += "/";
                }

                pattern += token.value.replace(/[.+*?^${}()[\]/\\]/g, "\\$&");
                subTokenScore += PathScore.STATIC;
            } else {
                keys.push({
                    name: token.value,
                    repeatable: token.repeatable,
                    optional: token.optional
                });

                let re = token.regexp || "[^/]+?";

                if (re !== "[^/]+?") {
                    subTokenScore += PathScore.CUSTOM_REGEXP;

                    try {
                        new RegExp(`(${re})`);
                    } catch (e: any) {
                        throw new Error(
                            `${token.value} -> ${re} The route regex parameter is not a valid regular expression. Please check.`
                        );
                    }
                }

                let subPattern = token.repeatable ? `((?:${re})(?:/(?:${re}))*)` : `(${re})`;

                if (tokenIndex === 0) {
                    subPattern = token.optional && part.length < 2 ? `(?:/${subPattern})` : "/" + subPattern;
                }

                if (token.optional) {
                    subPattern += "?";
                }

                pattern += subPattern;

                subTokenScore += PathScore.DYNAMIC;
                if (token.optional) subTokenScore += PathScore.OPTIONAL;
                if (token.repeatable) subTokenScore += PathScore.REPEATABLE;
                if (re === ".*") subTokenScore += PathScore.WILD_CARD;
            }

            tokenScores.push(subTokenScore);
        }

        score.push(tokenScores);
    }

    pattern += "/?$";

    let regexp = new RegExp(pattern, "i");

    function parse(path: string): PathParams | undefined {
        let match = path.match(regexp);
        let params: PathParams = {};

        //return undefind 区分一个有无被匹配
        if (!match) return;

        for (let i = 1; i < match.length; i++) {
            let value = match[i] || "";
            let key = keys[i - 1];

            params[key.name] = value && key.repeatable ? value.split("/") : value;
        }

        return params;
    }

    function stringify(params: PathParams): string {
        let result = "";

        let hasEnd = false;

        for (let part of tokens) {
            if (!hasEnd || result.endsWith("/") === false) result += "/";

            hasEnd = false;

            for (let token of part) {
                if (token.type === TokenType.Static) {
                    result += token.value;
                } else {
                    let param: string | readonly string[] = token.value in params ? params[token.value] : "";

                    if (Array.isArray(param) && token.repeatable === false) {
                        throw new Error(
                            `${token.value} is an array. Therefore, you cannot use '*' or '+' for repeated configuration.`
                        );
                    }

                    let text: string = Array.isArray(param) ? param.join("/") : (param as string);

                    if (isEmptyStr(text)) {
                        if (token.optional) {
                            if (part.length < 2) {
                                //例如：/:a?-home 这种要去掉/
                                if (result.endsWith("/")) result = result.slice(0, -1);
                                else {
                                    hasEnd = true;
                                }
                            }
                        } else {
                            throw new Error(
                                `${token.value} has no optional parameters configured, but no value was provided.`
                            );
                        }
                    }

                    result += text;
                }
            }
        }

        return result || "/";
    }

    return {
        regexp,
        score,
        keys,
        parse,
        stringify
    };
}

interface PathParserParamKey {
    name: string;
    repeatable: boolean;
    optional: boolean;
}

//#region 匹配分数
const enum PathScore {
    ROOT = 90, // 只有/
    TOKEN = 40, //一个Token
    SUB_TOKEN = 30, //多个Token组合
    STATIC = 40, //静态  /home
    DYNAMIC = 20, //动态 /:id
    CUSTOM_REGEXP = 10, //正则 /:id(\\d+)
    WILD_CARD = -40 - CUSTOM_REGEXP, //通配符 :id(.*)
    REPEATABLE = -20, //重复 /:id+ /:id*
    OPTIONAL = -8 //可配置 /:id? /:id*
}

export function comparePathParserScore(a: PathParser, b: PathParser): number {
    let i = 0;

    let aScore = a.score;
    let bScore = b.score;

    while (i < aScore.length && i < bScore.length) {
        let diff = compareSourceArray(aScore[i], bScore[i]);

        if (diff) return diff;

        i++;
    }

    //如果只差一位，则判断结尾是否时*匹配
    if (Math.abs(bScore.length - aScore.length) === 1) {
        if (isLastScoreNegative(aScore)) return 1;
        if (isLastScoreNegative(bScore)) return -1;
    }

    return bScore.length - a.score.length;
}

function compareSourceArray(a: number[], b: number[]): number {
    let i = 0;

    //只比对相同的长度，只要有差异就算差异分值
    while (i < a.length && i < b.length) {
        let diff = b[i] - a[i];

        if (diff) return diff;

        i++;
    }

    //如果两者最短长度的值无差异，则比对多者的一位分值
    if (a.length < b.length) {
        return a.length === 1 && a[0] === PathScore.STATIC + PathScore.TOKEN ? -1 : 1;
    } else if (a.length > b.length) {
        return b.length === 1 && b[0] === PathScore.STATIC + PathScore.TOKEN ? 1 : -1;
    }

    //完全一致则按照无差值返回
    return 0;
}

//最后一位不是通配
function isLastScoreNegative(score: PathParser["score"]): boolean {
    let last = score[score.length - 1];
    // WILD_CARD = -40 - CUSTOM_REGEXP, //通配符 :id(.*)
    // REPEATABLE = -20, //重复 /:id+ /:id*
    // OPTIONAL = -8 //可配置 /:id? /:id*
    return score.length > 0 && last[last.length - 1] < 0;
}

//#endregion

//#region  地址解析成tokens
export const enum TokenType {
    Static,
    Param
}

const enum TokenState {
    Static,
    Param,
    ParamRegExp,
    ParamRegExpEnd,
    EscapeNext
}

interface TokenStatic {
    type: TokenType.Static;

    value: string;
}

interface TokenParam {
    type: TokenType.Param;

    regexp?: string;

    value: string;

    optional: boolean;

    repeatable: boolean;
}

export type Token = TokenStatic | TokenParam;

const ROOT_PATH: Token = {
    type: TokenType.Static,
    value: ""
};

export function analysisPathToTokens(path: string): Array<Token[]> {
    if (isEmptyStr(path)) return [[]];

    if (path === "/") return [[ROOT_PATH]];

    if (path.startsWith("/") === false) {
        throw new Error(`The 'path' property of a route must start with '/': "${path}" => "/${path}"`);
    }

    let state: TokenState = TokenState.Static;
    let prevState: TokenState = state;

    let result: Array<Token[]> = [];
    //该值会在第一次/ appendPart时被初始化
    let partPath: Token[] | undefined;
    let buffer = "";
    let char = "";
    let customRe: string = "";

    function error(message: string): never {
        throw new Error(`Route address parsing error: ${state}/"${buffer}": ${message}`);
    }

    function appendBuffer() {
        if (!buffer) return;

        switch (state) {
            case TokenState.Static:
                partPath?.push({
                    type: TokenType.Static,
                    value: buffer
                });
                break;
            case TokenState.Param:
            case TokenState.ParamRegExp:
            case TokenState.ParamRegExpEnd:
                if (partPath!.length > 1 && (char === "*" || char === "+")) {
                    error(`The repeatable attribute ${buffer} can only appear once`);
                }

                partPath?.push({
                    type: TokenType.Param,
                    value: buffer,
                    regexp: customRe,
                    repeatable: char === "*" || char === "+",
                    optional: char === "*" || char === "?"
                });
                break;
            default:
                error(`Invalid address parsing`);
        }

        buffer = "";
    }

    function appendPart() {
        if (partPath) {
            result.push(partPath);
        }

        partPath = [];
    }

    function appendCharToBuffer() {
        buffer += char;
    }

    let index = 0;

    while (index < path.length) {
        char = path.charAt(index++);

        if (char === "\\" && state !== TokenState.ParamRegExp) {
            prevState = state;
            state = TokenState.EscapeNext;
            continue;
        }

        switch (state) {
            case TokenState.Static:
                if (char === "/") {
                    if (buffer) {
                        appendBuffer();
                    }
                    appendPart();
                } else if (char === ":") {
                    appendBuffer();
                    state = TokenState.Param;
                } else {
                    appendCharToBuffer();
                }
                break;
            case TokenState.EscapeNext:
                appendCharToBuffer();
                state = prevState;
                break;
            case TokenState.Param:
                if (char === "(") {
                    state = TokenState.ParamRegExp;
                } else if (/[a-zA-Z0-9_]/.test(char)) {
                    appendCharToBuffer();
                } else {
                    appendBuffer();
                    state = TokenState.Static;

                    if (char !== "*" && char !== "?" && char !== "+") index--;
                }
                break;
            case TokenState.ParamRegExp:
                if (char === ")") {
                    if (customRe.endsWith("\\")) {
                        customRe = customRe.slice(0, -1) + char;
                    } else {
                        state = TokenState.ParamRegExpEnd;
                    }
                } else {
                    customRe += char;
                }
                break;
            case TokenState.ParamRegExpEnd:
                appendBuffer();
                state = TokenState.Static;

                if (char !== "*" && char !== "?" && char !== "+") index--;

                customRe = "";
                break;
            default:
                error(`Invalid address parsing`);
        }
    }

    if (state === TokenState.ParamRegExp) {
        error(`Unclosed regular expression detected. Please ensure all parentheses "()" are properly closed.`);
    }

    appendBuffer();
    appendPart();

    return result;
}

//#endregion
