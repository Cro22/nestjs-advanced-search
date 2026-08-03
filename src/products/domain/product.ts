import { GeoPoint, isValidGeoPoint } from '@/products/domain/geo';
import {
  InvalidProductCoordinatesError,
  InvalidProductNameError,
  NegativeProductPriceError,
} from '@/products/domain/product.errors';
import { Money } from '@/shared/domain/money';

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
  /** Encapsulated as a Money value object; the props carry a plain decimal. */
  readonly price: Money;
  readonly popularity: number;
  readonly createdAt: Date;

  private constructor(props: ProductProps) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.category = props.category;
    // Copy the reference types on the way in so a caller that keeps and mutates
    // the source array/object cannot reach into the aggregate's state.
    this.subcategories = [...props.subcategories];
    this.location = props.location;
    this.coordinates = props.coordinates ? { ...props.coordinates } : undefined;
    this.price = Money.fromDecimal(props.price);
    this.popularity = props.popularity;
    this.createdAt = new Date(props.createdAt);
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
    // Copy the reference types on the way out too, so the returned snapshot can
    // never be used to mutate the aggregate.
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      subcategories: [...this.subcategories],
      location: this.location,
      coordinates: this.coordinates ? { ...this.coordinates } : undefined,
      price: this.price.toDecimal(),
      popularity: this.popularity,
      createdAt: new Date(this.createdAt),
    };
  }
}
