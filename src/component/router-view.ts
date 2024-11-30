import {
    Component,
    createComponent,
    JOKER_COMPONENT_TAG,
    observer,
    registerGlobalComponent,
    VNode
} from "@joker.front/core";
import { LOGTAG } from "../config";
import { getCurrentRoute, router } from "../router";
import { RouteLocation, RouteRecord, KeepAlive, RouteRecordComponent, RouteProps } from "../type";
import { logger, toLowerCase } from "@joker.front/shared";

export type RouterViewUpdatedEventData = {
    /** 当前视图容器层级(嵌套层级) */
    deep: number;
    /**是否是叶子节点 */
    isLeaf: boolean;
    /** 是否保持状态 */
    keepAlive: boolean;
    /** 装载的组件实例 */
    component?: Component;
    /** 当前路由信息 */
    currentRoute: RouteLocation;
    /** 路由记录 */
    routeRecord?: RouteRecord;
};
export class RouterView extends Component<{ [key: string]: any; name: string }> {
    public routeViewDeep: number = 0;

    public record?: RouteRecord;

    //挂载空，创建parent vnode树，需要判断层级
    template = [];

    propsOption = {
        name: "default"
    };
    private propsVaule: any;
    created() {
        this.initProps();
    }

    initProps() {
        let propsData: Record<string, any> = {};

        if (!this.props.props) {
            Object.keys(this.props).forEach((p) => {
                //过滤
                if (this.filterProps(p) === false) return;

                propsData[p] = this.props[p];

                //单项数据同步
                this.$watch(
                    () => this.props[p],
                    () => {
                        this.propsVaule[p] = this.props[p];
                    }
                );
            });

            this.propsVaule = observer(propsData);
        }
    }

    filterProps(p: string) {
        //过滤
        if (typeof p !== "string") return false;

        let pName = toLowerCase(p);
        if (pName === "transition-name" || pName === "name" || pName === "keep-alive" || pName === "ref") return false;
    }

    mounted() {
        this.$watch(
            () => router.route.value,
            (to: RouteLocation, from: RouteLocation) => {
                /**
                 * 使用微任务等待
                 *
                 * 当我们遇到route-view嵌套时，当主容器被卸载时，
                 * 应该避免子route-view的渲染。
                 */
                Promise.resolve().then(async () => {
                    //没有record 等待mounted首次
                    if (this.$root) {
                        this.loadRouteComponent(to, to.fullPath === from.fullPath);
                    }
                });
            }
        );

        this.routeViewDeep = this.getRouteViewDeep();

        //未完成路由首次跳转，则不触发默认加载
        if (router?.route.isChanged) {
            this.loadRouteComponent(getCurrentRoute());
        }
    }

    private loadRouteComponent(routeLocation: RouteLocation, force?: boolean) {
        let newRouteRecod = routeLocation.matched[this.routeViewDeep];

        //两条记录不一致 && 非强制刷新（已挂载有值）
        if (this.record?.parserPath === newRouteRecod?.parserPath && !force) return;

        this.record = newRouteRecod;

        //多route-view， 根据name装载
        let viewComponent = this.record?.components?.[this.props.name!];

        let props = newRouteRecod?.props[this.props.name!];

        if (typeof props === "function") {
            props = props(routeLocation);
        }

        for (let name in props) {
            //@ts-ignore
            this.propsVaule[name] = props[name];
        }

        return this.mountedComponent(viewComponent, this.record?.keepalive);
    }

    private async mountedComponent(viewComponent: RouteRecordComponent | undefined, _keepAlive?: KeepAlive) {
        let component: Component | undefined = undefined;
        let keepAlive = _keepAlive === true || _keepAlive === "once";

        if (viewComponent) {
            if (viewComponent.instance) {
                viewComponent.wakeCount ??= 0;
                viewComponent.wakeCount++;

                component = viewComponent.instance;
            }

            //无缓存
            if (component === undefined) {
                //清空，以防止嵌套容器的穿透加载
                this.$render([]);

                if (JOKER_COMPONENT_TAG in viewComponent.component) {
                    component = new viewComponent.component(this.propsVaule, this.$sections, keepAlive);
                } else {
                    component = new (await viewComponent.component()).default(
                        this.propsVaule,
                        this.$sections,
                        keepAlive
                    );
                }
            }

            //重新渲染
            //所有渲染都采用keepalive，是否销毁，由下面逻辑处理
            this.$render([createComponent(component)], true);

            //缓存挂载
            if (keepAlive) {
                //once 缓存处理
                if (
                    viewComponent.instance &&
                    viewComponent.wakeCount &&
                    viewComponent.wakeCount >= 1 &&
                    _keepAlive === "once"
                ) {
                    viewComponent.instance.isSleeped = false;
                    viewComponent.instance = undefined;
                    viewComponent.wakeCount = undefined;
                } else {
                    viewComponent.instance = component;
                }
            }
        } else {
            logger.info(LOGTAG, `当前路由中router-view name=${this.props.name}为找到要渲染的组件,执行空渲染`);
        }

        let currentRoute = getCurrentRoute();

        let eventData: RouterViewUpdatedEventData = {
            deep: this.routeViewDeep,
            isLeaf: this.routeViewDeep === currentRoute.matched.length - 1,
            keepAlive,
            component,
            currentRoute,
            routeRecord: this.record
        };

        this.$trigger("updated", eventData);
    }

    private getRouteViewDeep() {
        //只在挂在时，确认一次深度即可
        let index = 0;

        //跳出component装载容器
        let node: VNode.Node | undefined = this.$rootVNode?.parent?.parent;

        while (node) {
            //节点是组件 && 存在组件挂载 && 组件是root-view  ==》 则算一个层级
            if (node instanceof VNode.Component && node.component && node.component instanceof RouterView) {
                index++;
            }

            node = node.parent;
        }

        return index;
    }
}

registerGlobalComponent({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "router-view": RouterView
});
