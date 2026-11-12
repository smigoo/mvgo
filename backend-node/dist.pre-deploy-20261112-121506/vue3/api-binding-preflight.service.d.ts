declare const ALLOWED_BARE_MODULES: Set<string>;
export declare class ApiBindingPreflightService {
    validate(componentDir: string): void;
    private resolveEntryPath;
    private resolveApiDir;
    private validateSfc;
    private validateModule;
    private validateImports;
    private moduleExists;
    private walk;
}
export { ALLOWED_BARE_MODULES };
