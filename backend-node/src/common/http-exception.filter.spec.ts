import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('preserves safe runtime diagnostics and removes sensitive fields', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/vue3/bind-api' }),
      }),
    } as unknown as ArgumentsHost;
    const filter = new HttpExceptionFilter();

    filter.catch(new BadRequestException({
      code: 'API_BINDING_RUNTIME_PREFLIGHT_FAILED',
      message: 'runtime blocked',
      runtimeGate: {
        status: 'BLOCK',
        issues: [{
          id: 'RUNTIME-009',
          message: 'page error',
          evidence: {
            errors: [{ message: 'boom', stack: 'private stack' }],
            token: 'private token',
          },
        }],
      },
      parameterIssues: [{
        api: 'flow.getTodayFlow',
        parameter: 'sectionNum',
        message: 'sectionNum is required',
        token: 'private token',
      }],
      internal: 'must not leak',
    }), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: 'runtime blocked',
      statusCode: 400,
      path: '/api/vue3/bind-api',
      code: 'API_BINDING_RUNTIME_PREFLIGHT_FAILED',
      runtimeGate: {
        status: 'BLOCK',
        issues: [{
          id: 'RUNTIME-009',
          message: 'page error',
          evidence: {
            errors: [{ message: 'boom' }],
          },
        }],
      },
      parameterIssues: [{
        api: 'flow.getTodayFlow',
        parameter: 'sectionNum',
        message: 'sectionNum is required',
      }],
    });
  });
});
