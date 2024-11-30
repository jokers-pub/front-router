import {
    analysisPathToTokens,
    parserPath,
    PathParams,
    Token,
    tokensToParser,
    TokenType
} from "../src/matcher/parsePath";

describe("地址解析", () => {
    describe("解析地址TOKEN", () => {
        it("基础", () => {
            //根
            expect(analysisPathToTokens("/")).toEqual([[{ type: TokenType.Static, value: "" }]]);
            //空
            expect(analysisPathToTokens("")).toEqual([[]]);
        });

        it("正常", () => {
            //单级
            expect(analysisPathToTokens("/home")).toEqual([[{ type: TokenType.Static, value: "home" }]]);
            //多级
            expect(analysisPathToTokens("/one/two/three")).toEqual([
                [{ type: TokenType.Static, value: "one" }],
                [{ type: TokenType.Static, value: "two" }],
                [{ type: TokenType.Static, value: "three" }]
            ]);
        });

        it("动态", () => {
            //参数
            expect(analysisPathToTokens("/:id")).toEqual([
                [
                    {
                        type: TokenType.Param,
                        value: "id",
                        regexp: "",
                        repeatable: false,
                        optional: false
                    }
                ]
            ]);

            //正则参数
            expect(analysisPathToTokens("/:id(\\d+)")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: false }]
            ]);

            //组合
            expect(analysisPathToTokens("/:id(\\d+)hello")).toEqual([
                [
                    { type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: false },
                    { type: TokenType.Static, value: "hello" }
                ]
            ]);

            //参数+路由
            expect(analysisPathToTokens("/:id(\\d+)/hello")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: false }],
                [{ type: TokenType.Static, value: "hello" }]
            ]);

            //参数+路由
            expect(analysisPathToTokens("/:id(\\d+)/hello")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: false }],
                [{ type: TokenType.Static, value: "hello" }]
            ]);

            //参数+路由(参数)
            expect(analysisPathToTokens("/:id(\\d+)/:hello")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: false }],
                [{ type: TokenType.Param, value: "hello", regexp: "", repeatable: false, optional: false }]
            ]);

            //参数（可选）
            expect(analysisPathToTokens("/:id?")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "", repeatable: false, optional: true }]
            ]);
            expect(analysisPathToTokens("/:id(\\d+)?")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: true }]
            ]);

            //参数（可选）字符组合
            expect(analysisPathToTokens("/:id(\\d+)?hello")).toEqual([
                [
                    { type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: true },
                    { type: TokenType.Static, value: "hello" }
                ]
            ]);

            //参数（可选）/二级路由
            expect(analysisPathToTokens("/:id(\\d+)?/hello")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: true }],
                [{ type: TokenType.Static, value: "hello" }]
            ]);

            //重复
            expect(analysisPathToTokens("/:id+")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "", repeatable: true, optional: false }]
            ]);

            //重复+可选
            expect(analysisPathToTokens("/:id*")).toEqual([
                [{ type: TokenType.Param, value: "id", regexp: "", repeatable: true, optional: true }]
            ]);

            //一级多参
            expect(analysisPathToTokens("/:one:two:three")).toEqual([
                [
                    { type: TokenType.Param, value: "one", regexp: "", repeatable: false, optional: false },
                    { type: TokenType.Param, value: "two", regexp: "", repeatable: false, optional: false },
                    { type: TokenType.Param, value: "three", regexp: "", repeatable: false, optional: false }
                ]
            ]);
            //一级多参数+特殊复合
            expect(analysisPathToTokens("/:one-:two")).toEqual([
                [
                    { type: TokenType.Param, value: "one", regexp: "", repeatable: false, optional: false },
                    { type: TokenType.Static, value: "-" },
                    { type: TokenType.Param, value: "two", regexp: "", repeatable: false, optional: false }
                ]
            ]);
        });

        it("异常", () => {
            //必须以‘/’开头
            expect(() => analysisPathToTokens("aaa")).toThrowError("路由的path属性必须是以");
            //缺失参数
            expect(analysisPathToTokens(`/\\:`)).toEqual([[{ type: TokenType.Static, value: ":" }]]);
        });
    });

    describe("解析Tokens", () => {
        function checkRegExp(tokens: Array<Token[]>, regexp: string) {
            let parser = tokensToParser(tokens);

            expect(
                parser.regexp
                    .toString()
                    //去除结尾/i
                    .replace(/(:?^\/|\/\w*$)/g, "")
                    //“\\”="/"
                    .replace(/\\\//g, "/")
            ).toEqual(regexp);
        }

        it("空 root", () => {
            checkRegExp([[]], "^/?$");
            checkRegExp([[{ type: TokenType.Static, value: "" }]], "^//?$");
        });

        it("static token 关键字 -》 string", () => {
            checkRegExp(
                [[{ type: TokenType.Static, value: "foo+$[(a|a)].*?" }]],
                "^/foo\\+\\$\\[\\(a|a\\)\\]\\.\\*\\?/?$"
            );
        });

        it("参数正则 static 无混淆", () => {
            checkRegExp(
                [
                    [
                        { type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: false },
                        { type: TokenType.Static, value: "{2}" }
                    ]
                ],
                "^/(\\d+)\\{2\\}/?$"
            );
        });

        it("static", () => {
            checkRegExp([[{ type: TokenType.Static, value: "home" }]], "^/home/?$");
            checkRegExp(
                [[{ type: TokenType.Static, value: "one" }], [{ type: TokenType.Static, value: "two" }]],
                "^/one/two/?$"
            );
        });

        it("无约束参数", () => {
            checkRegExp(
                [[{ type: TokenType.Param, value: "id", repeatable: false, optional: false }]],
                "^/([^/]+?)/?$"
            );
            checkRegExp(
                [
                    [{ type: TokenType.Param, value: "one", repeatable: false, optional: false }],
                    [{ type: TokenType.Param, value: "two", repeatable: false, optional: false }]
                ],
                "^/([^/]+?)/([^/]+?)/?$"
            );
        });

        it("重复", () => {
            checkRegExp(
                [[{ type: TokenType.Param, value: "id", repeatable: true, optional: false }]],
                "^/((?:[^/]+?)(?:/(?:[^/]+?))*)/?$"
            );
            checkRegExp(
                [[{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: true, optional: false }]],
                "^/((?:\\d+)(?:/(?:\\d+))*)/?$"
            );
            checkRegExp(
                [
                    [{ type: TokenType.Static, value: "aa" }],
                    [{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: true, optional: false }]
                ],
                "^/aa/((?:\\d+)(?:/(?:\\d+))*)/?$"
            );
            checkRegExp(
                [
                    [
                        { type: TokenType.Static, value: "aa" },
                        { type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: true, optional: false }
                    ]
                ],
                "^/aa((?:\\d+)(?:/(?:\\d+))*)/?$"
            );
        });

        it("可选", () => {
            checkRegExp(
                [[{ type: TokenType.Param, value: "id", repeatable: false, optional: true }]],
                "^(?:/([^/]+?))?/?$"
            );
            checkRegExp(
                [[{ type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: false, optional: true }]],
                "^(?:/(\\d+))?/?$"
            );
        });

        it("all", () => {
            checkRegExp(
                [
                    [
                        { type: TokenType.Static, value: "aa" },
                        { type: TokenType.Param, value: "id", regexp: "\\d+", repeatable: true, optional: true }
                    ]
                ],
                "^/aa((?:\\d+)(?:/(?:\\d+))*)?/?$"
            );
        });
    });

    describe("解析参数", () => {
        function checkParams(root: string, realPath: string, params: PathParams | undefined) {
            let parser = parserPath(root);

            expect(parser.parse(realPath)).toEqual(params);
        }

        it("无参数", () => {
            checkParams("/home", "/", undefined);
            checkParams("/home", "/home/", {});
            checkParams("/home", "/hOmE/", {});
            checkParams("/one/two", "/one/two/", {});
            checkParams("/two", "/one/two/", undefined);
        });

        it("正常参数", () => {
            checkParams("/home/:id", "/home/a", { id: "a" });
            checkParams("/home/:id", "/home/a/b/c", undefined);
            checkParams("/home/:id", "/home", undefined);
            checkParams("/home/:id?", "/home", { id: "" });
            checkParams("/home/:id?", "/home/", { id: "" });
            checkParams("/home/:id*", "/home", { id: "" });
            checkParams("/home/:id+", "/home/a/b/c", { id: ["a", "b", "c"] });
            checkParams("/home/:id*", "/home/a/b/c", { id: ["a", "b", "c"] });
        });

        it("单级后置参数", () => {
            checkParams("/home-:id", "/home-a", { id: "a" });
            checkParams("/home-:id", "/home-abcd", { id: "abcd" });
            checkParams("/home-:id", "/home-abcd/", { id: "abcd" });
            checkParams("/home-:id+", "/home-abcd", { id: ["abcd"] });
        });

        it("二级前置参数", () => {
            checkParams("/home/:id-b", "/home/-b", undefined);
            checkParams("/home/:id?-b", "/home/-b", { id: "" });
            checkParams("/home/:id?-b", "/home/a-b", { id: "a" });
            checkParams("/home/:id+-b", "/home/abc-b-b", { id: ["abc-b"] });
        });

        it("正则约束参数", () => {
            checkParams("/home/:id([0-9]{2})b", "/home/12b", { id: "12" });
            checkParams("/home/:id([0-9]{2})b", "/home/123b", undefined);
            checkParams("/home/:id(\\d+)b", "/home/123b", { id: "123" });
            checkParams("/home/:id(\\d+)+b", "/home/123+b", undefined);
            checkParams("/home/:id(\\d+)+b", "/home/123b", { id: ["123"] });
            checkParams("/home/:id(\\d+)+", "/home/1/2/3", { id: ["1", "2", "3"] });
            checkParams("/home/:id(\\d+)+", "/home/1/2/3/c", undefined);
        });
    });

    describe("反译字符", () => {
        function checkUrl(router: string, params: PathParams, realPath: string) {
            let parser = parserPath(router);

            expect(parser.stringify(params)).toEqual(realPath);
        }

        it("静态", () => {
            checkUrl("/home", {}, "/home");
            checkUrl("/home/", {}, "/home/");
        });

        it("参数", () => {
            checkUrl("/:id", { id: "home" }, "/home");
            checkUrl("/:a-:b", { a: "home", b: "two" }, "/home-two");
            checkUrl("/:a(\\d+)-:b", { a: "1", b: "two" }, "/1-two");
        });

        it("特殊场景", () => {
            checkUrl("/:a+/c", { a: ["a", "b"] }, "/a/b/c");
            checkUrl("/:a?/b", { a: "" }, "/b");
        });
    });
});
