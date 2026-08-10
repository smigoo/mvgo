import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PermissionAdapter } from './permission-adapter.interface';
export declare class AuthController {
    private readonly authService;
    private readonly permissionAdapter;
    constructor(authService: AuthService, permissionAdapter: PermissionAdapter);
    register(registerDto: RegisterDto): Promise<{
        success: boolean;
        message: string;
        user: {
            id: string;
            username: string;
            email: string;
        };
    }>;
    login(loginDto: LoginDto, session: Record<string, any>): Promise<unknown>;
    logout(session: Record<string, any>): Promise<unknown>;
    getCurrentUser(session: Record<string, any>): Promise<{
        success: boolean;
        user?: undefined;
        group?: undefined;
        role?: undefined;
        permissions?: undefined;
    } | {
        success: boolean;
        user: {
            id: string;
            username: string;
            email: string;
        };
        group: {
            id: any;
            name: string;
        } | null;
        role: string;
        permissions: string[];
    }>;
    changePassword(body: {
        username: string;
        oldPassword: string;
        newPassword: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
