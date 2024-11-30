import App from "./App.joker";
import { Router } from "@joker.front/router";
import aTop from "./views/a-top.joker";
import aFoot from "./views/a-foot.joker";
import bTop from "./views/b-top.joker";

new Router({
    routes: [
        {
            path: "/",
            components: {
                top: aTop,
                foot: aFoot
            }
        },
        {
            path: "/b",
            components: {
                top: bTop
            }
        }
    ]
});

new App().$mount(document.getElementById("app"));
