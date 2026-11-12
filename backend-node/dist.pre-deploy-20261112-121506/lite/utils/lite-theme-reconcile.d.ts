export declare const THEME_LUM_DARK_MAX = 0.45;
export declare const THEME_LUM_LIGHT_MIN = 0.55;
export declare const PERCEIVED_LUM_WEIGHTS: {
    readonly r: 0.299;
    readonly g: 0.587;
    readonly b: 0.114;
};
export declare const THEME_BASELINE: {
    readonly light: {
        readonly background: "#F5F8FC";
        readonly surface: "#FFFFFF";
        readonly text: "#1F2329";
        readonly border: "#E5E6EB";
    };
    readonly dark: {
        readonly background: "#1A1A2E";
        readonly surface: "#2D2D3F";
        readonly text: "#FFFFFF";
        readonly border: "#3A3A4E";
    };
};
export type LiteTheme = 'light' | 'dark';
export interface ThemeConflict {
    field: string;
    from: string;
    to: string;
}
export type ReconcileReason = 'not-applicable' | 'no-conflict' | 'reconciled';
export interface ReconcileResult {
    brief: any;
    applied: boolean;
    reason: ReconcileReason;
    conflicts: ThemeConflict[];
}
export declare function perceivedLuminance(color: unknown): number | null;
export declare function reconcileBriefTheme(brief: any, theme: unknown): ReconcileResult;
