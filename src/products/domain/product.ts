import { GeoPoint, isValidGeoPoint } from '@/products/domain/geo';
import {
  InvalidProductCoordinatesError,
  InvalidProductNameError,
  NegativeProductPriceError,
} from '@/products/domain/product.errors';

export interface ProductProps {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  /** Optional coordinates of the product location, used for geo search. */
  coordinates?: GeoPoint;
  price: number;
  popularity: number;
  createdAt: Date;
}

/**
 * Product aggregate. Framework free and persistence agnostic: it is the shared
 * language between the write model (Postgres) and the read model (Elasticsearch).
 */
export class Product {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly subcategories: string[];
  readonly location: string;
  readonly coordinates?: GeoPoint;
  readonly price: number;
  readonly popularity: number;
  readonly createdAt: Date;

  private constructor(props: ProductProps) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.category = props.category;
    this.subcategories = props.subcategories;
    this.location = props.location;
    this.coordinates = props.coordinates;
    this.price = props.price;
    this.popularity = props.popularity;
    this.createdAt = props.createdAt;
  }

  static create(props: ProductProps): Product {
    if (!props.name?.trim()) {
      throw new InvalidProductNameError();
    }
    if (props.price < 0) {
      throw new NegativeProductPriceError();
    }
    if (props.coordinates && !isValidGeoPoint(props.coordinates)) {
      throw new InvalidProductCoordinatesError();
    }
    return new Product({
      ...props,
      subcategories: props.subcategories ?? [],
      popularity: props.popularity ?? 0,
    });
  }

  toPrimitives(): ProductProps {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      subcategories: this.subcategories,
      location: this.location,
      coordinates: this.coordinates,
      price: this.price,
      popularity: this.popularity,
      createdAt: this.createdAt,
    };
  }
}
