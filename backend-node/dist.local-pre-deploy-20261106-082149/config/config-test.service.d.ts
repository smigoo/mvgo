export interface TestResult {
    success: boolean;
    error?: string;
    detail?: string;
    latency?: number;
    expectedDigits?: string;
}
interface LLMTestOptions {
    apiKey: string;
    baseURL: string;
    model: string;
    temperature?: number;
    timeoutMs?: number;
    providerType?: string;
    outputTokens?: number;
    thinkingType?: string;
}
interface VisionTestOptions extends LLMTestOptions {
}
interface FigmaTestOptions {
    token: string;
    timeoutMs?: number;
}
interface ApifoxTestOptions {
    token: string;
    timeoutMs?: number;
}
export declare class ConfigTestService {
    private readonly logger;
    testTextLLM(opts: LLMTestOptions): Promise<TestResult>;
    private testAnthropicText;
    testVisionLLM(opts: VisionTestOptions): Promise<TestResult>;
    private testAnthropicVision;
    testReasoningLLM(opts: LLMTestOptions): Promise<TestResult>;
    testModelCapability(opts: LLMTestOptions): Promise<{
        text: TestResult;
        vision: TestResult;
        reasoning: TestResult;
    }>;
    testFigmaToken(opts: FigmaTestOptions): Promise<TestResult>;
    testApifoxToken(opts: ApifoxTestOptions): Promise<TestResult>;
    testGitlabToken(opts: {
        token: string;
        timeoutMs?: number;
    }): Promise<TestResult>;
    private classifyHTTPError;
    private isVisionNotSupportedError;
}
export {};
