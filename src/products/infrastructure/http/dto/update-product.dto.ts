import { CreateProductDto } from '@/products/infrastructure/http/dto/create-product.dto';

/**
 * PUT is a full replacement, so it accepts the same fields as create. A distinct
 * type makes the update semantics explicit at the call site and gives the two
 * endpoints room to diverge later (different validation, partial updates) without
 * coupling them through a shared DTO.
 */
export class UpdateProductDto extends CreateProductDto {}
