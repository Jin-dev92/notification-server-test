import { Injectable } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
import { ProductRepository } from '../../domain/repositories/product.repository';

@Injectable()
export class GetProductsUseCase {
  constructor(private readonly repo: ProductRepository) {}

  execute(): Promise<Product[]> {
    return this.repo.findAll();
  }
}
