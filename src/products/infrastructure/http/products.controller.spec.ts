import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsController } from '@/products/infrastructure/http/products.controller';
import { Product } from '@/products/domain/product';
import { InvalidProductNameError, ProductNotFoundError } from '@/products/domain/product.errors';
import {
  InvalidSearchQueryError,
  SearchUnavailableError,
} from '@/products/domain/search/search.errors';
import { ProductSearchResult } from '@/products/domain/search/search-result';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';
import { CreateProductDto } from '@/products/infrastructure/http/dto/create-product.dto';

function buildProduct(): Product {
  return Product.create({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Aurora',
    description: 'A laptop',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    price: 100,
    popularity: 3,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

const emptyResult: ProductSearchResult = {
  hits: [],
  total: 0,
  page: 1,
  pageSize: 20,
  facets: { categories: [], subcategories: [], locations: [], price: null },
  suggestions: [],
  nextCursor: null,
};

const validBody: CreateProductDto = {
  name: 'Aurora',
  description: 'A laptop',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Madrid',
  price: 100,
};

describe('ProductsController', () => {
  let searchProducts: { execute: jest.Mock };
  let autocomplete: { execute: jest.Mock };
  let createProduct: { execute: jest.Mock };
  let updateProduct: { execute: jest.Mock };
  let deleteProduct: { execute: jest.Mock };
  let recordView: { execute: jest.Mock };
  let controller: ProductsController;

  beforeEach(() => {
    searchProducts = { execute: jest.fn() };
    autocomplete = { execute: jest.fn() };
    createProduct = { execute: jest.fn() };
    updateProduct = { execute: jest.fn() };
    deleteProduct = { execute: jest.fn() };
    recordView = { execute: jest.fn() };
    const config = {
      get: jest.fn((key: string, def: unknown) =>
        key === 'search.maxPageSize' ? 100 : key === 'search.autocompleteMaxSuggestions' ? 10 : def,
      ),
    } as unknown as ConfigService;
    controller = new ProductsController(
      searchProducts as never,
      autocomplete as never,
      createProduct as never,
      updateProduct as never,
      deleteProduct as never,
      recordView as never,
      config,
    );
  });

  describe('search', () => {
    it('maps the use case result into the HTTP response', async () => {
      searchProducts.execute.mockResolvedValue(emptyResult);
      const res = await controller.search({} as SearchProductsQueryDto);
      expect(res.meta.total).toBe(0);
    });

    it('translates an invalid query into 400', async () => {
      searchProducts.execute.mockRejectedValue(new InvalidSearchQueryError('bad'));
      await expect(controller.search({} as SearchProductsQueryDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('translates a backend outage into 503', async () => {
      searchProducts.execute.mockRejectedValue(new SearchUnavailableError());
      await expect(controller.search({} as SearchProductsQueryDto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('autocomplete', () => {
    it('clamps the limit to the configured maximum', async () => {
      autocomplete.execute.mockResolvedValue(['a', 'b']);
      const res = await controller.autocompleteSuggestions({ q: 'au', limit: 999 } as never);
      expect(res).toEqual({ suggestions: ['a', 'b'] });
      expect(autocomplete.execute).toHaveBeenCalledWith({ prefix: 'au', limit: 10 });
    });
  });

  describe('create', () => {
    it('returns the created product', async () => {
      createProduct.execute.mockResolvedValue(buildProduct());
      const res = await controller.create(validBody);
      expect(res.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(res.popularity).toBe(3);
    });

    it('rejects a half specified coordinate pair with 400', async () => {
      await expect(controller.create({ ...validBody, latitude: 40 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(createProduct.execute).not.toHaveBeenCalled();
    });

    it('maps a domain invariant error to 400', async () => {
      createProduct.execute.mockRejectedValue(new InvalidProductNameError());
      await expect(controller.create(validBody)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('maps a missing product to 404', async () => {
      updateProduct.execute.mockRejectedValue(new ProductNotFoundError('x'));
      await expect(controller.update('x', validBody)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a half specified coordinate pair with 400', async () => {
      await expect(controller.update('x', { ...validBody, longitude: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('delegates to the delete use case', async () => {
      deleteProduct.execute.mockResolvedValue(undefined);
      await controller.remove('11111111-1111-4111-8111-111111111111');
      expect(deleteProduct.execute).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    });

    it('maps a missing product to 404', async () => {
      deleteProduct.execute.mockRejectedValue(new ProductNotFoundError('x'));
      await expect(controller.remove('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('view', () => {
    it('returns the new popularity', async () => {
      recordView.execute.mockResolvedValue(buildProduct());
      const res = await controller.view('11111111-1111-4111-8111-111111111111');
      expect(res).toEqual({ id: '11111111-1111-4111-8111-111111111111', popularity: 3 });
    });

    it('maps a missing product to 404', async () => {
      recordView.execute.mockRejectedValue(new ProductNotFoundError('x'));
      await expect(controller.view('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
