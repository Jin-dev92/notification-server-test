import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from '../../domain/entities/product';
import {
  CreateProductData,
  ProductRepository,
  UpdateProductData,
} from '../../domain/repositories/product.repository';

@Injectable()
export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  findAll(): Promise<Product[]> {
    return this.productRepository.findAll();
  }

  async findById(id: number): Promise<Product> {
    const product = await this.productRepository.findById(id);
    if (!product) throw new NotFoundException(`Product ${id} not found`);
    return product;
  }

  create(data: CreateProductData): Promise<Product> {
    return this.productRepository.create(data);
  }

  update(id: number, data: UpdateProductData): Promise<Product> {
    return this.productRepository.update(id, data);
  }

  delete(id: number): Promise<void> {
    return this.productRepository.delete(id);
  }
}
