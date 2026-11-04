import { ProgressService } from '../progress/progress.service';
import { TasksService } from '../tasks/tasks.service';
interface CanvasConfig {
    width: number;
    height: number;
    aspectRatioLocked: boolean;
    aspectRatio: number;
    outputScaleMode: 'fluid' | 'hybrid' | 'contain' | 'fillWidth' | 'fillHeight' | 'none';
    backgroundColor: string;
    backgroundImage?: string;
    showGrid: boolean;
    gridSize: number;
    snapToGrid: boolean;
    editorZoom: number;
}
interface GridComponent {
    id: string;
    componentName: string;
    layout: {
        x: number;
        y: number;
        w: number;
        h: number;
        minW: number;
        maxW: number;
        minH: number;
        maxH: number;
        static: boolean;
    };
    props: Record<string, unknown>;
}
interface HeaderFooterConfig {
    enabled: boolean;
    height: string;
    backgroundColor?: string;
    innerLayout: 'grid';
    gridCols: number;
    components: GridComponent[];
}
interface FlexConfig {
    direction: 'row' | 'column';
    gap: string;
    wrap: boolean;
    justify: string;
    align: string;
}
interface ZoneConfig {
    id: string;
    colIndex: number;
    contentAlign: {
        vertical: 'top' | 'center' | 'bottom' | 'stretch';
        horizontal: 'left' | 'center' | 'right' | 'stretch';
    };
    padding: {
        top: string;
        right: string;
        bottom: string;
        left: string;
    };
    zIndex: 'bottom' | 'middle';
    offset: {
        left: string;
        right: string;
    };
    layoutMode: 'grid' | 'flex';
    contentType: 'components' | 'zones';
    gridConfig: {
        cols: number;
        rowHeight: number;
        components: GridComponent[];
    };
    flexConfig: FlexConfig;
    children?: ZoneConfig[];
}
interface ColumnConfig {
    id: string;
    width: string;
    resizable: boolean;
    collapsible: boolean;
    defaultCollapsed: boolean;
    collapsedWidth: string;
}
interface BodyConfig {
    columns: ColumnConfig[];
    zones: ZoneConfig[];
}
interface ScreenLayout {
    id: string;
    name: string;
    canvas: CanvasConfig;
    header: HeaderFooterConfig | null;
    body: BodyConfig;
    footer: HeaderFooterConfig | null;
}
export declare class ScreenLayoutService {
    private readonly progressService;
    private readonly tasksService;
    private readonly logger;
    constructor(progressService: ProgressService, tasksService: TasksService);
    generateZip(layout: ScreenLayout): Promise<Buffer>;
    analyzeSpatial(layout: ScreenLayout): Promise<any>;
    startResponsiveGeneration(sessionId: string, layout: ScreenLayout, userId?: string): void;
    getGeneratedZip(sessionId: string): Promise<Buffer | null>;
    private _generationResults?;
    private static readonly RESULT_TTL_MS;
    private _setGenerationResult;
    private _getGenerationResult;
    private _runGenerationWorkflow;
}
export {};
