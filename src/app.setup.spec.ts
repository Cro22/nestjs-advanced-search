import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { configureApp } from '@/app.setup';
import { AllExceptionsFilter } from '@/shared/infrastructure/http/all-exceptions.filter';

function setup(env: string, origins: string[]) {
  const app = {
    setGlobalPrefix: jest.fn(),
    use: jest.fn(),
    enableCors: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
    enableShutdownHooks: jest.fn(),
  };
  const values: Record<string, unknown> = {
    apiPrefix: 'v1',
    env,
    'cors.origins': origins,
  };
  const config = {
    get: jest.fn((key: string, fallback: unknown) => values[key] ?? fallback),
  };

  configureApp(app as unknown as INestApplication, config as unknown as ConfigService);
  return app;
}

describe('configureApp', () => {
  it('installs the shared HTTP pipeline and permissive development CORS', () => {
    const app = setup('development', []);

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('v1');
    expect(app.use).toHaveBeenCalledTimes(2);
    expect(app.enableCors).toHaveBeenCalledWith();
    expect(app.useGlobalPipes.mock.calls[0][0]).toBeInstanceOf(ValidationPipe);
    expect(app.useGlobalFilters.mock.calls[0][0]).toBeInstanceOf(AllExceptionsFilter);
    expect(app.enableShutdownHooks).toHaveBeenCalled();
  });

  it('restricts CORS to configured origins', () => {
    const origins = ['https://app.example'];
    const app = setup('production', origins);

    expect(app.enableCors).toHaveBeenCalledWith({ origin: origins });
  });

  it('leaves CORS disabled by default in production', () => {
    const app = setup('production', []);

    expect(app.enableCors).not.toHaveBeenCalled();
  });
});
