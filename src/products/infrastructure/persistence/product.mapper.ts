import { Product } from '../../domain/entities/product';
import { ProductEntity } from './product.entity';

export class ProductMapper {
  static toDomain(orm: ProductEntity): Product {
    const entity = new Product();
    entity.id = orm.id;
    entity.name = orm.name;
    entity.price = orm.price;
    entity.stock = orm.stock;
    entity.createdAt = orm.createdAt;
    entity.updatedAt = orm.updatedAt;
    return entity;
  }
}
