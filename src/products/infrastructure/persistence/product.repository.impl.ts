import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../domain/entities/product';
import {
  CreateProductData,
  ProductRepository,
  UpdateProductData,
} from '../../domain/repositories/product.repository';
import { ProductEntity } from './product.entity';
import { ProductMapper } from './product.mapper';

@Injectable()
export class ProductRepositoryImpl extends ProductRepository {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
  ) {
    super();
  }

  async findAll(): Promise<Product[]> {
    const orms = await this.repo.find({ order: { id: 'ASC' } });
    return orms.map((orm) => ProductMapper.toDomain(orm));
  }

  async findById(id: number): Promise<Product | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? ProductMapper.toDomain(orm) : null;
  }

  async update(id: number, data: UpdateProductData): Promise<Product> {
    await this.repo.update(id, data);
    const orm = await this.repo.findOne({ where: { id } });
    if (!orm) throw new NotFoundException(`Product ${id} not found`);
    return ProductMapper.toDomain(orm);
  }

  async createMany(products: CreateProductData[]): Promise<Product[]> {
    const orms = this.repo.create(products);
    const saved = await this.repo.save(orms);
    return saved.map((orm) => ProductMapper.toDomain(orm));
  }
}
