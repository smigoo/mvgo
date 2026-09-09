declare module 'microvideo-request' {
  interface RequestInstance {
    setParameters(params: any): RequestInstance
    post(url: string): Promise<any>
    get(url: string): Promise<any>
    put(url: string): Promise<any>
    delete(url: string): Promise<any>
  }

  export function createRequest(serviceName?: string, timeout?: number): RequestInstance
  export function setRequestConfig(config: any): void
  export function setInterceptor(interceptor: any): void
}
