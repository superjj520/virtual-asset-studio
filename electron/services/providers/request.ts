export const fetchProvider = async (
  provider: string,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 120_000,
): Promise<Response> => {
  const controller = new AbortController();
  const parentSignal = init.signal;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const originalJson = typeof response.json === 'function' ? response.json.bind(response) : undefined;
    const originalText = typeof response.text === 'function' ? response.text.bind(response) : undefined;
    const originalArrayBuffer = typeof response.arrayBuffer === 'function' ? response.arrayBuffer.bind(response) : undefined;
    const withBodyTimeout = <T>(read: () => Promise<T>): Promise<T> => {
      let bodyTimer: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<T>((_, reject) => {
        bodyTimer = setTimeout(() => {
          controller.abort();
          reject(new Error(`${provider} 响应内容读取超时（${Math.round(timeoutMs / 1000)} 秒），任务状态已保留，请稍后查询或重试。`));
        }, timeoutMs);
      });
      return Promise.race([read().catch((error) => {
        if (controller.signal.aborted)
          throw new Error(`${provider} 响应内容读取超时（${Math.round(timeoutMs / 1000)} 秒），任务状态已保留，请稍后查询或重试。`);
        throw error;
      }), timeoutPromise]).finally(() => clearTimeout(bodyTimer));
    };
    const methods: PropertyDescriptorMap = {};
    if (originalJson) methods.json = { configurable: true, value: () => withBodyTimeout(originalJson) };
    if (originalText) methods.text = { configurable: true, value: () => withBodyTimeout(originalText) };
    if (originalArrayBuffer) methods.arrayBuffer = { configurable: true, value: () => withBodyTimeout(originalArrayBuffer) };
    Object.defineProperties(response, methods);
    return response;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(`${provider} 请求超时（${Math.round(timeoutMs / 1000)} 秒），任务状态已保留，请稍后查询或重试。`);
    throw new Error(`${provider} 网络请求失败：未能连接服务，请检查网络或代理设置。`);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
};
