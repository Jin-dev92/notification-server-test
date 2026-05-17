import { Test, TestingModule } from '@nestjs/testing';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { GetProductsUseCase } from './get-products.use-case';

function createMockProduct(id: number): Product {
  const p = new Product();
  p.id = id;
  p.name = `상품 ${id}`;
  p.price = 1000 * id;
  p.stock = 100;
  p.createdAt = new Date('2026-01-01T00:00:00.000Z');
  p.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return p;
}

describe('GetProductsUseCase', () => {
  let useCase: GetProductsUseCase;
  let repo: jest.Mocked<ProductRepository>;

  beforeEach(async () => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetProductsUseCase,
        { provide: ProductRepository, useValue: repo },
      ],
    }).compile();

    useCase = module.get(GetProductsUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('repository의 모든 상품을 반환한다', async () => {
    const products = [createMockProduct(1), createMockProduct(2)];
    repo.findAll.mockResolvedValue(products);

    const result = await useCase.execute();

    expect(result).toEqual(products);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });

  it('상품이 없으면 빈 배열을 반환한다', async () => {
    repo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
