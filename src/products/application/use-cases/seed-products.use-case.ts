import { Injectable } from '@nestjs/common';
import { ProductRepository } from '../../domain/repositories/product.repository';

@Injectable()
export class SeedProductsUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(count: number): Promise<{ count: number }> {
    const products = Array.from({ length: count }, (_, i) => ({
      name: `Product-${i + 1}`,
      price: Math.floor(Math.random() * 1000) + 1,
      stock: Math.floor(Math.random() * 101),
    }));

    await this.repo.createMany(products);
    return { count };
  }
}
