import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createTestApp } from './create-test-app';

/**
 * Builds the OpenAPI document from the real application so a broken @ApiResponse
 * or response DTO is caught here rather than only at runtime in main.ts.
 */
describe('OpenAPI document (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates product paths, response schemas and security', () => {
    const config = new DocumentBuilder()
      .setTitle('Advanced Product Search API')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'api-key')
      .build();
    const doc = SwaggerModule.createDocument(app, config);

    const paths = Object.keys(doc.paths);
    const searchPath = paths.find((p) => p.endsWith('products/search'));
    const productsPath = paths.find((p) => p.endsWith('/products'));
    expect(searchPath).toBeDefined();
    expect(productsPath).toBeDefined();

    // Search documents its 200 and error responses.
    const search = doc.paths[searchPath as string].get;
    expect(search?.responses['200']).toBeDefined();
    expect(search?.responses['400']).toBeDefined();
    expect(search?.responses['503']).toBeDefined();

    // Writes declare the bearer security requirement.
    const create = doc.paths[productsPath as string].post;
    expect(create?.responses['201']).toBeDefined();
    expect(create?.security).toEqual([{ 'api-key': [] }]);

    // Response DTOs are registered as component schemas.
    const schemas = doc.components?.schemas ?? {};
    expect(schemas.SearchResponseDto).toBeDefined();
    expect(schemas.ProductResponseDto).toBeDefined();
    expect(schemas.ErrorResponseDto).toBeDefined();
  });
});
