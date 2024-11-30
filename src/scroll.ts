export type ScrollPosition = {
    left?: number;
    top?: number;
    el?: Element;
};

export function getCurrentScrollPosition() {
    return {
        left: window.scrollX,
        top: window.scrollY
    };
}

export const scrollPositionMap = new Map<string, ScrollPosition>();

export function saveScrollPosition(key: string, position: ScrollPosition) {
    scrollPositionMap.set(key, position);
}

export function getSavedScrollPosition(key: string) {
    let position = scrollPositionMap.get(key);

    scrollPositionMap.delete(key);

    return position;
}

export function getScrollKey(path: string, delta: number): string {
    return (history.state ? history.state.position - delta : -1) + path;
}

export function scrollToPosition(position: ScrollPosition): void {
    let scrollPosition: ScrollPosition;
    if (position.el) {
        scrollPosition = getElementPosition(position.el, position);
    } else {
        scrollPosition = position;
    }

    if ("scrollBehavior" in document.documentElement.style) {
        window.scrollTo(scrollPosition);
    } else {
        window.scrollTo(scrollPosition.left ?? window.pageXOffset, scrollPosition.top ?? window.pageYOffset);
    }
}

function getElementPosition(el: Element, offset: ScrollPosition): ScrollPosition {
    let docRect = document.documentElement.getBoundingClientRect();
    let elRect = el.getBoundingClientRect();

    return {
        left: elRect.left - docRect.left - (offset.left || 0),
        top: elRect.top - docRect.top - (offset.top || 0)
    };
}
