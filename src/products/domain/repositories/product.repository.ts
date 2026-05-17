import { Product } from '../entities/product';

export interface CreateProductData {
  name: string;
  price: number;
  stock: number;
}

export interface UpdateProductData {
  price?: number;
  stock?: number;
}

export abstract class ProductRepository {
  abstract findAll(): Promise<Product[]>;
  abstract findById(id: number): Promise<Product | null>;
  abstract create(data: CreateProductData): Promise<Product>;
  abstract createMany(products: CreateProductData[]): Promise<Product[]>;
  abstract update(id: number, data: UpdateProductData): Promise<Product>;
  abstract delete(id: number): Promise<void>;
}
