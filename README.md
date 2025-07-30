# Joker Router ![NPM Version](https://img.shields.io/npm/v/%40joker.front%2Frouter)

`@joker.front/router` serves as the core routing component within the Joker front-end framework. It plays a crucial role in handling the navigation and URL management of web applications.

## How To Use

To utilize the `@joker.front/router` in your application, you can follow these steps:

```ts
import { Router } from "@joker.front/router";

// Create a new instance of the Router and configure it with necessary options
new Router({
    // Set the logger level. In this case, it is set to "info", which can be used to log routing-related information at an appropriate level for debugging and monitoring purposes.
    loggerLeve: "info",
    // Define the route configurations. Each route object contains properties such as 'path' and 'component'.
    // The 'path' specifies the URL path, and 'component' indicates the corresponding component to be rendered when that path is accessed.
    // Here, we have a root route ("/") that redirects to "/a". The "/a" route has its own component 'a' and can have child routes.
    // The child routes of "/a" are defined within the 'children' array. For example, an empty path "" within the children of "/a" maps to the component 'a1', and the path "a2" maps to the component 'a2'.
    routes: [
        { path: "/", redirect: "/a" },
        {
            path: "/a",
            component: a,
            children: [
                { path: "", component: a1 },
                { path: "a2", component: a2 }
            ]
        }
    ]
});
```

Within a component, you can access and manipulate routing information by reading the `router` property:

```ts
import { router } from "@joker.front/router";

export default class extends Component {
    test() {
        // Navigate to a new route. In this example, it redirects to the route with the path "b".
        // This is useful when you want to perform a programmatic navigation, such as after a certain action or condition is met.
        router.push({
            path: "b"
        });

        // Go back to the previous route. This mimics the behavior of the browser's back button and can be used to provide a seamless user experience when navigating back in the application's history.
        router.back();

        // Retrieve the current route information. The 'value' property holds the details of the currently active route, which can be used for various purposes, such as conditional rendering or performing actions based on the current route.
        router.route.value;
    }
}
```

## Documentation

[Help Docs](https://front.jokers.pub/router/introduction)

[Visual Coding IDE](https://jokers.pub)
