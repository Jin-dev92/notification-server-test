import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';
import { ProductService } from './product.service';

const PRODUCT_ID = 1;

function createMockProduct(overrides?: Partial<Product>): Product {
  const p = new Product();
  p.id = PRODUCT_ID;
  p.name = '테스트 상품';
  p.price = 10000;
  p.stock = 100;
  p.createdAt = new Date('2026-01-01T00:00:00.000Z');
  p.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  Object.assign(p, overrides);
  return p;
}

describe('ProductService', () => {
  let service: ProductService;
  let productRepository: jest.Mocked<ProductRepository>;

  beforeEach(async () => {
    productRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: productRepository },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('모든 상품을 반환한다', async () => {
      const products = [createMockProduct(), createMockProduct({ id: 2 })];
      productRepository.findAll.mockResolvedValue(products);

      const result = await service.findAll();

      expect(result).toEqual(products);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(productRepository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('존재하는 id로 조회하면 상품을 반환한다', async () => {
      const product = createMockProduct();
      productRepository.findById.mockResolvedValue(product);

      const result = await service.findById(PRODUCT_ID);

      expect(result).toEqual(product);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(productRepository.findById).toHaveBeenCalledWith(PRODUCT_ID);
    });

    it('존재하지 않는 id로 조회하면 NotFoundException을 던진다', async () => {
      productRepository.findById.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('생성 데이터를 repository에 위임하고 생성된 상품을 반환한다', async () => {
      const data = { name: '새 상품', price: 5000, stock: 50 };
      const created = createMockProduct(data);
      productRepository.create.mockResolvedValue(created);

      const result = await service.create(data);

      expect(result).toEqual(created);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(productRepository.create).toHaveBeenCalledWith(data);
    });
  });

  describe('update', () => {
    it('수정 데이터를 repository에 위임하고 수정된 상품을 반환한다', async () => {
      const data = { price: 15000, stock: 200 };
      const updated = createMockProduct(data);
      productRepository.update.mockResolvedValue(updated);

      const result = await service.update(PRODUCT_ID, data);

      expect(result).toEqual(updated);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(productRepository.update).toHaveBeenCalledWith(PRODUCT_ID, data);
    });
  });

  describe('delete', () => {
    it('id를 repository에 위임해 삭제한다', async () => {
      productRepository.delete.mockResolvedValue(undefined);

      await service.delete(PRODUCT_ID);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(productRepository.delete).toHaveBeenCalledWith(PRODUCT_ID);
    });
  });
});
