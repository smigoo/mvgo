export declare abstract class PermissionAdapter {
    abstract checkPermission(userId: string, permCode: string): Promise<boolean>;
    abstract getUserPermissions(userId: string): Promise<{
        role: string;
        permissions: string[];
    }>;
}
