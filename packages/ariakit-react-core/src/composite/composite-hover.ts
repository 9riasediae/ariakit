import type { MouseEvent as ReactMouseEvent } from "react";
import { useContext } from "react";
import { closest, contains } from "@ariakit/core/utils/dom";
import { hasFocus, hasFocusWithin } from "@ariakit/core/utils/focus";
import { invariant } from "@ariakit/core/utils/misc";
import type { BooleanOrCallback } from "@ariakit/core/utils/types";
import { useBooleanEvent, useEvent, useIsMouseMoving } from "../utils/hooks.js";
import {
  createElement,
  createHook,
  createMemoComponent,
} from "../utils/system.js";
import type { As, Options, Props } from "../utils/types.js";
import { CompositeContext } from "./composite-context.js";
import type { CompositeStore } from "./composite-store.js";

function getMouseDestination(event: ReactMouseEvent<HTMLElement>) {
  const relatedTarget = event.relatedTarget as Node | null;
  if (relatedTarget?.nodeType === Node.ELEMENT_NODE) {
    return relatedTarget as Element;
  }
  return null;
}

function hoveringInside(event: ReactMouseEvent<HTMLElement>) {
  const nextElement = getMouseDestination(event);
  if (!nextElement) return false;
  return contains(event.currentTarget, nextElement);
}

function movingToAnotherItem(event: ReactMouseEvent<HTMLElement>) {
  const dest = getMouseDestination(event);
  if (!dest) return false;
  const item = closest(dest, "[data-composite-hover]");
  return !!item;
}

/**
 * Returns props to create a `CompositeHover` component. The composite item that
 * receives these props will get focused on mouse move and lose focus to the
 * composite base element on mouse leave. This should be combined with the
 * `CompositeItem` component, the `useCompositeItem` hook or any component/hook
 * that uses them underneath.
 * @see https://ariakit.org/components/composite
 * @example
 * ```jsx
 * const store = useCompositeStore();
 * const props = useCompositeHover({ store });
 * <CompositeItem store={store} {...props}>Item</CompositeItem>
 * ```
 */
export const useCompositeHover = createHook<CompositeHoverOptions>(
  ({ store, focusOnHover = true, ...props }) => {
    const context = useContext(CompositeContext);
    store = store || context;

    invariant(
      store,
      process.env.NODE_ENV !== "production" &&
        "CompositeHover must be wrapped in a Composite component"
    );

    const isMouseMoving = useIsMouseMoving();

    const onMouseMoveProp = props.onMouseMove;
    const focusOnHoverProp = useBooleanEvent(focusOnHover);

    const onMouseMove = useEvent((event: ReactMouseEvent<HTMLDivElement>) => {
      onMouseMoveProp?.(event);
      if (event.defaultPrevented) return;
      if (!isMouseMoving()) return;
      if (!focusOnHoverProp(event)) return;
      // If we're hovering over an item that doesn't have DOM focus, we move
      // focus to the composite element. We're doing this here before setting
      // the active id because the composite element will automatically set the
      // active id to null when it receives focus.
      if (!hasFocusWithin(event.currentTarget)) {
        const baseElement = store?.getState().baseElement;
        if (baseElement && !hasFocus(baseElement)) {
          baseElement.focus();
        }
      }
      store?.setActiveId(event.currentTarget.id);
    });

    const onMouseLeaveProp = props.onMouseLeave;

    const onMouseLeave = useEvent((event: ReactMouseEvent<HTMLDivElement>) => {
      onMouseLeaveProp?.(event);
      if (event.defaultPrevented) return;
      if (!isMouseMoving()) return;
      if (hoveringInside(event)) return;
      if (movingToAnotherItem(event)) return;
      if (!focusOnHoverProp(event)) return;
      store?.setActiveId(null);
      // Move focus to the composite element.
      store?.getState().baseElement?.focus();
    });

    props = {
      "data-composite-hover": "",
      ...props,
      onMouseMove,
      onMouseLeave,
    };

    return props;
  }
);

/**
 * Renders an element in a composite widget that receives focus on mouse move
 * and loses focus to the composite base element on mouse leave. This should be
 * combined with the `CompositeItem` component, the `useCompositeItem` hook or
 * any component/hook that uses them underneath.
 * @see https://ariakit.org/components/composite
 * @example
 * ```jsx
 * const composite = useCompositeStore();
 * <Composite store={composite}>
 *   <CompositeHover render={<CompositeItem />}>Item</CompositeHover>
 * </Composite>
 * ```
 */
export const CompositeHover = createMemoComponent<CompositeHoverOptions>(
  (props) => {
    const htmlProps = useCompositeHover(props);
    return createElement("div", htmlProps);
  }
);

if (process.env.NODE_ENV !== "production") {
  CompositeHover.displayName = "CompositeHover";
}

export interface CompositeHoverOptions<T extends As = "div">
  extends Options<T> {
  /**
   * Object returned by the `useCompositeStore` hook. If not provided, the
   * parent `Composite` component's context will be used.
   */
  store?: CompositeStore;
  /**
   * Whether to focus the composite item on hover.
   *
   * Live examples:
   * - [Textarea with inline
   *   Combobox](https://ariakit.org/examples/combobox-textarea)
   * @default true
   */
  focusOnHover?: BooleanOrCallback<ReactMouseEvent<HTMLElement>>;
}

export type CompositeHoverProps<T extends As = "div"> = Props<
  CompositeHoverOptions<T>
>;
