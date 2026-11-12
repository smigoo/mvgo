export declare const LITE_THEME_SLOTS: string[];
type Palette = {
    topPrimary?: string | null;
    topText?: string | null;
    topBg?: string | null;
};
export type LiteThemeEntry = {
    key: string;
    name: string;
    brightness: 'light' | 'dark';
    palette: Palette;
    panelType?: string | null;
};
export type LiteThemeListItem = {
    name: string;
    key: string;
    brightness: 'light' | 'dark';
    isTruth: boolean;
    legacyName?: string;
    order: number;
    panelType?: string;
};
export declare function buildLiteThemeSlots(palette?: Palette, brightness?: 'light' | 'dark'): {
    colorTextBase: string;
    colorTextInverse: string;
    colorBgPanel: string;
    colorPrimary: string;
    colorSecondary: string;
    colorDanger: string;
    colorBorder: string;
};
export declare function assembleLiteThemes(themes?: LiteThemeEntry[]): {
    list: LiteThemeListItem[];
    slots: Record<string, Record<string, string>>;
    degraded: {
        key: string;
        name: string;
        missing: string[];
    }[];
};
export declare function expandThemeVarsLess(themeVarsLess: string, slots?: Record<string, Record<string, string>>, list?: LiteThemeListItem[]): string;
export {};
