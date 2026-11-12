export declare class MeetingStore {
    readonly root: string;
    constructor(root?: string);
    path(name: string): string;
    read<T>(name: string, fallback: T): T;
    write<T>(name: string, value: T): void;
}
