import App from "./App.joker";
import a from "./views/a.joker";
import a1 from "./views/a1.joker";

import b from "./views/b.joker";
import { Router } from "@joker.front/router";

new Router({
    loggerLeve: "info",
    routes: [
        { path: "/", redirect: "/a" },
        {
            path: "/a",
            component: a,
            children: [
                { path: "", component: a1 },
                { path: "a2/:id", component: () => import("./views/a2.joker") }
            ]
        },
        {
            path: "/b",
            component: b
        }
    ]
});

new App().$mount(document.getElementById("app"));
