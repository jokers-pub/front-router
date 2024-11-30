import App from "./App.joker";
import { Router } from "@joker.front/router";
import a from "./views/a.joker";
import b from "./views/b.joker";

new Router({
    routes: [
        {
            path: "/",
            component: a
        },
        {
            path: "/b",
            component: b,
            keepalive: true
        },
        {
            path: "/c/:id",
            component: () => import("./views/c.joker")
        }
    ]
});

new App().$mount(document.getElementById("app"));
