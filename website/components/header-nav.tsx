"use client";

import type { MouseEvent, ReactElement, ReactNode } from "react";
import {
  createContext,
  forwardRef,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cx, getKeys } from "@ariakit/core/utils/misc";
import { isApple } from "@ariakit/core/utils/platform";
import { PopoverDisclosureArrow, PopoverDismiss } from "@ariakit/react";
import { SelectRenderer } from "@ariakit/react-core/select/select-renderer";
import type { SelectRendererItem } from "@ariakit/react-core/select/select-renderer";
import { useEvent, useSafeLayoutEffect } from "@ariakit/react-core/utils/hooks";
import type {
  QueryFunctionContext,
  UseQueryOptions,
} from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { track } from "@vercel/analytics";
import type { PageContent } from "build-pages/contents.js";
import type { PageIndexDetail } from "build-pages/index.js";
import pageIndex from "build-pages/index.js";
import groupBy from "lodash/groupBy.js";
import { usePathname } from "next/navigation.js";
import { getPageIcon } from "utils/get-page-icon.jsx";
import { usePerceptibleValue } from "utils/use-perceptible-value.js";
import {
  HeaderMenu,
  HeaderMenuGroup,
  HeaderMenuItem,
  HeaderMenuSeparator,
} from "./header-menu.js";
import type { HeaderMenuItemProps } from "./header-menu.js";

type Data = Array<
  PageContent & {
    keywords: string[];
    score?: number;
    key?: string;
  }
>;

type SearchData = Array<Data[number] & { nested?: boolean }>;

const categoryTitles: Record<string, string> = {
  guide: "Guide",
  components: "Components",
  examples: "Examples",
  blog: "Blog",
  reference: "API Reference",
};

const searchTitles: Record<string, string> = {
  guide: "Search guide",
  components: "Search components",
  examples: "Search examples",
  blog: "Search blog",
  reference: "Search API",
};

function getCategoryTitle(categorySlug: string) {
  return categoryTitles[categorySlug] || "";
}

function getSearchParentPageData(items: Data): SearchData[number] | null {
  const parentPage = items?.find((item) => !item.section);
  if (parentPage) return parentPage;
  if (items.length <= 1) return null;
  const { category, slug } = items[0]!;
  if (!category) return null;
  if (!slug) return null;
  const page = pageIndex[category]?.find((item) => item.slug === slug);
  if (!page) return null;
  return {
    ...page,
    sectionId: null,
    category,
    section: null,
    keywords: [],
    parentSection: null,
  };
}

function parseSearchData(data: Data) {
  const dataBySlug = groupBy(data, "slug");
  const searchData: SearchData = [];
  const slugs = getKeys(dataBySlug);
  slugs.forEach((slug) => {
    const items = dataBySlug[slug];
    if (!items) return;
    const parentPage = getSearchParentPageData(items);
    if (parentPage) {
      searchData.push(parentPage);
    }
    const itemsWithoutParentPage = items.filter((item) => item !== parentPage);
    searchData.push(
      ...itemsWithoutParentPage
        .slice(0, parentPage ? 3 : undefined)
        .map((item) => ({ ...item, nested: !!parentPage }))
    );
  });
  return searchData;
}

function getItemKey(item: PageIndexDetail | SearchData[number]) {
  const category = "category" in item && item.category ? item.category : "";
  const section = "section" in item && item.section ? item.section : "";
  return category + item.slug + section;
}

function getItemHref(
  item: PageIndexDetail | SearchData[number],
  category = item.category
) {
  return `/${category}/${item.slug}${
    "sectionId" in item && item.sectionId ? `#${item.sectionId}` : ""
  }`;
}

function getAllIndexes(string: string, values: string[]) {
  const indexes = [] as Array<[number, number]>;
  for (const value of values) {
    let pos = 0;
    const length = value.length;
    while (string.indexOf(value, pos) != -1) {
      const index = string.indexOf(value, pos);
      if (index !== -1) {
        indexes.push([index, length]);
      }
      pos = index + 1;
    }
  }
  return indexes;
}

function highlightValue(
  itemValue: string | null | undefined,
  userValues: string[]
) {
  if (!itemValue) return itemValue;
  userValues = userValues.filter(Boolean);
  const parts: ReactElement[] = [];

  const wrap = (value: string, autocomplete = false) => (
    <span
      key={parts.length}
      data-autocomplete-value={autocomplete ? "" : undefined}
      data-user-value={autocomplete ? undefined : ""}
    >
      {value}
    </span>
  );

  const allIndexes = getAllIndexes(itemValue, userValues)
    .filter(
      ([index, length], i, arr) =>
        index !== -1 &&
        !arr.some(
          ([idx, l], j) => j !== i && idx <= index && idx + l >= index + length
        )
    )
    .sort(([a], [b]) => a - b);

  if (!allIndexes.length) {
    parts.push(wrap(itemValue, true));
    return parts;
  }

  const [firstIndex] = allIndexes[0]!;

  const values = [
    itemValue.slice(0, firstIndex),
    ...allIndexes
      .map(([index, length], i) => {
        const value = itemValue.slice(index, index + length);
        const nextIndex = allIndexes[i + 1]?.[0];
        const nextValue = itemValue.slice(index + length, nextIndex);
        return [value, nextValue];
      })
      .flat(),
  ];

  values.forEach((value, i) => {
    if (value) {
      parts.push(wrap(value, i % 2 === 0));
    }
  });
  return parts;
}

function queryFetch({ queryKey, signal }: QueryFunctionContext) {
  const [url] = queryKey as [string];
  return fetch(url, { signal }).then((response) => response.json());
}

function Shortcut() {
  const [platform, setPlatform] = useState<"mac" | "pc" | null>(null);
  useSafeLayoutEffect(() => {
    setPlatform(isApple() ? "mac" : "pc");
  }, []);
  if (!platform) return null;
  return (
    <span className="mx-1 flex gap-0.5 justify-self-end text-black/[62.5%] dark:text-white/70">
      {platform === "mac" ? (
        <abbr title="Command" className="no-underline">
          ⌘
        </abbr>
      ) : (
        <abbr title="Control" className="no-underline">
          Ctrl
        </abbr>
      )}
      <span className={cx(platform !== "mac" && "font-bold")}>K</span>
    </span>
  );
}

interface HeaderNavItemProps extends HeaderMenuItemProps {
  item: PageIndexDetail | SearchData[number];
  category?: string;
}

const HeaderNavItem = memo(
  forwardRef<any, HeaderNavItemProps>(function HeaderNavItem(
    { item, category, ...props },
    ref
  ) {
    category = category || ("category" in item ? item.category : undefined);
    if (!category) return null;
    const keywords = "keywords" in item ? item.keywords : null;
    const section = "section" in item ? item.section : null;
    const parentSection = "parentSection" in item ? item.parentSection : null;
    const nested = "nested" in item ? item.nested : false;
    const href = getItemHref(item, category);
    const description = keywords
      ? highlightValue(item.content, keywords)
      : item.content;
    const path = keywords
      ? [
          highlightValue(getCategoryTitle(category), keywords),
          highlightValue(item.group, keywords),
          section && highlightValue(item.title, keywords),
          highlightValue(parentSection, keywords),
          !nested && highlightValue(section, keywords),
        ]
      : undefined;
    return (
      <HeaderMenuItem
        ref={ref}
        title={nested ? section || item.title : item.title}
        description={description}
        value={href}
        href={href}
        path={path}
        nested={nested}
        thumbnail={getPageIcon(category, item.slug) || <span />}
        {...props}
      />
    );
  })
);

interface HeaderNavMenuProps {
  open?: boolean;
  setOpen?: (open: boolean) => void;
  category?: string;
  label?: ReactNode;
  contentLabel?: string;
  value?: string;
  footer?: boolean;
  shortcut?: boolean;
  children?: ReactNode;
  searchValue?: string;
  onBrowseAllPages?: (value: string) => void;
  size?: "sm" | "md" | "lg" | "xl";
  href?: string;
  hiddenOnMobile?: boolean;
  "aria-label"?: string;
}

const HeaderNavMenuContext = createContext(false);

const HeaderNavMenu = memo(
  ({
    open: openProp,
    setOpen: setOpenProp,
    category,
    label,
    contentLabel,
    value,
    footer,
    shortcut,
    children,
    searchValue: searchValueProp,
    onBrowseAllPages,
    size = "lg",
    href,
    hiddenOnMobile,
    "aria-label": ariaLabel,
  }: HeaderNavMenuProps) => {
    const isSubNav = useContext(HeaderNavMenuContext);
    const [_open, _setOpen] = useState(false);
    const open = openProp ?? _open;
    const setOpen = setOpenProp ?? _setOpen;
    const [searchValue, setSearchValue] = useState("");
    const hasSearchValue = !!searchValue;

    if (!open && searchValue) {
      setSearchValue("");
    }

    useSafeLayoutEffect(() => {
      if (searchValueProp) {
        setSearchValue(searchValueProp);
      }
    }, [searchValueProp]);

    const url = `/api/search?q=${searchValue}${
      category ? `&category=${category}` : ""
    }`;

    const options = {
      staleTime: process.env.NODE_ENV === "production" ? Infinity : 0,
      enabled: open && !!searchValue,
      keepPreviousData: open && !!searchValue,
    } satisfies UseQueryOptions<Data>;

    const { data, isFetching } = useQuery<Data>([url], queryFetch, options);

    const allUrl = `/api/search?q=${searchValue}`;
    const { data: allData, isFetching: allIsFetching } = useQuery<Data>(
      [allUrl],
      queryFetch,
      options
    );

    const loading = usePerceptibleValue(isFetching || allIsFetching, {
      delay: 250,
    });
    const searchData = useMemo(() => data && parseSearchData(data), [data]);
    const searchAllData = useMemo(
      () => (category && allData && parseSearchData(allData)) || undefined,
      [category, allData]
    );
    const noResults = !!searchData && !searchData.length;
    const pages = useMemo(() => {
      if (!category) return null;
      return pageIndex[category]?.filter((page) => !page.unlisted);
    }, [category]);
    const categoryTitle = category ? getCategoryTitle(category) : null;
    const hasTitle = !!category && !searchData?.length && !noResults;

    useEffect(() => {
      if (!noResults) return;
      const timer = setTimeout(() => {
        track("search-no-results", {
          searchValue,
          category: category || "all",
        });
      }, 500);
      return () => clearTimeout(timer);
    }, [noResults, searchValue, category]);

    const [items, groups] = useMemo(() => {
      if (searchData) {
        return [[], { [categoryTitle || "Search results"]: searchData }];
      }
      if (!pages) return [[], {}];
      const groups = groupBy(
        pages.map((page) => ({
          ...page,
          value: getItemHref(page),
        })) as typeof pages,
        "group"
      );
      const items = groups.null || [];
      delete groups.null;
      return [items, groups];
    }, [searchData, pages]);

    const onItemClick = useEvent((event: MouseEvent<HTMLAnchorElement>) => {
      if (!searchValue) return;
      if (!event.currentTarget.href) return;
      track("search-success", {
        searchValue,
        href: event.currentTarget.href,
      });
    });

    const itemElements = useMemo(() => {
      if (noResults) return null;
      if (!items.length && !Object.keys(groups).length) return null;
      const groupItems = Object.entries(groups).map(
        ([group, items]) =>
          ({
            group,
            items,
            itemSize: 96,
            paddingStart: 40,
          } satisfies SelectRendererItem)
      );
      return (
        <>
          {items?.map((item) => (
            <HeaderNavItem
              key={getItemKey(item)}
              autoFocus={hasSearchValue ? false : undefined}
              category={category}
              item={item}
              onClick={onItemClick}
            />
          ))}
          <SelectRenderer
            items={groupItems}
            role="presentation"
            className="bg-inherit"
          >
            {({ group, ...item }) => (
              <SelectRenderer
                key={group}
                {...item}
                render={<HeaderMenuGroup label={group} />}
              >
                {(item) => (
                  <HeaderNavItem
                    key={item.id}
                    id={item.id}
                    ref={item.ref}
                    style={item.style}
                    aria-posinset={item["aria-posinset"]}
                    aria-setsize={item["aria-setsize"]}
                    item={item}
                    onClick={onItemClick}
                    autoFocus={hasSearchValue ? false : undefined}
                  />
                )}
              </SelectRenderer>
            )}
          </SelectRenderer>
        </>
      );
    }, [
      noResults,
      items,
      groups,
      category,
      hasSearchValue,
      onItemClick,
      categoryTitle,
    ]);

    const otherItemElements = useMemo(() => {
      if (!searchAllData?.length) return null;
      return searchAllData
        .filter((item) => item.category !== category)
        .map((item) => (
          <HeaderNavItem
            key={getItemKey(item)}
            autoFocus={hasSearchValue ? false : undefined}
            item={item}
            onClick={onItemClick}
          />
        ));
    }, [searchAllData, hasSearchValue, category, onItemClick]);

    return (
      <HeaderNavMenuContext.Provider value={true}>
        <HeaderMenu
          aria-label={ariaLabel}
          href={href}
          className={hiddenOnMobile ? "hidden flex-none sm:block" : undefined}
          open={open}
          onToggle={setOpen}
          label={
            <>
              <span className="truncate">{label}</span>
              {shortcut && <Shortcut />}
            </>
          }
          contentLabel={contentLabel}
          loading={loading}
          searchPlaceholder={
            category ? searchTitles[category] : "Search all pages"
          }
          searchValue={searchValue}
          onSearch={setSearchValue}
          itemValue={category}
          value={value}
          hasTitle={hasTitle}
          size={
            searchData?.length || !!searchAllData?.length || noResults
              ? "xl"
              : size
          }
          autoSelect={!!searchData?.length}
          footer={
            !isSubNav &&
            footer && (
              <PopoverDismiss
                className={cx(
                  "grid grid-cols-[theme(spacing.14)_auto_theme(spacing.14)]",
                  "h-10 w-full items-center rounded p-2",
                  "bg-gray-150 dark:bg-gray-650",
                  "hover:bg-blue-200/40 dark:hover:bg-blue-600/25",
                  "active:bg-blue-200/70 dark:active:bg-blue-800/25",
                  "focus-visible:ariakit-outline-input"
                )}
                onClick={() => {
                  requestAnimationFrame(() => {
                    onBrowseAllPages?.(searchValue);
                  });
                }}
              >
                <PopoverDisclosureArrow placement="left" />
                <span className="text-center">
                  {searchValue ? "Search" : "Browse"} all pages
                </span>
                <Shortcut />
              </PopoverDismiss>
            )
          }
        >
          {hasTitle && (
            <div
              role="presentation"
              className="sticky top-14 z-20 bg-[color:inherit]"
            >
              <HeaderMenuItem
                value={category}
                href={`/${category}`}
                className="scroll-mt-0 justify-center font-medium"
              >
                {categoryTitle}
              </HeaderMenuItem>
              <HeaderMenuSeparator />
            </div>
          )}
          {itemElements || (!noResults && children)}
          {noResults && (
            <div
              role="presentation"
              className={cx(
                "p-10 text-center text-lg text-black/60 dark:text-white/50",
                !otherItemElements && "py-20"
              )}
            >
              <div className="truncate">
                No results for &quot;
                <span className="text-black dark:text-white">
                  {searchValue}
                </span>
                &quot;
              </div>
              {!!category && (
                <div>
                  in{" "}
                  <span className="text-black dark:text-white">{category}</span>
                </div>
              )}
            </div>
          )}
          {!!otherItemElements?.length && (
            <>
              <HeaderMenuSeparator />
              <HeaderMenuGroup label="Other results">
                {otherItemElements}
              </HeaderMenuGroup>
            </>
          )}
        </HeaderMenu>
      </HeaderNavMenuContext.Provider>
    );
  }
);

export function HeaderNav() {
  const pathname = usePathname() || "/";
  const [, category, page] = pathname.split("/");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const [categorySearchValue, setCategorySearchValue] = useState<string>();
  const categoryMeta = pageIndex[category as keyof typeof pageIndex];
  const pageMeta =
    page && categoryMeta
      ? categoryMeta.find(({ slug }) => slug === page)
      : null;

  useEffect(() => {
    if (categorySearchValue) {
      setCategorySearchValue(undefined);
    }
  }, [categorySearchValue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const value = category
          ? document.querySelector<HTMLInputElement>(
              `[role=combobox][placeholder='${searchTitles[category]}']`
            )?.value
          : "";
        if (categoryOpen) {
          setPageOpen(true);
          setCategoryOpen(false);
        } else if (pageOpen) {
          setCategorySearchValue(value);
          setCategoryOpen(true);
          setPageOpen(false);
        } else if (pageMeta) {
          setPageOpen(true);
        } else {
          setCategoryOpen(true);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [categoryOpen, pageOpen, category, pageMeta]);

  const categoryTitle = category ? getCategoryTitle(category) : "Browse";

  const categoryElements = useMemo(
    () =>
      getKeys(pageIndex).map((key) => {
        const pages = pageIndex[key];
        if (!pages) return null;
        return (
          <HeaderNavMenu
            key={key}
            href={`/${key}`}
            category={key}
            label={getCategoryTitle(key)}
          />
        );
      }),
    []
  );

  const children = useMemo(
    () => (
      <>
        {categoryElements}
        <HeaderMenuSeparator />
        <HeaderMenuItem href="https://github.com/ariakit/ariakit">
          GitHub
        </HeaderMenuItem>
        <HeaderMenuItem href="https://github.com/ariakit/ariakit/discussions">
          Discussions
        </HeaderMenuItem>
        <HeaderMenuItem href="https://newsletter.ariakit.org">
          Newsletter
        </HeaderMenuItem>
      </>
    ),
    [categoryElements]
  );

  const element = !!pageMeta && !!category;

  const onBrowseAllPages = useEvent((value: string) => {
    setCategorySearchValue(value);
    setCategoryOpen(true);
  });

  return (
    <>
      {
        <div
          className={cx(
            "font-semibold opacity-30",
            !!element && "hidden sm:block"
          )}
        >
          /
        </div>
      }
      <HeaderNavMenu
        key={element ? "category" : "page"}
        open={categoryOpen}
        setOpen={setCategoryOpen}
        shortcut={!element}
        label={categoryTitle}
        contentLabel="Pages"
        searchValue={categorySearchValue}
        value={category || undefined}
        size="sm"
        hiddenOnMobile={!!element}
        aria-label={category && "Current category"}
      >
        {children}
      </HeaderNavMenu>
      {element && <div className="font-semibold opacity-30">/</div>}
      {element && (
        <HeaderNavMenu
          key="page"
          open={pageOpen}
          setOpen={setPageOpen}
          category={category}
          footer
          shortcut
          onBrowseAllPages={onBrowseAllPages}
          label={pageMeta.title}
          contentLabel={categoryTitle}
          value={`/${category}/${page}`}
          aria-label="Current page"
        />
      )}
    </>
  );
}
