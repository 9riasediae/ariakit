import { createComponent, createElement, createHook } from "../utils/system.js";
import type { As, Options, Props } from "../utils/types.js";

/**
 * Returns props to create a `VisuallyHidden` component. When applying the props
 * returned by this hook to a component, the component will be visually hidden,
 * but still accessible to screen readers.
 * @see https://ariakit.org/components/visually-hidden
 * @example
 * ```jsx
 * const props = useVisuallyHidden();
 * <a href="#">
 *   Learn more<Role {...props}> about the Solar System</Role>.
 * </a>
 * ```
 */
export const useVisuallyHidden = createHook<VisuallyHiddenOptions>((props) => {
  props = {
    ...props,
    style: {
      border: 0,
      clip: "rect(0 0 0 0)",
      height: "1px",
      margin: "-1px",
      overflow: "hidden",
      padding: 0,
      position: "absolute",
      whiteSpace: "nowrap",
      width: "1px",
      ...props.style,
    },
  };
  return props;
});

/**
 * Renders an element that's visually hidden, but still accessible to screen
 * readers.
 * @see https://ariakit.org/components/visually-hidden
 * @example
 * ```jsx
 * <a href="#">
 *   Learn more<VisuallyHidden> about the Solar System</VisuallyHidden>.
 * </a>
 * ```
 */
export const VisuallyHidden = createComponent<VisuallyHiddenOptions>(
  (props) => {
    const htmlProps = useVisuallyHidden(props);
    return createElement("span", htmlProps);
  }
);

if (process.env.NODE_ENV !== "production") {
  VisuallyHidden.displayName = "VisuallyHidden";
}

export type VisuallyHiddenOptions<T extends As = "span"> = Options<T>;

export type VisuallyHiddenProps<T extends As = "span"> = Props<
  VisuallyHiddenOptions<T>
>;
